import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPlan, readEnv, startApplication } from './dev.mjs';

test('reads quoted secrets and inline comments without changing literal hashes', () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'assistant-launcher-'));
  try {
    const file = path.join(folder, '.env');
    writeFileSync(file, 'LIVEKIT_URL="wss://example.livekit.cloud"\nVOICE_AGENT_TOKEN="literal#value"\nVOICE_LLM=app # explanation\nexport API_PORT=8000\n');
    assert.deepEqual(readEnv(file), { LIVEKIT_URL: 'wss://example.livekit.cloud', VOICE_AGENT_TOKEN: 'literal#value', VOICE_LLM: 'app', API_PORT: '8000' });
  } finally { rmSync(folder, { recursive: true }); }
});

test('unconfigured app starts web and API without a speech worker', () => {
  const plan = buildPlan({}, {}, {});
  assert.equal(plan.configured, false);
  assert.deepEqual(plan.services.map((s) => s.name), ['api', 'web']);
});

test('API settings configure worker automatically with one shared token', () => {
  const plan = buildPlan({ API_PORT: '18000', WEB_PORT: '13000' }, {
    LIVEKIT_URL: 'wss://example.livekit.cloud', LIVEKIT_API_KEY: 'test-key',
    LIVEKIT_API_SECRET: 'test-secret', VOICE_AGENT_TOKEN: 'shared',
  }, { VOICE_STT_LANGUAGE: 'ur', LIVEKIT_API_KEY: '' });
  assert.deepEqual(plan.services.map((s) => s.name), ['api', 'web', 'voice']);
  assert.equal(plan.services[2].env.LIVEKIT_API_KEY, 'test-key');
  assert.equal(plan.services[2].env.VOICE_AGENT_TOKEN, 'shared');
  assert.equal(plan.services[2].env.VOICE_STT_LANGUAGE, 'ur');
  assert.equal(plan.services[2].env.API_URL, 'http://127.0.0.1:18000');
  assert.equal(plan.services[1].env.LIVEKIT_API_SECRET, undefined);
});

test('rejects inconsistent configuration without exposing secret values', () => {
  assert.throws(() => buildPlan({}, { LIVEKIT_API_SECRET: 'first-secret' }, { LIVEKIT_API_SECRET: 'second-secret' }), {
    message: 'LIVEKIT_API_SECRET differs between api/.env and agent/.env. Use one shared value in api/.env.',
  });
  assert.throws(() => buildPlan({ API_PORT: 'invalid' }, {}, {}), /valid ports/);
  assert.throws(() => buildPlan({ API_PORT: '3000' }, {}, {}), /different/);
});

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function ready(port) {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) })).ok) return; }
    catch { /* Starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Fixture on ${port} did not start`);
}

test('starts all services and removes worker descendants on shutdown', async () => {
  const apiPort = await freePort();
  const webPort = await freePort();
  const voicePort = await freePort();
  const fixture = (port) => `require('node:http').createServer((q,s)=>{s.end('ok')}).listen(${port},'127.0.0.1')`;
  const plan = {
    configured: true, apiUrl: `http://127.0.0.1:${apiPort}`, webPort,
    services: [
      { name: 'api', command: process.execPath, args: ['-e', fixture(apiPort)], env: process.env, port: apiPort },
      { name: 'web', command: process.execPath, args: ['-e', fixture(webPort)], env: process.env, port: webPort },
      { name: 'voice', command: process.execPath, args: ['-e', `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(fixture(voicePort))}],{windowsHide:true});setInterval(()=>{},1000)`], env: process.env },
    ],
  };
  const stop = await startApplication(plan);
  try { await ready(webPort); await ready(voicePort); }
  finally { await stop(); }
  for (const port of [apiPort, webPort, voicePort]) {
    const server = net.createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    await new Promise((resolve) => server.close(resolve));
  }
});

test('voice worker failure leaves typed chat and sentiment services running', async () => {
  const apiPort = await freePort();
  const webPort = await freePort();
  const fixture = (port) => `require('node:http').createServer((q,s)=>{s.end('ok')}).listen(${port},'127.0.0.1')`;
  const stop = await startApplication({
    configured: true, apiUrl: `http://127.0.0.1:${apiPort}`, webPort,
    services: [
      { name: 'api', command: process.execPath, args: ['-e', fixture(apiPort)], env: process.env, port: apiPort },
      { name: 'web', command: process.execPath, args: ['-e', fixture(webPort)], env: process.env, port: webPort },
      { name: 'voice', command: process.execPath, args: ['-e', 'process.exit(1)'], env: process.env },
    ],
  });
  try {
    await ready(webPort);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal((await fetch(`http://127.0.0.1:${apiPort}/api/health`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${webPort}`)).status, 200);
  } finally { await stop(); }
});
