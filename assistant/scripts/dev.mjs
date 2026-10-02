import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';

export function readEnv(file) {
  if (!existsSync(file)) return {};
  const result = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    result[match[1]] = value;
  }
  return result;
}

export function buildPlan(env = process.env, apiFile = readEnv(path.join(root, 'api/.env')), agentFile = readEnv(path.join(root, 'agent/.env'))) {
  const apiEnv = { ...apiFile, ...env };
  const agentEnv = { ...apiFile, ...agentFile, ...env };
  const shared = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'VOICE_AGENT_NAME', 'VOICE_AGENT_TOKEN'];
  for (const key of shared) {
    const apiValue = apiEnv[key] || agentEnv[key];
    const agentValue = agentEnv[key] || apiEnv[key];
    if (apiValue && agentValue && apiValue !== agentValue) {
      throw new Error(`${key} differs between api/.env and agent/.env. Use one shared value in api/.env.`);
    }
    if (apiValue) apiEnv[key] = agentEnv[key] = apiValue;
  }
  const apiPort = Number(env.API_PORT || 8000);
  const webPort = Number(env.WEB_PORT || 3000);
  for (const port of [apiPort, webPort]) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT and WEB_PORT must be valid ports.');
  }
  if (apiPort === webPort) throw new Error('API_PORT and WEB_PORT must be different.');
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const python = (name) => path.join(root, name, '.venv', windows ? 'Scripts/python.exe' : 'bin/python');
  const configured = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'].every((key) => !!apiEnv[key]);
  const services = [
    { name: 'api', command: python('api'), args: ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(apiPort)], cwd: path.join(root, 'api'), env: { ...apiEnv, PYTHONUNBUFFERED: '1' }, port: apiPort },
    { name: 'web', command: process.execPath, args: [path.join(root, 'web/node_modules/next/dist/bin/next'), 'dev', '--port', String(webPort)], requiredFiles: [path.join(root, 'web/node_modules/next/dist/bin/next')], cwd: path.join(root, 'web'), env: { ...env, API_URL: apiUrl }, port: webPort },
  ];
  if (configured) services.push({ name: 'voice', command: python('agent'), args: ['voice_agent.py', 'dev'], cwd: path.join(root, 'agent'), env: { ...agentEnv, API_URL: apiUrl, VOICE_LLM: 'app', PYTHONUNBUFFERED: '1' } });
  return { services, configured, apiUrl, webPort };
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Port ${port} is already in use. Stop the old instance or set API_PORT/WEB_PORT.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

async function waitForApi(url, isStopping) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline && !isStopping()) {
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch { /* API is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('API did not become ready. Check the API output above.');
}

export async function startApplication(plan = buildPlan()) {
  for (const service of plan.services) {
    if (!existsSync(service.command)) throw new Error(`${service.name}: dependencies are missing. Run uv sync in ${service.cwd}${service.name === 'voice' ? ' --python 3.13' : ''}.`);
    for (const file of service.requiredFiles || []) {
      if (!existsSync(file)) throw new Error('Web dependencies are missing. Run npm install in assistant/web.');
    }
    if (service.port) await assertPortAvailable(service.port);
  }
  const children = [];
  let stopping;
  const stop = (code = 0) => {
    if (stopping) return stopping;
    stopping = Promise.all(children.map((child) => new Promise((resolve) => {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once('exit', resolve);
      if (windows) {
        // Kill only this launcher's child and its descendants, including reload workers.
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.once('error', () => { child.kill(); });
      } else {
        try { process.kill(-child.pid, 'SIGTERM'); } catch { resolve(); }
      }
    }))).then(() => {
      process.removeListener('SIGINT', onStop);
      process.removeListener('SIGTERM', onStop);
      process.exitCode = code;
    });
    return stopping;
  };
  const onStop = () => { void stop(0); };
  process.once('SIGINT', onStop);
  process.once('SIGTERM', onStop);
  for (const service of plan.services) {
    console.log(`[app] Starting ${service.name}${service.port ? ` on port ${service.port}` : ''}`);
    const child = spawn(service.command, service.args, { cwd: service.cwd, env: service.env, windowsHide: true, detached: !windows, stdio: 'inherit' });
    children.push(child);
    child.once('error', (error) => {
      console.error(`[${service.name}] ${error.message}`);
      if (service.name !== 'voice') void stop(1);
    });
    child.once('exit', (code) => {
      if (!stopping) {
        if (service.name === 'voice') {
          console.error(`[voice] Worker exited (${code ?? 'signal'}). Web and API are still running. Check LiveKit credentials in assistant/api/.env, then restart npm run dev.`);
        } else {
          console.error(`[${service.name}] exited (${code ?? 'signal'}); stopping the app.`);
          void stop(code || 1);
        }
      }
    });
    if (service.name === 'api') {
      try { await waitForApi(plan.apiUrl, () => !!stopping); }
      catch (error) { await stop(1); throw error; }
    }
  }
  if (!plan.configured) console.log('[app] Voice is unconfigured. Add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to assistant/api/.env; the worker will start automatically next time.');
  console.log(`[app] Open http://localhost:${plan.webPort}. Ctrl+C stops all services.`);
  return stop;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await startApplication(); }
  catch (error) { console.error(`[app] ${error.message}`); process.exitCode = 1; }
}
