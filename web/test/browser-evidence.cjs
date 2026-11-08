const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="700" height="950"><rect width="700" height="950" fill="#eee0c5"/><rect x="25" y="25" width="650" height="900" fill="none" stroke="#233c38" stroke-width="6"/><text x="70" y="140" font-size="40" fill="#233c38">ARCHIVE DE 1946</text><text x="70" y="220" font-size="22">Pièce de lecture</text><circle cx="80" cy="870" r="20" fill="#a14940"/><circle cx="620" cy="870" r="20" fill="#a14940"/></svg>');
 const portal={session:{id:'EVIDENCE',name:'Nid test',scenarioTitle:'Nid d’espions',language:'FR',status:'READY'},character:{externalId:'P10',name:'Isabel Valera',biography:'Mes papiers sont rangés dans ma chambre.',personalTimeline:'J’ai appris la mort de Sava par le directeur.'},participant:{id:'LOCAL',briefingReadAt:'2026-11-08T00:00:00Z'},presentation:{skinId:'spy-1950'},objectives:[],relationships:[],resources:[],inventory:[{objectExternalId:'PASS',name:'Passe de service',identification:'Passe donnant accès aux passages réservés au personnel.',description:'SECRET_GM_DO_NOT_SHOW',visualMedia:{source:image,altText:'Passe illustré'},transferable:false},{objectExternalId:'DOC_OBJ_PAPER',name:'Note sans image',description:'Une explication écrite reste consultable même sans image.',identification:'Note sans image',transferable:false}],otherCharacters:[],knowledge:[],documentEntries:[{externalId:'ARCHIVE',clueExternalId:'ARCHIVE',documentExternalId:'DOC_ARCHIVE',playerName:'Archive britannique de 1946',playerText:'Le portrait manque au dossier. Il reste quelques références de fournisseurs à recouper.',owned:true,shareable:false,visualMedia:{source:image,altText:'Archive de 1946'},immersiveDocument:{title:'Archive britannique de 1946',textContent:'Le portrait manque au dossier. Il reste quelques références de fournisseurs à recouper.',media:[]}}],discoveries:[],notifications:[],voteResults:[],votes:[],pendingAbilityRequests:[],states:[],interactions:[],discoverableAboutMe:[]};
 const errors=[];fs.mkdirSync('test-results/evidence',{recursive:true});
 for(const width of [320,390,1280]){
  const page=await browser.newPage({viewport:{width,height:900},locale:'fr-BE'});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__/firebase/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(new URL(r.request().url()).pathname==='/api/player/portal'?{ok:true,portal}:{ok:true,notes:[],limits:{count:100,length:4000}})}));
  await page.addInitScript(()=>localStorage.setItem('murderIntroSeen:EVIDENCE:P10','1'));
  await page.goto('http://127.0.0.1:4173/?player=EVIDENCE_TEST');
  await page.locator('.playerBottomNav').getByRole('button',{name:/Sac/}).click();
  await page.getByRole('button',{name:'Examiner le document : Archive britannique de 1946',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Archive britannique de 1946',exact:true});await dialog.waitFor();
  assert.ok(await dialog.locator('.immersiveImageScroller img').isVisible());assert.match(await dialog.textContent(),/Le portrait manque au dossier/);
  const dimensions=await dialog.locator('.immersiveImageScroller img').boundingBox();assert.ok(dimensions.width>250);
  await page.screenshot({path:`test-results/evidence/document-${width}.png`});
  for(let i=0;i<4;i++)await dialog.getByRole('button',{name:'Agrandir l’image',exact:true}).click();
  assert.ok(await dialog.locator('.immersiveImageScroller').evaluate(e=>e.scrollWidth>e.clientWidth*1.8));
  await dialog.locator('.immersiveImageScroller').evaluate(e=>{e.scrollLeft=e.scrollWidth;e.scrollTop=e.scrollHeight;});
  await dialog.getByRole('button',{name:'Réinitialiser le zoom',exact:true}).click();
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
  await page.getByRole('button',{name:'Examiner le document : Passe de service',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Passe de service',exact:true});assert.match(await dialog.textContent(),/passages réservés/);assert.doesNotMatch(await dialog.textContent(),/SECRET_GM/);
  await dialog.getByRole('button',{name:'Fermer le document',exact:true}).click();
  await page.getByRole('button',{name:'Examiner le document : Note sans image',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Note sans image',exact:true});assert.match(await dialog.textContent(),/explication écrite/);assert.equal(await dialog.locator('.immersiveImageScroller').count(),0);
  await dialog.getByRole('button',{name:'Ranger le document',exact:true}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: 320/390/1280px; object and document override image; transcription with image; zoom and scroll; Escape/focus; text-only; GM detail hidden.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
