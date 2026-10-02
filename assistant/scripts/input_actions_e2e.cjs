const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch();
 try{
 const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 let texts=[],photos=[],chats=[],fail=false;
 const id='distilbert/distilbert-base-uncased-finetuned-sst-2-english';
 const result={model:id,device:'cpu',latency_ms:12,label:'positive',score:.9,probs:[{label:'negative',score:.1,logit:0},{label:'positive',score:.9,logit:1}],tokens:[],num_tokens:3,truncated:false,attributions:[]};
 await page.route('**/api/models',r=>r.fulfill({json:{models:[{id,name:'DistilBERT SST-2',domain:'Topic',labels:['negative','positive'],default:true,status:'ready'}],default_model:id,device:'cpu',limits:{max_text_chars:5000,max_length:512,max_batch_items:1000,batch_size:32,explain_steps:16,low_confidence:.6}}}));
 await page.route('**/api/photo-models',r=>r.fulfill({json:{models:[{id:'local-vision',vision:true,cloud:false}],default_vision:'local-vision',image_limits:{per_message:5,per_request:20,max_bytes:10485760}}}));
 await page.route('**/api/predict',r=>{texts.push(r.request().postDataJSON());return r.fulfill({json:result})});
 await page.route('**/api/predict/photos',r=>{photos.push(r.request().postDataJSON());return fail?r.fulfill({status:503,json:{detail:'Test photo error'}}):r.fulfill({json:{...result,analyzed_text:'Great product',photo_text:'Great product',photo_model:'local-vision',photo_task:'extract_text',photo_latency_ms:10}})});
 await page.route('**/api/chat',r=>{chats.push(r.request().postDataJSON());return r.fulfill({contentType:'text/event-stream',body:'data: {"type":"model","model":"local-vision"}\n\ndata: {"type":"token","content":"Here is your answer."}\n\ndata: {"type":"done"}\n\n'})});
 await page.goto('http://localhost:3100'); await page.getByRole('combobox',{name:'Model',exact:true}).filter({hasText:'DistilBERT SST-2'}).waitFor();
 assert(await page.getByText('What would you like to do?').isVisible());
 assert(!(await page.locator('#analyze-text').isVisible()));
 await page.getByRole('button',{name:'Analyze text / photos',exact:true}).click();
 const input=page.locator('#analyze-text'); await input.fill('Great');await input.press('Shift+Enter');await input.press('x');assert.equal(await input.inputValue(),'Great\nx');assert.equal(texts.length,0);
 await input.press('Enter');await page.getByText('Class probabilities',{exact:true}).waitFor();assert.equal(texts.length,1);
 const png=await page.evaluate(()=>{let c=document.createElement('canvas');c.width=c.height=20;return c.toDataURL().split(',')[1]});
 const attach=async()=>{await page.getByTestId('photo-input').last().setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.getByRole('button',{name:'View photo.png'}).waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith('AnalyzeEnter'))?.disabled);};
 await attach();await input.fill('Photo text');await input.press('Enter');await page.getByText('Text read from photos',{exact:true}).waitFor();assert.equal(photos.length,1);assert.equal(await input.inputValue(),'');assert.equal(await page.getByRole('button',{name:'View photo.png'}).count(),0);assert(await page.getByText('Great product',{exact:true}).first().isVisible());
 await page.getByRole('button',{name:'Chat / ask questions',exact:true}).click();
 const question=page.locator('#photo-question');await question.fill('Hello');await question.press('Shift+Enter');await question.press('x');assert.equal(await question.inputValue(),'Hello\nx');await question.press('Enter');await page.getByText('Here is your answer.',{exact:true}).waitFor();assert.equal(chats.length,1);assert.equal(texts.length,1);assert.equal(await question.inputValue(),'');
 await attach();await question.fill('What is this?');await question.press('Enter');await page.waitForFunction(()=>document.querySelector('#photo-question').value==='');assert.equal(chats.length,2);assert.equal(chats[1].messages.at(-1).images.length,1);assert.equal(photos.length,1);
 await page.getByRole('button',{name:'Analyze text / photos',exact:true}).click();fail=true;await attach();await input.fill('Keep me');await input.press('Enter');await page.getByText('Test photo error',{exact:true}).waitFor();assert.equal(await input.inputValue(),'Keep me');assert(await page.getByRole('button',{name:'View photo.png'}).isVisible());
 assert.deepEqual(errors,[]);console.log('PASS action choice, Enter text/photo submission, Shift+Enter, success clearing, error preservation, direct chat routing and photo follow-ups');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});



