// Uses the installed Edge browser; never downloads a browser or model.
const { chromium } = require('../web/node_modules/playwright-core');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    let fail = false;
    let calls = 0;
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      canvas.getContext('2d').fillRect(0, 0, 64, 64);
      return canvas.toDataURL('image/png');
    });
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/images/config') {
        return route.fulfill({ json: { configured: true } });
      }
      if (path === '/api/images/generate') {
        calls++;
        const { prompt } = route.request().postDataJSON();
        assert.equal(prompt, 'A lake at sunrise');
        return fail
          ? route.fulfill({ status: 429, json: { detail: 'Daily allowance exhausted.' } })
          : route.fulfill({ json: { image, prompt, model: 'FLUX.1 Schnell' } });
      }
      return route.fulfill({ status: 503, json: { detail: 'Test backend unavailable' } });
    });
    await page.goto('http://localhost:3000');
    await page.getByRole('button', { name: 'Generate an image', exact: true }).click();
    await page.getByLabel('Image description').fill('A lake at sunrise');
    const section = page.getByRole('region', { name: 'Generate an image' });
    await section.getByRole('button', { name: 'Generate an image', exact: true }).click();
    await section.getByRole('img', { name: 'A lake at sunrise' }).waitFor();
    assert.equal(await section.getByRole('link', { name: 'Download image' }).getAttribute('download'), 'generated-image.png');
    fail = true;
    await section.getByRole('button', { name: 'Generate an image', exact: true }).click();
    await section.getByRole('alert').filter({ hasText: 'Daily allowance exhausted.' }).waitFor();
    assert.equal(calls, 2);
    fail = false;
    await page.getByRole('button', { name: 'Chat / ask questions', exact: true }).click();
    const composer = page.getByLabel('Chat message composer', { exact: true });
    await composer.getByRole('button', { name: 'Generate an image', exact: true }).click();
    await composer.getByRole('textbox').fill('A lake at sunrise');
    await composer.getByRole('button', { name: 'Generate image from description' }).click();
    const conversation = page.getByLabel('Photo conversation', { exact: true });
    await conversation.getByRole('img', { name: 'Generated image', exact: true }).waitFor();
    await conversation.getByRole('link', { name: 'Download image' }).waitFor();
    assert.equal(calls, 3);
    await page.reload();
    await page.getByRole('button', { name: 'Chat / ask questions', exact: true }).click();
    await conversation.getByRole('img', { name: 'Generated image', exact: true }).waitFor();
    assert.equal(calls, 3, 'Reload restores the saved image without generating again');
    fail = true;
    await composer.getByRole('button', { name: 'Generate an image', exact: true }).click();
    await composer.getByRole('textbox').fill('A lake at sunrise');
    await composer.getByRole('button', { name: 'Generate image from description' }).click();
    await conversation.getByRole('alert').filter({ hasText: 'Daily allowance exhausted.' }).waitFor();
    fail = false;
    await conversation.getByRole('button', { name: 'Try again' }).click();
    await conversation.getByRole('img', { name: 'Generated image', exact: true }).nth(1).waitFor();
    assert.equal(calls, 5, 'Retry uses Cloudflare even without an Ollama model');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await composer.getByRole('textbox').isVisible());
    console.log('Image generation UI passed: standalone and conversation, preview, download, persistence, quota error, retry, mobile.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
