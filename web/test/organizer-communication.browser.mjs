import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';

// All identities, links and HTTP responses below are synthetic. No message is
// sent to a real participant, and no production credentials are used.
const sessionId='11111111-1111-4111-8111-111111111111';
const base={id:sessionId,name:'Vérification organisateur',status:'READY',language:'FR',venue:'Hôtel test',scheduledAt:'2026-11-13T18:00:00Z',runtimeInitializedAt:'2026-11-01T12:00:00Z',
  scenarioVersion:{id:'version-test',versionLabel:'test',scenario:{title:'Scénario de test'}},
  characters:Array.from({length:16},(_,i)=>({externalId:`P${i+1}`,name:`Personnage ${i+1}`,active:true,playable:true})),
  participants:Array.from({length:16},(_,i)=>({id:`participant-${i+1}`,displayName:`Joueur ${i+1}`,characterExternalId:`P${i+1}`,active:true,playerAccessEnabled:true,playerAccessToken:`synthetic-link-${i+1}`})),
  counts:{participants:16,assigned:16,playableCharacters:16,unassignedParticipants:0,unassignedCharacters:0}};
const server=await createServer({root:new URL('../',import.meta.url).pathname,server:{host:'127.0.0.1',port:0}});
await server.listen();
const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const cases=[
  {name:'admin-desktop',width:1360,admin:true,mode:'PREPARATION',enabled:true,initialized:true},
  {name:'organizer-mobile',width:390,admin:false,mode:'REHEARSAL',enabled:true,initialized:true},
  {name:'disabled-links',width:1360,admin:true,mode:'PREPARATION',enabled:false,initialized:true},
  {name:'licensed-preparation',width:390,admin:false,mode:'PREPARATION',enabled:true,initialized:true},
  {name:'uninitialized',width:1360,admin:true,mode:'PREPARATION',enabled:false,initialized:false},
];
try{
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  for(const c of cases){
    const context=await browser.newContext({viewport:{width:c.width,height:900},permissions:['clipboard-read','clipboard-write']});
    const page=await context.newPage();
    page.setDefaultTimeout(12000);
    const errors=[],writes=[],unexpected=[];
    let failNext=false;
    page.on('pageerror',e=>errors.push(e.message));
    const session=structuredClone(base);
    session.runtimeInitializedAt=c.initialized?base.runtimeInitializedAt:null;
    session.participants.forEach(p=>{p.playerAccessEnabled=c.enabled;});
    await page.addInitScript(()=>{
      window.firebase={apps:[{}],auth:()=>({currentUser:{email:'organizer@example.test',emailVerified:true,getIdToken:async()=>'synthetic-token'}})};
      localStorage.setItem('murderOrgaFold:11111111-1111-4111-8111-111111111111:player-communication','0');
    });
    await page.route('**/*',async route=>{
      const req=route.request(),u=new URL(req.url());
      if(u.origin!==origin){unexpected.push(u.origin);return route.abort();}
      if(u.pathname.startsWith('/__/firebase/'))return route.fulfill({contentType:'application/javascript',body:''});
      if(!u.pathname.startsWith('/api/'))return route.continue();
      const json=data=>route.fulfill({json:{ok:true,...data}});
      if(u.pathname==='/api/organizer/identity')return json({email:'organizer@example.test',admin:c.admin});
      if(u.pathname==='/api/library/scenarios')return json({scenarios:[]});
      if(u.pathname==='/api/sessions/list')return json({sessions:[session]});
      if(u.pathname==='/api/sessions/detail')return json({session});
      if(u.pathname==='/api/sessions/runtime')return json({runtime:null});
      if(u.pathname==='/api/sessions/live')return json({live:null});
      if(u.pathname==='/api/sessions/incarnations')return json({incarnations:[]});
      if(u.pathname==='/api/sessions/setup')return json({setup:{preparation:{steps:[],progress:100},proposal:{assignments:[],warnings:[],unassignedParticipants:[]}}});
      if(u.pathname==='/api/organizer/access')return json({access:{sessionId,workingSessionId:sessionId,organizerEmail:'organizer@example.test',enabled:true,selfServiceEnabled:!c.admin,mode:c.mode}});
      if(u.pathname==='/api/sessions/player-notification'){
        writes.push(req.postDataJSON());
        if(failNext){failNext=false;return route.fulfill({status:400,json:{error:'SIMULATED_SEND_ERROR',message:'Échec simulé'}});}
        return json({result:{sent:true}});
      }
      unexpected.push(u.pathname);return route.fulfill({status:404,json:{error:'UNEXPECTED_TEST_REQUEST'}});
    });
    try {
    await page.goto(origin+(c.admin?'/':`/?organizer=${sessionId}`));
    if(c.admin){await page.getByRole('button',{name:'Sessions',exact:true}).click();await page.getByRole('button',{name:'Ouvrir',exact:true}).click();}
    const nav=page.getByRole('navigation',{name:'Outils de la session'});
    await nav.getByRole('button',{name:/Messages & liens/}).waitFor();
    if(c.initialized){
      await page.getByRole('button',{name:'Ouvrir les messages et liens',exact:true}).click();
    }else await nav.getByRole('button',{name:/Messages & liens/}).click();
    if(!c.initialized){
      await page.getByText('Terminez la préparation de la partie',{exact:false}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Ouvrir la préparation',exact:true}).isVisible(),true);
    }else{
      const links=page.getByRole('region',{name:'Liens des fiches personnages'});
      await links.waitFor();
      assert.equal(await links.isVisible(),true);
      assert.equal(await links.getByRole('link',{name:/Ouvrir la fiche de/}).count(),c.enabled?16:0);
      const send=page.getByRole('button',{name:'Envoyer au joueur',exact:true});
      await page.getByLabel('Message (obligatoire)',{exact:true}).fill('Information synthétique pour le test.');
      if(c.enabled&&(c.admin||c.mode!=='PREPARATION')){
        const first=links.getByRole('link',{name:'Ouvrir la fiche de Joueur 1',exact:true});
        assert.equal(await first.getAttribute('href'),`${origin}/?player=synthetic-link-1`);
        assert.equal(await first.getAttribute('target'),'_blank');
        await links.getByRole('button',{name:'Copier',exact:true}).first().click();
        assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),`${origin}/?player=synthetic-link-1`);
        await send.click();
        await page.getByText('Message envoyé à Joueur 1.',{exact:true}).waitFor();
        assert.deepEqual(writes[0],{sessionId,characterExternalId:'P1',title:'Message du MJ',body:'Information synthétique pour le test.'});
        assert.equal(await page.getByLabel('Message (obligatoire)',{exact:true}).inputValue(),'');
        failNext=true;
        await page.getByLabel('Message (obligatoire)',{exact:true}).fill('Brouillon à conserver');
        await send.click();
        await page.locator('.playerAccessPanel').getByRole('alert').waitFor();
        assert.equal(await page.getByLabel('Message (obligatoire)',{exact:true}).inputValue(),'Brouillon à conserver');
        assert.equal(await send.isEnabled(),true);
      }else{
        assert.equal(await send.isDisabled(),true);
        assert.equal(writes.length,0);
        await page.getByText(c.enabled?'Pour envoyer un message, commencez les essais':'Les accès joueurs sont désactivés',{exact:false}).waitFor();
      }
      await nav.getByRole('button',{name:/Personnages & joueurs/}).click();
      await page.getByRole('button',{name:'Ouvrir les messages et liens',exact:true}).click();
      assert.equal(await links.isVisible(),true);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'horizontal overflow');
    await page.screenshot({path:new URL(`../test-results/${c.name}.png`,import.meta.url).pathname,fullPage:true});
    assert.deepEqual(errors,[]);
    assert.deepEqual(unexpected,[]);
    console.log(`PASS ${c.name}`);
    } catch(e) {
      await page.screenshot({path:new URL(`../test-results/${c.name}-failure.png`,import.meta.url).pathname,fullPage:true});
      console.error(c.name, {errors,unexpected,body:await page.locator('body').innerText()});
      throw e;
    }
    await context.close();
  }
}finally{await browser.close();await server.close();}
