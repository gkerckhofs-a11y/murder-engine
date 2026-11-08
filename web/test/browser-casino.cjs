const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const root=new URL('../../',`file://${__filename}`);
(async()=>{
  const {playerCasino,organizerCasino}=await import(new URL('functions/src/casino/service.mjs',root));
  const sessionId='11111111-1111-4111-8111-111111111111';
  const tokens=['a'.repeat(64),'b'.repeat(64)];
  const participants=tokens.map((token,i)=>({id:`${i?'33333333':'22222222'}-2222-4222-8222-222222222222`,displayName:i?'Bob':'Alice',characterExternalId:i?'B':'A',playerAccessToken:token,active:true,playerAccessEnabled:true,gameSession:{id:sessionId,status:'LIVE',runtimeInitializedAt:'2026-11-06T08:00:00Z'}}));
  let row=null;const commands=new Map(),wallets=[{characterExternalId:'A',currentValue:1000,maxValue:null},{characterExternalId:'B',currentValue:1000,maxValue:null}];
  const reader=async(op,v)=>{
    if(op.includes('PlayerAccessByToken'))return {sessionParticipants:participants.filter(p=>p.playerAccessToken===v.token)};
    if(op.includes('CasinoCommand'))return {sessionCasinoCommand:commands.get(v.requestId)??null};
    if(op.includes('CasinoSession'))return structuredClone({gameSession:{id:sessionId,status:'LIVE'},sessionCasino:row,sessionResources:wallets});
    throw Error('unexpected query');
  };
  const executor=async(op,v)=>{
    if((row?.revision??-1)!==(v.expectedRevision??-1))throw Error('CASINO_STATE_CHANGED');
    if(commands.has(v.requestId))throw Error('duplicate key');
    for(let i=0;v['char'+i];i++){const wallet=wallets.find(w=>w.characterExternalId===v['char'+i]);if(wallet.currentValue!==v['before'+i])throw Error('CASINO_CASH_CHANGED');}
    for(let i=0;v['char'+i];i++)wallets.find(w=>w.characterExternalId===v['char'+i]).currentValue=v['after'+i];
    row={revision:(row?.revision??-1)+1,stateJson:v.stateJson};commands.set(v.requestId,{actor:v.actor});return {};
  };
  const deps={reader,executor};
  await organizerCasino(sessionId,{type:'CONFIGURE',game:'BLACKJACK',revision:-1,config:{enabled:true,bank:1000}},deps);
  await organizerCasino(sessionId,{type:'CONFIGURE',game:'HOLDEM',revision:0,config:{enabled:true}},deps);
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  const pages=[];const errors=[];
  for(let i=0;i<3;i++){
    const page=await browser.newPage({viewport:{width:i===2?320:390,height:844},locale:'fr-BE'});
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/__/firebase/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
    await page.route('**/api/**',async r=>{
      try{const u=new URL(r.request().url());let d;
        if(u.pathname==='/api/player/casino/table')d=await playerCasino(u.searchParams.get('token'),Object.fromEntries(u.searchParams),deps);
        else if(u.pathname==='/api/player/casino/action'){const body=r.request().postDataJSON();d=await playerCasino(body.token,body,deps);}
        else throw Error('Unexpected API request '+u.pathname);
        await r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,...d})});
      }catch(e){await r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message})});}
    });
    if(i<2)await page.addInitScript(token=>localStorage.setItem('murderEnginePlayerToken',token),tokens[i]);
    pages.push(page);
  }
  const [a,b,guest]=pages;
  const url=game=>`http://127.0.0.1:4175/?casino=${game}&casinoSession=${sessionId}`;
  await guest.goto(url('BLACKJACK'));await guest.getByRole('heading',{name:'Blackjack',exact:true}).waitFor();
  assert.match(await guest.locator('main').textContent(),/Ouvrez d’abord le lien personnel/);assert.equal(await guest.getByRole('button',{name:/connexion|Connexion/}).count(),0);
  await a.goto(url('BLACKJACK'));await a.getByRole('region',{name:'Budget avant de jouer'}).waitFor();assert.match(await a.locator('.casinoEntry').textContent(),/Minimum à apporter/);await a.getByRole('button',{name:/Rejoindre avec/}).click();await a.getByRole('button',{name:/Miser 20/}).waitFor();
  assert.equal(wallets[0].currentValue,900);
  await a.getByRole('button',{name:/Miser 20/}).click();await a.getByRole('button',{name:'Distribuer les cartes',exact:true}).click();
  if(JSON.parse(row.stateJson).tables.BLACKJACK.phase==='PLAYING')await a.getByRole('button',{name:'Rester',exact:true}).click();
  await a.getByRole('heading',{name:'Règlement de la donne'}).waitFor();
  fs.mkdirSync('test-results/casino',{recursive:true});await a.screenshot({path:'test-results/casino/blackjack-mobile.png',fullPage:true});
  await a.reload();await a.getByRole('button',{name:/Quitter et récupérer/}).click();
  assert.equal(JSON.parse(row.stateJson).tables.BLACKJACK.seats.length,0);
  await a.goto(url('HOLDEM'));await a.getByRole('button',{name:/Rejoindre avec/}).click();await a.getByRole('button',{name:'Je suis prêt',exact:true}).click();
  await b.goto(url('HOLDEM'));await b.getByRole('button',{name:/Rejoindre avec/}).click();await b.getByRole('button',{name:'Je suis prêt',exact:true}).click();
  await a.getByRole('button',{name:'Distribuer aux joueurs prêts',exact:true}).click();await a.getByRole('button',{name:'Se coucher',exact:true}).waitFor();
  const alice=await playerCasino(tokens[0],{sessionId,game:'HOLDEM'},deps);assert.deepEqual(alice.table.seats.find(p=>p.id==='B').cards,[null,null]);
  await a.screenshot({path:'test-results/casino/holdem-mobile.png',fullPage:true});
  await a.getByRole('button',{name:'Se coucher',exact:true}).click();await b.getByRole('heading',{name:'Règlement de la donne'}).waitFor();
  const after=await playerCasino(tokens[0],{sessionId,game:'HOLDEM'},deps);assert.deepEqual(after.table.seats.find(p=>p.id==='B').cards,[null,null],'winner keeps cards private when everyone folds');
  await a.getByRole('button',{name:/Quitter et récupérer/}).click();await a.getByRole('button',{name:/Rejoindre avec/}).waitFor();await b.getByRole('button',{name:/Quitter et récupérer/}).click();await b.getByRole('button',{name:/Rejoindre avec/}).waitFor();
  assert.equal(JSON.parse(row.stateJson).tables.HOLDEM.seats.length,0);
  await organizerCasino(sessionId,{type:'CONFIGURE',game:'ROULETTE',revision:row.revision,config:{enabled:true,bank:10000,minBet:1,maxBet:200}},deps);
  await a.goto(url('ROULETTE'));await a.getByRole('button',{name:/Rejoindre avec/}).click();
  await a.getByRole('button',{name:'Parier sur 0',exact:true}).click();assert.equal(await a.getByLabel('Mon pari').inputValue(),'NUMBER:0');assert.equal(await a.locator('.rouletteNumbers button').count(),37);await a.getByRole('button',{name:'Ajouter la mise',exact:true}).click();
  await b.goto(url('ROULETTE'));await b.getByRole('button',{name:/Rejoindre avec/}).click();await b.getByRole('button',{name:'Ajouter la mise',exact:true}).click();
  await a.getByRole('button',{name:/Lancer la bille/}).click();await a.getByRole('heading',{name:'Règlement de la donne'}).waitFor();
  await b.getByRole('heading',{name:'Règlement de la donne'}).waitFor();
  await a.reload();await a.getByText(/Numéro sorti/).waitFor();
  assert.equal(JSON.parse(row.stateJson).tables.ROULETTE.round,1);
  await a.screenshot({path:'test-results/casino/roulette-mobile.png',fullPage:true});
  await a.getByRole('button',{name:/Quitter et récupérer/}).click();await a.getByRole('button',{name:/Rejoindre avec/}).waitFor();
  await b.getByRole('button',{name:/Quitter et récupérer/}).click();await b.getByRole('button',{name:/Rejoindre avec/}).waitFor();
  const state=JSON.parse(row.stateJson);assert.equal(wallets.reduce((n,w)=>n+w.currentValue,0)+state.tables.BLACKJACK.bank+state.tables.ROULETTE.bank,13000);
  for(const page of [a,b,guest])assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  assert.deepEqual(errors,[]);console.log('PASS: QR route without organizer login; missing personal link; join/bet/deal/settle/leave; reload; two-phone poker; private cards; no-show winner; total money; 320/390 px.');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
