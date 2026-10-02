// Browser checks that do not need an agent or cloud credentials.
// Run from web/: node ../scripts/voice-testing/voice_ui_e2e.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright-core', { paths: [process.cwd()] }));
const base = process.env.BASE_URL || 'http://localhost:3000';
const out = path.resolve('voice-e2e-out');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  try {
    for (const [name, width, dark] of [['desktop', 1280, false], ['mobile', 390, false], ['dark', 1280, true]]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: dark ? 'dark' : 'light' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let enabled = false;
      let sessions = [];
      await page.route('**/api/voice/config', (route) => route.fulfill({ json: { enabled, voices: [], reason: enabled ? null : 'Not configured' } }));
      await page.route('**/api/voice/session', (route) => {
        sessions.push(route.request().postDataJSON());
        return route.fulfill({ status: 503, json: { detail: 'Voice test service is unavailable.' } });
      });
      await page.route('**/api/photo-models', (route) => route.fulfill({ json: { models: [{id: 'llama3.2:latest', vision: true, cloud: false}], default_vision: 'llama3.2:latest', image_limits: {per_message: 5, per_request: 20, max_bytes: 10485760} } }));
      await page.route('**/api/chat', (route) => route.fulfill({ contentType: 'text/event-stream', body: 'data: {"type":"model","model":"llama3.2:latest"}\n\ndata: {"type":"token","content":"Typed answer"}\n\ndata: {"type":"done"}\n\n' }));
      await page.goto(base);
      await page.getByRole('button', { name: 'Talk with microphone', exact: true }).click();
      await page.getByRole('status', { name: 'Voice setup' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Start voice mode' }).count(), 1);
      assert.equal(sessions.length, 0);
      await page.getByRole('button', { name: 'Dismiss voice setup' }).click();
      await page.getByRole('button', { name: 'Start voice mode' }).click();
      await page.getByRole('status', { name: 'Voice setup' }).waitFor();
      enabled = true;
      await page.reload();
      await page.getByRole('button', { name: 'Chat / ask questions', exact: true }).click();
      const input = page.locator('#photo-question');
      await input.fill('Remember my typed message');
      await input.press('Enter');
      await page.getByText('Typed answer', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Start voice mode' }).click();
      await page.getByText("Voice mode couldn't start", { exact: true }).waitFor();
      assert.equal(await input.count(), 0);
      assert.equal(sessions[0].provider, 'ollama');
      assert.equal(sessions[0].model, 'llama3.2:latest');
      assert(sessions[0].history.some((m) => m.content === 'Remember my typed message'));
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await page.waitForFunction(() => !!document.querySelector('[role="alert"]'));
      await page.getByText("Voice mode couldn't start", { exact: true }).waitFor();
      await page.screenshot({ path: path.join(out, `${name}-failure.png`), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, `${name}: horizontal overflow`);
      await page.getByRole('button', { name: 'Type instead', exact: true }).click();
      await input.waitFor();
      assert(await page.getByText('Typed answer', { exact: true }).isVisible());
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sentiment-studio.photo-chat.v1') || '[]'));
      assert.equal(saved.filter((m) => m.voice).length, 0);
      assert.equal(sessions.length, 2); // One room request per start/retry; none on cleanup.
      assert.deepEqual(errors, []);
      console.log(`PASS ${name}: visible microphone, setup guidance, typed chat/history, selected model, retry, Type instead, no empty voice history, layout`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
