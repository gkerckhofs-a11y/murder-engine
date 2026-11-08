const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const {shapePlayerPortal}=await import('../../functions/src/player.mjs');
 const patch=JSON.parse(fs.readFileSync('../fixtures/nid/relationship-completion.json'));
 const base=JSON.parse(fs.readFileSync('../fixtures/nid/editorial-gameplay.json'));
 const source={...base,relationships:patch.existingRelationships,facts:patch.rows.map(r=>r.fact),initialKnowledges:patch.rows.map(r=>({characterExternalId:r.owner,factExternalId:r.fact.externalId}))};
 const session={id:'CONTACT_TEST',name:'Nid relations',status:'READY',language:'FR',scenarioVersion:{id:'V',scenario:{title:'Nid'}},sessionParticipants_on_gameSession:base.characters.map(c=>({characterExternalId:c.externalId,displayName:'Player '+c.externalId,active:true}))};
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const errors=[];
 fs.mkdirSync('test-results/relations',{recursive:true});
 for(const actor of ['P01','P12','P16']){
  const portal=shapePlayerPortal({id:actor,characterExternalId:actor,briefingReadAt:'2026-11-08T00:00:00Z'},session,source,{});
  portal.presentation={skinId:'spy-1950'};
  const page=await browser.newPage({viewport:{width:390,height:844},locale:'fr-BE'});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__/firebase/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(new URL(r.request().url()).pathname==='/api/player/portal'?{ok:true,portal}:{ok:true,notes:[],limits:{count:100,length:4000}})}));
  await page.addInitScript(actor=>localStorage.setItem('murderIntroSeen:CONTACT_TEST:'+actor,'1'),actor);
  await page.goto('http://127.0.0.1:4173/?player=CONTACT_TEST');
  await page.locator('.playerBottomNav').getByRole('button',{name:/Carnet/}).click();
  await page.locator('.notebookTabs:visible').getByRole('button',{name:/Relations/}).click();
  assert.equal(await page.locator('.playerRelation').count(),portal.relationships.length);
  const sava=page.locator('.playerRelation').filter({has:page.locator('.relationIdentity strong',{hasText:'Sava Tesla'})});assert.equal(await sava.count(),1);assert.equal(await sava.locator('.relationPortrait,.relationPlayer').count(),0);
  if(actor==='P01'){const unknown=page.locator('.playerRelation').filter({has:page.locator('.relationIdentity strong',{hasText:'Jean-Claude Marchand'})});assert.equal(await unknown.count(),1);assert.equal(await unknown.locator('.relationPortrait,.relationPlayer').count(),0);}
  if(actor==='P12'){const known=page.locator('.playerRelation').filter({has:page.locator('.relationIdentity strong',{hasText:'Charles Valmont'})});assert.equal(await known.count(),1);assert.match(await known.textContent(),/Karl von Strausser/);}
  if(actor==='P16')assert.doesNotMatch(await page.locator('.playerRelation').allTextContents().then(x=>x.join(' ')),/Étienne Bellamy|Evelyn Shaw|1984/);
  await page.screenshot({path:`test-results/relations/${actor}.png`,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.goto('http://127.0.0.1:4173/?player=CONTACT_TEST&print=sheet');await page.locator('.playerPdfRelation').first().waitFor();assert.equal(await page.locator('.playerPdfRelation').count(),portal.relationships.length);
  await page.close();
 }
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: mobile and printable relations; absent people; unknown cover has no player or portrait; known aliases merge; Karl does not learn Bellamy.');
})().catch(e=>{console.error(e);process.exit(1)});
