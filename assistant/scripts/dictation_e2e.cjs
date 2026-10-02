const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(require.resolve('playwright-core', { paths: [process.cwd()] }));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      let submissions = 0;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        window.SpeechRecognition = class {
          constructor() { window.testSpeech = this; }
          start() { this.started = true; }
          stop() { this.stopped = true; this.onend?.(); }
          abort() { this.aborted = true; }
          result(text, final = true) { this.onresult?.({ resultIndex: 0, results: [{ isFinal: final, 0: { transcript: text } }] }); }
          error(code) { this.onerror?.({ error: code }); this.onend?.(); }
        };
        window.webkitSpeechRecognition = undefined;
      });
      await page.route('**/api/models', (r) => r.fulfill({ json: {
        models: [{id: 'test', name: 'Test model', domain: 'Topic', labels: ['negative','positive'], default: true, status: 'ready'}],
        default_model: 'test', device: 'cpu', limits: {max_text_chars: 40, max_length: 512, max_batch_items: 1000, batch_size: 32, explain_steps: 16, low_confidence: 0.6},
      } }));
      await page.route('**/api/photo-models', (r) => r.fulfill({ json: {models: [{id: 'test', vision: true, cloud: false}], default_vision: 'test', image_limits: {per_message: 5, per_request: 20, max_bytes: 10485760}} }));
      await page.route('**/api/voice/config', (r) => r.fulfill({ json: {enabled: false, reason: 'Not configured', voices: []} }));
      await page.route('**/api/predict', (r) => { submissions++; return r.fulfill({status: 503, json: {detail: 'Fixture'}}); });
      await page.route('**/api/chat', (r) => { submissions++; return r.fulfill({status: 503, json: {detail: 'Fixture'}}); });
      await page.goto(process.env.BASE_URL || 'http://localhost:3000');
      await page.getByRole('button', {name: 'Analyze text / photos', exact: true}).click();
      const analyze = page.locator('#analyze-text');
      await analyze.fill('Typed');
      await page.getByRole('button', {name: 'Dictate into analysis text'}).click();
      await page.evaluate(() => window.testSpeech.result('spoken', false));
      assert.equal(await analyze.inputValue(), 'Typed');
      await page.getByText('spoken', {exact: true}).waitFor();
      await page.evaluate(() => window.testSpeech.result('spoken'));
      await page.evaluate(() => window.testSpeech.result('spoken'));
      assert.equal(await analyze.inputValue(), 'Typed spoken');
      await page.getByRole('button', {name: 'Stop dictation', exact: true}).click();
      assert(await page.evaluate(() => window.testSpeech.stopped));
      assert.equal(submissions, 0);

      await page.getByRole('button', {name: 'Dictate into analysis text'}).click();
      await page.evaluate(() => window.testSpeech.error('not-allowed'));
      await page.getByText(/Allow microphone access/).waitFor();
      assert.equal(await analyze.inputValue(), 'Typed spoken');
      await page.getByRole('button', {name: 'Dictate into analysis text'}).click();
      await page.evaluate(() => window.testSpeech.error('network'));
      await page.getByText(/speech service couldn't connect/).waitFor();

      await page.getByRole('button', {name: 'Dictate into analysis text'}).click();
      await page.getByRole('button', {name: 'Chat / ask questions', exact: true}).click();
      assert(await page.evaluate(() => window.testSpeech.aborted));
      const chat = page.locator('#photo-question');
      assert.equal(await chat.inputValue(), 'Typed spoken');
      await page.getByRole('button', {name: 'Dictate into chat message'}).click();
      await chat.fill('Edited while listening');
      await page.evaluate(() => window.testSpeech.result('more words'));
      assert.equal(await chat.inputValue(), 'Edited while listening more words');
      await page.getByRole('button', {name: 'Stop dictation', exact: true}).click();
      assert.equal(submissions, 0);

      await page.getByRole('button', {name: 'Analyze text / photos', exact: true}).click();
      await analyze.fill('');
      await page.getByRole('button', {name: 'Dictate into analysis text'}).click();
      await page.evaluate(() => window.testSpeech.result('x'.repeat(100)));
      assert.equal((await analyze.inputValue()).length, 40);
      assert(await page.evaluate(() => window.testSpeech.stopped));
      await page.getByText(/reached its character limit/).waitFor();
      await page.evaluate(() => { window.SpeechRecognition = undefined; });
      await page.getByRole('button', {name: 'Dictate into analysis text'}).click();
      await page.getByText(/browser doesn't support dictation/).waitFor();
      assert.equal(submissions, 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      fs.mkdirSync('voice-e2e-out', {recursive: true});
      await page.screenshot({path: path.join('voice-e2e-out', `dictation-${width}.png`), fullPage: true});
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: both fields, interim/final, duplicate prevention, editable draft, Stop, permission/network/unsupported feedback, length cap, navigation cleanup, no auto-submit`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
