const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.TUTORIAL_BASE_URL||'http://127.0.0.1:4173';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,locale:'fr-BE'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let portal={session:{id:'TUTORIAL_SESSION',name:'Test tutorial',scenarioTitle:'Test',language:'FR',status:'LIVE',playerSummary:'Une introduction de test.'},character:{externalId:'CHAR',name:'Personnage test',biography:'Une histoire de test.'},participant:{id:'PLAYER'},presentation:{skinId:'hollywood-1930'},resources:[],objectives:[],inventory:[],interactions:[],relationships:[],knowledge:[],notifications:[],votes:[],voteResults:[],discoveries:[],states:[],otherCharacters:[]};
  const reads=[];const actions=[];
  await page.route('**/__/firebase/**',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/player/notification/read')reads.push(path);
    if(route.request().method()==='POST'&&!path.endsWith('/notification/read'))actions.push(path);
    const body=path==='/api/player/portal'?{ok:true,portal}:path==='/api/player/notes'?{ok:true,notes:[],limits:{count:100,length:4000}}:{ok:true};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(`${base}/?player=TUTORIAL_TEST`);
  await page.getByRole('dialog',{name:'Introduction',exact:true}).waitFor();
  assert.equal(await page.locator('.playerTutorialDialog').count(),0,'story goes first');
  await page.getByRole('button',{name:'Entrer dans l’histoire',exact:true}).click();
  const dialog=page.locator('.playerTutorialDialog');await dialog.waitFor();
  await page.waitForTimeout(850);
  assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('murderRead:v1:TUTORIAL_SESSION:CHAR:PLAYER')||'{}')).length),0,'covered items must stay unread');
  assert.equal(reads.length,0);
  fs.mkdirSync('test-results/tutorial',{recursive:true});
  const screens=[];
  for(let i=0;i<7;i++){
    assert.equal(await dialog.getByRole('progressbar').getAttribute('aria-valuenow'),String(i+1));
    assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)),'focus stays in dialog');
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),'no horizontal overflow');
    await dialog.screenshot({path:`test-results/tutorial/fr-${i+1}.png`});
    screens.push(await dialog.innerHTML());
    if(i<6)await dialog.getByRole('button',{name:'Suivant',exact:true}).click();
  }
  fs.writeFileSync('test-results/tutorial/screens-fr.json',JSON.stringify(screens));
  await dialog.getByRole('button',{name:'À moi de jouer',exact:true}).click();
  assert.equal(await dialog.count(),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('murderTutorial:v1:TUTORIAL_SESSION:CHAR:PLAYER')),'1');
  await page.reload();await page.locator('.playerBottomNav').waitFor();
  assert.equal(await dialog.count(),0,'completion persists after reload');
  await page.locator('.playerBottomNav').getByRole('button',{name:/Carnet/}).click();
  await page.locator('.notebookTabs').getByRole('button',{name:/^Contexte/}).click();
  await page.getByRole('button',{name:/Revoir le tutoriel/}).click();await dialog.waitFor();
  await dialog.getByRole('button',{name:'6 / 7 — LES QR',exact:true}).click();
  assert.equal(await dialog.getByRole('heading').textContent(),'Scannez depuis l’app.');
  await dialog.getByRole('button',{name:'Retour',exact:true}).click();
  assert.equal(await dialog.getByRole('heading').textContent(),'Choisissez votre action.');
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),0,'escape closes');
  assert.match(await page.evaluate(()=>document.activeElement.textContent),/Revoir le tutoriel/,'focus returns to opener');
  // Skipping also persists. Small phones may scroll vertically but keep every control reachable.
  await page.evaluate(()=>localStorage.removeItem('murderTutorial:v1:TUTORIAL_SESSION:CHAR:PLAYER'));
  await page.setViewportSize({width:320,height:568});await page.reload();await dialog.waitFor();
  for(let i=0;i<7;i++){
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
    if(i<6)await dialog.getByRole('button',{name:'Suivant',exact:true}).click();
  }
  await dialog.getByRole('button',{name:/^Passer/}).click();await page.reload();await page.locator('.playerBottomNav').waitFor();
  assert.equal(await dialog.count(),0,'skip persists after reload');
  // Returning from a QR opens Play directly, even before completing the guide.
  await page.evaluate(()=>localStorage.removeItem('murderTutorial:v1:TUTORIAL_SESSION:CHAR:PLAYER'));
  await page.goto(`${base}/?player=TUTORIAL_TEST&tab=play`);await page.locator('.playerBottomNav').waitFor();
  assert.equal(await dialog.count(),0);assert.equal(await page.locator('.playerBottomNav .active b').textContent(),'Jouer');
  // A different participant gets their own onboarding; English follows the session.
  portal={...portal,session:{...portal.session,language:'EN',playerSummary:''},participant:{id:'PLAYER_EN'}};
  await page.setViewportSize({width:390,height:844});await page.goto(`${base}/?player=OTHER_TEST`);await dialog.waitFor();
  for(let i=0;i<7;i++){
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
    await dialog.screenshot({path:`test-results/tutorial/en-${i+1}.png`});
    if(i<6)await dialog.getByRole('button',{name:'Next',exact:true}).click();
  }
  await dialog.getByRole('button',{name:'Let’s play',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('murderTutorial:v1:TUTORIAL_SESSION:CHAR:PLAYER_EN')),'1');
  // Storage can be blocked: the guide still opens and remains dismissible.
  await page.addInitScript(()=>{const get=Storage.prototype.getItem;const set=Storage.prototype.setItem;Storage.prototype.getItem=function(k){if(k.startsWith('murderTutorial:'))throw Error('blocked');return get.call(this,k)};Storage.prototype.setItem=function(k,v){if(k.startsWith('murderTutorial:'))throw Error('blocked');return set.call(this,k,v)};});
  await page.reload();await dialog.waitFor();await dialog.getByRole('button',{name:/^Skip/}).click();
  assert.equal(await dialog.count(),0);assert.deepEqual(actions,[],'tutorial does not submit game actions');assert.deepEqual(errors,[]);
  console.log('PASS: story sequence; seven FR/EN screens; unread protection; back/direct navigation; completion/skip persistence; context replay; focus/escape; 320px mobile; QR return; participant isolation; blocked storage; no gameplay requests.');
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
