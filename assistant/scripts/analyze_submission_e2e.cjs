const assert = require('node:assert/strict');
const { chromium } = require(require.resolve('playwright-core', { paths: [process.cwd()] }));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const submitted = [];
      await page.addInitScript(() => {
        window.SpeechRecognition = class {
          constructor() { window.testSpeech = this; }
          start() {}
          stop() {
            this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Spoken review' } }] });
            this.onend?.();
          }
          abort() {}
        };
      });
      await page.route('**/api/models', r => r.fulfill({ json: {
        models: [{ id: 'test', name: 'Test', domain: 'Topic', labels: ['negative', 'positive'], status: 'ready', default: true }],
        default_model: 'test', device: 'cpu', limits: { max_text_chars: 5000 },
      } }));
      await page.route('**/api/photo-models', r => r.fulfill({ json: { models: [], image_limits: { per_message: 5, per_request: 20, max_bytes: 10485760 } } }));
      await page.route('**/api/voice/config', r => r.fulfill({ json: { enabled: false, voices: [] } }));
      await page.route('**/api/predict', async r => {
        submitted.push(r.request().postDataJSON().text);
        await new Promise(resolve => setTimeout(resolve, 700));
        await r.fulfill({ status: 422, json: { detail: 'Test response' } });
      });
      await page.goto(process.env.BASE_URL || 'http://localhost:3000');
      await page.getByRole('button', { name: 'Analyze text / photos', exact: true }).click();
      const input = page.locator('#analyze-text');
      const analyze = page.getByRole('button', { name: 'Analyze', exact: true });
      for (const method of ['button', 'enter', 'microphone']) {
        await input.fill(method === 'microphone' ? '' : `Review ${method}`);
        if (method === 'button') await analyze.click();
        else if (method === 'enter') await input.press('Enter');
        else {
          await page.getByRole('button', { name: 'Dictate into analysis text' }).click();
          await page.getByRole('button', { name: 'Stop dictation', exact: true }).click();
        }
        await page.waitForFunction(() => document.activeElement?.id === 'analyze-text' && document.activeElement.value === '');
        assert.equal(await page.getByLabel('Submitted text', { exact: true }).textContent(), method === 'microphone' ? 'Spoken review' : `Review ${method}`);
        await input.fill('Next draft');
        await page.getByRole('alert').filter({ hasText: 'Test response' }).waitFor();
        assert.equal(await input.inputValue(), 'Next draft');
        await analyze.waitFor({ state: 'visible' });
      }
      assert.deepEqual(submitted, ['Review button', 'Review enter', 'Spoken review']);
      console.log(`PASS ${width}px: click/Enter/mic-stop submit, clear, focus, final transcript, and next draft preservation`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
