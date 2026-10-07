import test from 'node:test';
import assert from 'node:assert/strict';
import { shapePlayerPortal, configureSessionPlayerAccess, getPlayerPortal, executePlayerInteraction, sharePlayerClue, transferPlayerObject, transferPlayerCash, castPlayerVote, getPlayerLocation, executePlayerLocationAction, isAutonomousLocationInteraction, interactionScanMode, clandestineInteractionKind, attemptPlayerClandestineAction, claimPlayerStolenObject, __playerOps } from '../src/player.mjs';

const participant=()=>({id:'P1',displayName:'Gael',active:true,characterExternalId:'CHAR_A',briefingStatus:'NOT_SENT',playerAccessToken:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234567890_-',playerAccessEnabled:true,playerFirstOpenedAt:null,playerLastOpenedAt:null,playerOpenCount:0,briefingReadAt:null});
const session=()=>({id:'S1',name:'Cosa',status:'LIVE',runtimeInitializedAt:'2026-09-21T18:00:00Z',scenarioVersion:{id:'V1',versionLabel:'2.3',playerSummary:'Pitch',scenario:{title:'Cosa Nostra'}},sessionParticipants_on_gameSession:[participant(),{id:'P2',displayName:'Bob',active:true,characterExternalId:'CHAR_B'}]});
const source=()=>({
 characters:[{externalId:'CHAR_A',name:'Alice',publicRole:'Veuve',biography:'Bio',secretIntro:'Secret',portraitMediaId:'PORTRAIT_A',active:true},{externalId:'CHAR_B',name:'Bob',publicRole:'Avocat',biography:'Bio B',portraitMediaId:'PORTRAIT_B',active:true}],
 objectives:[{externalId:'OBJ1',ownerType:'CHARACTER',ownerExternalId:'CHAR_A',title:'Gagner',description:'Faire X',objectiveType:'PERSONAL',secret:true,initialStatus:'ACTIVE',active:true}],
 relationships:[{externalId:'REL1',characterAExternalId:'CHAR_A',characterBExternalId:'CHAR_B',textA:'Je lui fais confiance',textB:'Inverse',visibility:'PRIVATE',active:true}],
 facts:[{externalId:'F1',title:'Info',text:'Texte',nature:'FACT',importance:'IMPORTANT',notebookCategory:'Meurtre',active:true}],
 clues:[{externalId:'C1',playerName:'Lettre',clueType:'DOCUMENT',playerText:'Contenu',documentExternalId:'DOC1',mediaExternalId:'MEDIA1',objectExternalId:'DOC_OBJ_DOC1',active:true},{externalId:'C2',playerName:'Dossier caché',clueType:'DOCUMENT',playerText:'Un dossier compromettant.',locationExternalId:'LOC1',objectExternalId:'ITEM2',documentExternalId:'DOC2',major:true,active:true}],clueFacts:[],
 documentDefinitions:[{externalId:'DOC1',title:'Lettre',textContent:'Cher ami...',support:'DIGITAL',mediaExternalIds:'MEDIA1',active:true},{externalId:'DOC2',title:'Dossier caché',textContent:'Dossier',support:'PHYSICAL',mediaExternalIds:null,active:true}],
 mediaAssets:[
 {externalId:'MEDIA1',mediaType:'IMAGE',source:'/immersive/test/letter.png',altText:'Lettre',active:true},
 {externalId:'PORTRAIT_A',mediaType:'IMAGE',source:'/immersive/test/alice.png',altText:'Alice',active:true},
 {externalId:'PORTRAIT_B',mediaType:'IMAGE',source:'/immersive/test/bob.png',altText:'Bob',active:true},
 {externalId:'OBJ_ITEM1',mediaType:'IMAGE',source:'/immersive/test/key.png',altText:'Clé',active:true}
],
 resources:[{externalId:'RES_PA',name:'Points action',unit:'PA',active:true},{externalId:'RES_CASH',name:'Argent',unit:'$',active:true}],
 gameObjects:[{externalId:'DOC_OBJ_DOC1',name:'Lettre',description:'Lettre',transferable:true,stealable:true,consumable:false,critical:false,identification0:'Lettre',active:true},{externalId:'ITEM1',name:'Clé',description:'Une clé',transferable:true,stealable:true,consumable:false,critical:false,identification0:'Une clé inconnue',active:true},{externalId:'ITEM2',name:'Dossier',description:'Un dossier trouvé dans le bureau',transferable:true,stealable:true,consumable:false,critical:false,identification0:'Un dossier',active:true},{externalId:'ITEM_B',name:'Portefeuille',description:'Un portefeuille',transferable:true,stealable:true,consumable:false,critical:false,identification0:'Un portefeuille',active:true}],
 gameStateDefinitions:[{externalId:'ST1',name:'Blessé',description:'Vous êtes blessé',visibleToHolder:true,active:true}],
 abilities:[{externalId:'AB1',name:'Fouille',description:'Chercher',category:'INV',defaultLevel:1,secret:false,active:true}],
 abilityAssignments:[{externalId:'AA1',ownerType:'CHARACTER',ownerExternalId:'CHAR_A',abilityExternalId:'AB1',level:2,flatBonus:0,active:true}],
 interactions:[{externalId:'ACT1',name:'Fouiller',category:'INV',targetType:'LOCATION',abilityExternalId:'AB1',resolution:'DICE',validation:'AUTO',costResourceExternalId:'RES_PA',costValue:1,targetSecret:false,active:true},{externalId:'ACT_GM',name:'Intimider',category:'SOCIAL',targetType:'CHARACTER',scanMode:'DIRECT',abilityExternalId:'AB1',resolution:'GM',validation:'GM',targetSecret:false,active:true},{externalId:'ACT_DIRECT',name:'Soigner',category:'CARE',targetType:'CHARACTER',scanMode:'DIRECT',abilityExternalId:'AB1',resolution:'AUTO',validation:'AUTO',targetSecret:false,active:true},{externalId:'ACT_SPY',name:'Observer discrètement',category:'ESPIONAGE',targetType:'CHARACTER',scanMode:'DISCRET',abilityExternalId:'AB1',resolution:'AUTO',validation:'AUTO',targetSecret:false,active:true},{externalId:'ACT_STEAL',name:'Voler dans les poches',category:'THEFT',targetType:'CHARACTER',scanMode:'DISCRET',abilityExternalId:'AB1',resolution:'DICE',validation:'AUTO',costResourceExternalId:'RES_PA',costValue:1,targetSecret:true,active:true},{externalId:'ACT_FRISK',name:'Fouiller les poches',category:'INV',targetType:'CHARACTER',scanMode:'DISCRET',abilityExternalId:'AB1',resolution:'DICE',validation:'AUTO',costResourceExternalId:'RES_PA',costValue:1,targetSecret:true,active:true}],
 gameLocations:[{externalId:'LOC1',name:'Bureau',description:'Bureau',lockExternalId:null,active:true}],
 voteDefinitions:[{externalId:'VOTE1',title:'Vote',question:'Qui ?',scopeType:'ALL',secret:true,modifiable:false,active:true}],voteOptionDefinitions:[{externalId:'OPT1',voteExternalId:'VOTE1',orderIndex:1,label:'A',active:true}],
});
const runtime=()=>({
 sessionResources:[
  {characterExternalId:'CHAR_A',resourceExternalId:'RES_PA',initialValue:5,currentValue:4,maxValue:5},
  {characterExternalId:'CHAR_A',resourceExternalId:'RES_CASH',initialValue:100,currentValue:100,maxValue:null},
  {characterExternalId:'CHAR_B',resourceExternalId:'RES_CASH',initialValue:20,currentValue:20,maxValue:null}
 ],
 sessionKnowledges:[{characterExternalId:'CHAR_A',factExternalId:'F1',sourceType:'INITIAL',learnedAt:'2026-09-21T18:00:00Z'}],
 sessionObjectives:[{characterExternalId:'CHAR_A',objectiveExternalId:'OBJ1',status:'ACTIVE',progress:0}],
 sessionObjects:[{objectExternalId:'DOC_OBJ_DOC1',holderType:'CHARACTER',holderExternalId:'CHAR_A',identificationLevel:0,inPlay:true},{objectExternalId:'ITEM1',holderType:'CHARACTER',holderExternalId:'CHAR_A',identificationLevel:0,inPlay:true},{objectExternalId:'ITEM2',holderType:'LOCATION',holderExternalId:'LOC1',identificationLevel:0,inPlay:true},{objectExternalId:'ITEM_B',holderType:'CHARACTER',holderExternalId:'CHAR_B',identificationLevel:0,inPlay:true}],
 sessionCharacterStates:[{characterExternalId:'CHAR_A',stateExternalId:'ST1',active:true,appliedAt:'2026-09-21T18:02:00Z'}],
 sessionClueDiscoveries:[{characterExternalId:'CHAR_A',clueExternalId:'C1',discoveredAt:'2026-09-21T18:03:00Z'}],sessionInteractionUses:[],
 sessionVotes:[{voteExternalId:'VOTE1',round:1,status:'OPEN',eligibleOptionExternalIds:'OPT1'}],sessionBallots:[],
 sessionPlayerNotifications:[{id:'N1',characterExternalId:'CHAR_A',kind:'GM',title:'Message',body:'Hello',priority:'NORMAL',createdAt:'2026-09-21T18:04:00Z',readAt:null}],sessionStealGrants:[],
});

test('player portal exposes only own runtime state and safe actions',()=>{
 const out=shapePlayerPortal(participant(),session(),source(),runtime(),new Date('2026-09-21T18:05:00Z'));
 assert.equal(out.character.name,'Alice');assert.equal(out.resources[0].currentValue,4);assert.equal(out.inventory.find(o=>o.objectExternalId==='ITEM1').name,'Clé');assert.equal(out.notifications.length,1);assert.equal(out.unreadNotificationCount,1);
 assert.equal(out.interactions.find(x=>x.externalId==='ACT1').directEnabled,true);assert.equal(out.interactions.find(x=>x.externalId==='ACT_GM').directEnabled,false);assert.equal(out.interactions.find(x=>x.externalId==='ACT_DIRECT').scanMode,'DIRECT');assert.equal(out.interactions.find(x=>x.externalId==='ACT_SPY').scanMode,'DISCRET');
 assert.equal(out.votes.length,1);assert.equal(out.otherCharacters[0].characterExternalId,'CHAR_B');
});

test('player sheet exposes only clues targeted at the current character',()=>{
 const src=source();
 src.clues.push(
   {
     externalId:'RUMOR_SELF',
     playerName:'Rumour about Alice',
     clueType:'RUMOR',
     playerText:'Alice once bribed a critic.',
     discoveryHook:'RUMOR_TARGET:CHAR_A',
     active:true
   },
   {
     externalId:'RUMOR_OTHER',
     playerName:'Rumour about Bob',
     clueType:'RUMOR',
     playerText:'Bob hides a contract.',
     discoveryHook:'RUMOR_TARGET:CHAR_B',
     active:true
   }
 );

 const out=shapePlayerPortal(
   participant(),
   session(),
   src,
   runtime(),
   new Date('2026-09-21T18:05:00Z')
 );

 assert.deepEqual(
   out.discoverableAboutMe.map(x=>x.externalId),
   ['RUMOR_SELF']
 );
 assert.equal(
   out.discoverableAboutMe[0].playerText,
   'Alice once bribed a critic.'
 );
});

test('player object visual inherits Media Library override from sibling scenario version',()=>{
 const src=source();
 const sess=session();

 sess.scenarioVersion={
   ...sess.scenarioVersion,
   mediaOverridesJson:null,
   scenario:{
     ...sess.scenarioVersion.scenario,
     scenarioVersions_on_scenario:[
       {
         id:'V2',
         mediaOverridesJson:JSON.stringify({
           'OBJECT:ITEM1':{
             assetExternalId:'MEDIA_SHARED_KEY',
             source:'https://example.test/shared-key.png',
             altText:'Shared key image',
             mediaType:'IMAGE'
           }
         }),
         importedAt:'2026-10-07T10:00:00Z'
       }
     ]
   }
 };

 const out=shapePlayerPortal(
   participant(),
   sess,
   src,
   runtime(),
   new Date('2026-09-21T18:05:00Z')
 );

 const key=out.inventory.find(
   o=>o.objectExternalId==='ITEM1'
 );

 assert.equal(
   key.visualMedia.source,
   'https://example.test/shared-key.png'
 );
 assert.equal(key.visualMedia.inherited,true);
});

test('player object visual accepts a media override keyed by logistics code',()=>{
 const src=source();
 src.gameObjects=src.gameObjects.map(o=>
   o.externalId==='ITEM2'
     ? {...o,logisticsCode:'SB-OBJ-005'}
     : o
 );
 const rt=runtime();
 rt.sessionObjects=rt.sessionObjects.map(o=>
   o.objectExternalId==='ITEM2'
     ? {...o,holderType:'CHARACTER',holderExternalId:'CHAR_A'}
     : o
 );
 const sess=session();
 sess.scenarioVersion={
   ...sess.scenarioVersion,
   mediaOverridesJson:JSON.stringify({
     'OBJECT:SB-OBJ-005':{
       assetExternalId:'MEDIA_VOCAL_TONIC',
       source:'https://example.test/vocal-tonic.png',
       altText:'Flacon de tonic vocal',
       mediaType:'IMAGE'
     }
   })
 };

 const out=shapePlayerPortal(
   participant(),
   sess,
   src,
   rt,
   new Date('2026-09-21T18:05:00Z')
 );

 const tonic=out.inventory.find(
   o=>o.objectExternalId==='ITEM2'
 );

 assert.equal(
   tonic.visualMedia.source,
   'https://example.test/vocal-tonic.png'
 );
});

test('player object visual falls back to the media of its linked clue',()=>{
 const src=source();
 src.mediaAssets=[
   ...src.mediaAssets,
   {
     externalId:'MEDIA_LINKED_OBJECT',
     mediaType:'IMAGE',
     source:'/immersive/test/linked-object.png',
     altText:'Linked object',
     active:true
   }
 ];
 src.clues=src.clues.map(c=>
   c.externalId==='C2'
     ? {...c,mediaExternalId:'MEDIA_LINKED_OBJECT'}
     : c
 );
 const rt=runtime();
 rt.sessionObjects=rt.sessionObjects.map(o=>
   o.objectExternalId==='ITEM2'
     ? {...o,holderType:'CHARACTER',holderExternalId:'CHAR_A'}
     : o
 );

 const out=shapePlayerPortal(
   participant(),
   session(),
   src,
   rt,
   new Date('2026-09-21T18:05:00Z')
 );

 const linked=out.inventory.find(
   o=>o.objectExternalId==='ITEM2'
 );

 assert.equal(
   linked.visualMedia.source,
   '/immersive/test/linked-object.png'
 );
});

test('Visual V1 exposes character portraits, relation portraits and object thumbnails',()=>{
 const out=shapePlayerPortal(participant(),session(),source(),runtime(),new Date('2026-09-21T18:05:00Z'));
 assert.equal(out.character.portrait.source,'/immersive/test/alice.png');
 assert.equal(out.relationships[0].portrait.source,'/immersive/test/bob.png');
 const key=out.inventory.find(o=>o.objectExternalId==='ITEM1');
 assert.equal(key.visualCode,'KEY');
 assert.equal(key.visualMedia.source,'/immersive/test/key.png');
 const letter=out.inventory.find(o=>o.objectExternalId==='DOC_OBJ_DOC1');
 assert.equal(letter.visualCode,'LETTER');
});

test('Visual V2 resolves skin archetype when no specific portrait exists',()=>{
 const src=source();
 src.characters=src.characters.map(c=>c.externalId==='CHAR_A'?{...c,portraitMediaId:null,portraitArchetypeCode:'HENCHMAN'}:c);
 src.mediaAssets=[...src.mediaAssets,{externalId:'MEDIA_HENCHMAN',mediaType:'IMAGE',source:'/visual/henchman.webp',altText:'Homme de main',active:true}];
 src.skinVisualDefinitions=[{externalId:'VIS_HENCHMAN',skinId:'RETRO_1900_1930',visualType:'CHARACTER',archetypeCode:'HENCHMAN',mediaExternalId:'MEDIA_HENCHMAN',variant:'DEFAULT',active:true}];
 const ses=session();
 ses.scenarioVersion={...ses.scenarioVersion,skinId:'RETRO_1900_1930'};
 const out=shapePlayerPortal(participant(),ses,src,runtime(),new Date('2026-09-21T18:05:00Z'));
 assert.equal(out.character.portrait.source,'/visual/henchman.webp');
});

test('V1.6.2 player portal exposes immersive document media for bag and notebook',()=>{
 const out=shapePlayerPortal(participant(),session(),source(),runtime(),new Date('2026-09-21T18:05:00Z'));
 const owned=out.documentEntries.find(d=>d.clueExternalId==='C1');
 assert.ok(owned?.immersiveDocument);
 assert.equal(owned.immersiveDocument.media[0].source,'/immersive/test/letter.png');
 const discovery=out.discoveries.find(d=>d.clueExternalId==='C1');
 assert.equal(discovery.clue.immersiveDocument.title,'Lettre');
});

test('configure player access creates bearer links for cast participants',async()=>{
 const writes=[];const reader=async()=>({gameSession:{...session(),organization:{id:'O1'},scenarioVersion:{...session().scenarioVersion,characters_on_scenarioVersion:source().characters}}});
 const out=await configureSessionPlayerAccess('S1',true,{reader,executor:async(op,vars)=>{writes.push({op,vars});return{};}});
 assert.equal(out.links.length,2);assert.equal(writes.length,2);assert.equal(writes[0].vars.enabled,true);assert.ok(writes[0].vars.token.length>=32);
});

test('portal open tracking is optional for refresh polling',async()=>{
 let writes=0;let read=0;const reader=async op=>{read++;if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();throw new Error('bad read')};
 await getPlayerPortal(participant().playerAccessToken,{reader,executor:async()=>{writes++;},trackOpen:false});assert.equal(writes,0);assert.equal(read,3);
});

test('player cannot execute an interaction requiring GM',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();};
 await assert.rejects(()=>executePlayerInteraction(participant().playerAccessToken,{interactionExternalId:'ACT_GM',targetExternalId:'CHAR_B'},{reader,executor:async()=>({}),interactionExecutor:async()=>({})}),/PLAYER_INTERACTION_REQUIRES_GM/);
});

test('player interaction actor identity is forced from token',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();};let captured;
 const out=await executePlayerInteraction(participant().playerAccessToken,{interactionExternalId:'ACT1',actorCharacterExternalId:'CHAR_B',targetExternalId:'LOC1'},{reader,executor:async()=>({}),interactionExecutor:async(sid,input)=>{captured=input;return{interactionName:'Fouiller',success:true};}});
 assert.equal(captured.actorCharacterExternalId,'CHAR_A');assert.equal(out.success,true);
});

test('discovered non-object clue is exposed as being in the player bag',()=>{
 const src=source();
 src.clues.push({
   externalId:'C3',
   playerName:'Whispered note',
   clueType:'INFO',
   playerText:'A private piece of information.',
   shareable:true,
   transferable:true,
   addToNotebook:true,
   active:true
 });
 const rt=runtime();
 rt.sessionClueDiscoveries.push({
   characterExternalId:'CHAR_A',
   clueExternalId:'C3',
   discoveredAt:'2026-09-21T18:04:30Z'
 });
 const out=shapePlayerPortal(participant(),session(),src,rt,new Date('2026-09-21T18:05:00Z'));
 const discovery=out.discoveries.find(d=>d.clueExternalId==='C3');
 assert.equal(discovery.clue.inBag,true);
 assert.equal(discovery.clue.shareable,true);
});

test('player can share a discovered clue directly with another player',async()=>{
 const src=source();
 src.clues.push({
   externalId:'C3',
   playerName:'Whispered note',
   clueType:'INFO',
   playerText:'A private piece of information.',
   shareable:true,
   transferable:true,
   addToNotebook:true,
   active:true
 });
 const rt=runtime();
 rt.sessionClueDiscoveries.push({
   characterExternalId:'CHAR_A',
   clueExternalId:'C3',
   discoveredAt:'2026-09-21T18:04:30Z'
 });

 const reader=async op=>{
   if(op===__playerOps.PLAYER_ACCESS_QUERY)
     return{sessionParticipants:[{...participant(),gameSession:session()}]};
   if(op===__playerOps.PLAYER_SOURCE_QUERY)return src;
   if(op===__playerOps.PLAYER_RUNTIME_QUERY)return rt;
   throw new Error('bad op');
 };

 const revealed=[];
 const writes=[];
 const out=await sharePlayerClue(
   participant().playerAccessToken,
   {clueExternalId:'C3',targetCharacterExternalId:'CHAR_B'},
   {
     reader,
     executor:async(op,vars)=>{writes.push({op,vars});return{};},
     clueReveal:async(sid,input)=>{revealed.push({sid,input});return{};},
     now:new Date('2026-09-21T18:08:00Z')
   }
 );

 assert.equal(out.shared,true);
 assert.equal(out.alreadyKnown,false);
 assert.equal(revealed.length,1);
 assert.equal(revealed[0].input.characterExternalId,'CHAR_B');
 assert.equal(revealed[0].input.clueExternalId,'C3');
 assert.equal(writes.length,2);
 assert.equal(writes[0].vars.data.characterExternalId,'CHAR_B');
 assert.equal(writes[0].vars.data.kind,'CLUE');
 assert.match(writes[0].vars.data.body,/Sac et à votre Carnet/);
 assert.equal(writes[1].vars.data.characterExternalId,'CHAR_A');
});

test('player cannot share a clue they have not discovered',async()=>{
 const src=source();
 src.clues.push({
   externalId:'C3',
   playerName:'Whispered note',
   clueType:'INFO',
   playerText:'A private piece of information.',
   shareable:true,
   active:true
 });
 const reader=async op=>{
   if(op===__playerOps.PLAYER_ACCESS_QUERY)
     return{sessionParticipants:[{...participant(),gameSession:session()}]};
   if(op===__playerOps.PLAYER_SOURCE_QUERY)return src;
   if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();
   throw new Error('bad op');
 };
 await assert.rejects(
   ()=>sharePlayerClue(
     participant().playerAccessToken,
     {clueExternalId:'C3',targetCharacterExternalId:'CHAR_B'},
     {reader,executor:async()=>({}),clueReveal:async()=>({})}
   ),
   /CLUE_NOT_OWNED_BY_PLAYER/
 );
});

test('player may give only an object they own',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();};let moved;
 await transferPlayerObject(participant().playerAccessToken,{objectExternalId:'ITEM1',targetCharacterExternalId:'CHAR_B'},{reader,executor:async()=>({}),objectTransfer:async(sid,input)=>{moved=input;return input;}});assert.equal(moved.holderExternalId,'CHAR_B');
});

test('player cash transfer debits sender and credits recipient in one transaction',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();throw new Error('bad op')};
 let write=null;
 const out=await transferPlayerCash(participant().playerAccessToken,{targetCharacterExternalId:'CHAR_B',amount:35},{reader,executor:async(op,vars)=>{write={op,vars};return{};},now:new Date('2026-09-21T18:07:00Z')});
 assert.equal(out.transferred,true);
 assert.equal(out.amount,35);
 assert.equal(out.remaining,65);
 assert.equal(write.op,__playerOps.TRANSFER_PLAYER_CASH_MUTATION);
 assert.equal(write.vars.senderValue,65);
 assert.equal(write.vars.targetValue,55);
 assert.equal(write.vars.notification.characterExternalId,'CHAR_B');
 assert.equal(write.vars.notification.kind,'CASH');
 assert.equal(write.vars.senderLog.deltaValue,-35);
 assert.equal(write.vars.targetLog.deltaValue,35);
});

test('player cash transfer rejects insufficient balance before writing',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();throw new Error('bad op')};
 let writes=0;
 await assert.rejects(()=>transferPlayerCash(participant().playerAccessToken,{targetCharacterExternalId:'CHAR_B',amount:101},{reader,executor:async()=>{writes++;return{};}}),/INSUFFICIENT_CASH/);
 assert.equal(writes,0);
});

test('player cash transfer rejects self target and invalid amount',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();throw new Error('bad op')};
 await assert.rejects(()=>transferPlayerCash(participant().playerAccessToken,{targetCharacterExternalId:'CHAR_A',amount:10},{reader,executor:async()=>({})}),/INVALID_CASH_TARGET/);
 await assert.rejects(()=>transferPlayerCash(participant().playerAccessToken,{targetCharacterExternalId:'CHAR_B',amount:1.5},{reader,executor:async()=>({})}),/INVALID_CASH_AMOUNT/);
});

test('completed player vote disappears from Play tab',()=>{
 const src=source();
 src.voteDefinitions=src.voteDefinitions.map(v=>({
   ...v,
   resultVisibility:'AFTER_CLOSE'
 }));

 const rt=runtime();
 rt.sessionBallots=[
   {
     voteExternalId:'VOTE1',
     round:1,
     electorCharacterExternalId:'CHAR_A',
     selectedOptionExternalIds:'OPT1',
     weight:1,
     castAt:'2026-09-21T18:05:00Z',
     updatedAt:'2026-09-21T18:05:00Z'
   }
 ];

 const out=shapePlayerPortal(
   participant(),
   session(),
   src,
   rt,
   new Date('2026-09-21T18:06:00Z')
 );

 assert.equal(out.votes.length,0);
});

test('closed vote result appears as player-safe News data',()=>{
 const src=source();
 src.voteDefinitions=src.voteDefinitions.map(v=>({
   ...v,
   title:'Who takes the lead role?',
   resultVisibility:'AFTER_CLOSE'
 }));

 const rt=runtime();
 rt.sessionVotes=[
   {
     voteExternalId:'VOTE1',
     round:1,
     status:'CLOSED',
     eligibleOptionExternalIds:'OPT1',
     openedAt:'2026-09-21T18:00:00Z',
     closedAt:'2026-09-21T18:10:00Z',
     resultJson:JSON.stringify({
       winnerOptionExternalId:'OPT1',
       tieForLead:false,
       suggestSecondRound:false,
       ranked:[
         {
           optionExternalId:'OPT1',
           label:'A',
           votes:1
         }
       ]
     })
   }
 ];

 const out=shapePlayerPortal(
   participant(),
   session(),
   src,
   rt,
   new Date('2026-09-21T18:11:00Z')
 );

 assert.equal(out.votes.length,0);
 assert.equal(out.voteResults.length,1);
 assert.equal(out.voteResults[0].title,'Who takes the lead role?');
 assert.equal(out.voteResults[0].winnerLabel,'A');
 assert.equal(out.voteResults[0].round,1);
});

test('player vote always uses character linked to token',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();};let ballot;
 await castPlayerVote(participant().playerAccessToken,{voteExternalId:'VOTE1',round:1,selectedOptionExternalIds:['OPT1'],electorCharacterExternalId:'CHAR_B'},{reader,voteCaster:async(sid,input)=>{ballot=input;return input;}});assert.equal(ballot.electorCharacterExternalId,'CHAR_A');
});


test('GM action can be requested by player and is logged instead of executed',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();};let write;let executed=false;
 const out=await executePlayerInteraction(participant().playerAccessToken,{interactionExternalId:'ACT_GM',targetExternalId:'CHAR_B',requestOnly:true},{reader,executor:async(op,vars)=>{write={op,vars};return{};},interactionExecutor:async()=>{executed=true;return{};}});
 assert.equal(out.requested,true);assert.equal(executed,false);assert.equal(write.vars.data.actionType,'PLAYER_INTERACTION_REQUEST');assert.equal(write.vars.data.characterExternalId,'CHAR_A');assert.equal(write.vars.data.afterValue,'CHAR_B');
});


test('English player portal localizes system blocked reasons',()=>{
 const src=source();
 const sess=session();
 sess.language='EN';
 const out=shapePlayerPortal(participant(),sess,src,runtime(),new Date('2026-09-21T18:05:00Z'));
 const gm=out.interactions.find(x=>x.externalId==='ACT_GM');
 assert.equal(gm.blockedReason,'Ask the GM');
});

test('English location fallback uses Search instead of Fouiller',async()=>{
 const src=source();
 src.interactions=[];
 const sess=session();
 sess.language='EN';
 const reader=async op=>{
   if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:sess}]};
   if(op===__playerOps.PLAYER_SOURCE_QUERY)return src;
   if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();
   throw new Error('bad op');
 };
 const view=await getPlayerLocation(participant().playerAccessToken,'LOC1',{reader});
 assert.equal(view.session.language,'EN');
 assert.equal(view.actions[0].name,'Search');
});

test('location search interactions can be autonomous even when legacy resolution is GM',()=>{
 assert.equal(isAutonomousLocationInteraction({targetType:'LOCATION',name:'Fouiller le bureau',category:'INVESTIGATION',resolution:'GM',validation:'GM',targetSecret:false}),true);
 assert.equal(isAutonomousLocationInteraction({targetType:'CHARACTER',name:'Intimider',category:'SOCIAL',resolution:'GM',validation:'GM',targetSecret:false}),false);
});

test('QR location view exposes only autonomous actions for scanned location',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();throw new Error('bad op')};
 const out=await getPlayerLocation(participant().playerAccessToken,'LOC1',{reader,now:new Date('2026-09-21T18:05:00Z')});
 assert.equal(out.location.name,'Bureau');assert.equal(out.actions.length,1);assert.equal(out.actions[0].externalId,'ACT1');assert.equal(out.actions[0].available,true);
});

test('QR room search is normalized to automatic 1 PA and grants one reward',async()=>{
 const reader=async op=>{
   if(op===__playerOps.PLAYER_ACCESS_QUERY)
     return{sessionParticipants:[{...participant(),gameSession:session()}]};
   if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();
   if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();
   throw new Error('bad op');
 };

 let interactionCalls=0;
 let clueInput;
 let objectInput;
 const writes=[];

 const view=await getPlayerLocation(
   participant().playerAccessToken,
   'LOC1',
   {reader,now:new Date('2026-09-21T18:20:00Z')}
 );

 assert.equal(view.actions[0].resolution,'AUTO');
 assert.equal(view.actions[0].costResourceExternalId,'RES_PA');
 assert.equal(view.actions[0].costValue,1);
 assert.equal(view.actions[0].diceCount,0);

 const out=await executePlayerLocationAction(
   participant().playerAccessToken,
   {
     interactionExternalId:'ACT1',
     locationExternalId:'LOC1',
     actorCharacterExternalId:'CHAR_B'
   },
   {
     reader,
     executor:async(op,vars)=>{writes.push({op,vars});return{};},
     interactionExecutor:async()=>{interactionCalls++;throw new Error('should not run');},
     clueReveal:async(sid,input)=>{clueInput=input;return{};},
     objectTransfer:async(sid,input)=>{objectInput=input;return{};},
     now:new Date('2026-09-21T18:20:00Z')
   }
 );

 assert.equal(interactionCalls,0);
 assert.equal(clueInput.clueExternalId,'C2');
 assert.equal(objectInput.objectExternalId,'ITEM2');
 assert.equal(objectInput.holderExternalId,'CHAR_A');
 assert.equal(out.result.success,true);
 assert.equal(out.result.resolution,'AUTO');
 assert.equal(out.result.cost.value,1);
 assert.equal(out.reward.kind,'CLUE_OBJECT');
 assert.ok(writes.length>=2);
});

test('location discovery returns Media Library override for the physical object',async()=>{
 const src=source();
 src.interactions=[];
 const sess=session();
 sess.scenarioVersion={
   ...sess.scenarioVersion,
   mediaOverridesJson:JSON.stringify({
     'OBJECT:ITEM2':{
       assetExternalId:'MEDIA_CUSTOM_TONIC',
       source:'https://example.test/vocal-tonic.png',
       altText:'Vocal Tonic bottle',
       mediaType:'IMAGE'
     }
   })
 };

 const reader=async op=>{
   if(op===__playerOps.PLAYER_ACCESS_QUERY)
     return{sessionParticipants:[{...participant(),gameSession:sess}]};
   if(op===__playerOps.PLAYER_SOURCE_QUERY)return src;
   if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();
   throw new Error('bad op');
 };

 const out=await executePlayerLocationAction(
   participant().playerAccessToken,
   {
     interactionExternalId:'SYSTEM_LOCATION_SEARCH',
     locationExternalId:'LOC1'
   },
   {
     reader,
     executor:async()=>({}),
     clueReveal:async()=>({}),
     objectTransfer:async()=>({}),
     now:new Date('2026-09-21T18:20:00Z')
   }
 );

 assert.equal(
   out.reward.object.visualMedia.source,
   'https://example.test/vocal-tonic.png'
 );
 assert.equal(
   out.reward.object.visualMedia.altText,
   'Vocal Tonic bottle'
 );
});

test('QR location provides standard 1 PA fallback when no explicit automatic action exists',async()=>{
 const src=source();src.interactions=[];
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return src;if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();throw new Error('bad op')};
 const view=await getPlayerLocation(participant().playerAccessToken,'LOC1',{reader});assert.equal(view.actions[0].externalId,'SYSTEM_LOCATION_SEARCH');assert.equal(view.actions[0].costValue,1);
 let mutation,clueInput,objectInput;
 const out=await executePlayerLocationAction(participant().playerAccessToken,{interactionExternalId:'SYSTEM_LOCATION_SEARCH',locationExternalId:'LOC1'},{reader,executor:async(op,vars)=>{mutation={op,vars};return{};},clueReveal:async(sid,input)=>{clueInput=input;return{};},objectTransfer:async(sid,input)=>{objectInput=input;return{};}});
 assert.equal(mutation.op,__playerOps.INSERT_NOTIFICATION_MUTATION ?? mutation.op); // final write is notification
 assert.equal(clueInput.clueExternalId,'C2');assert.equal(objectInput.objectExternalId,'ITEM2');assert.equal(out.result.cost.remaining,3);
});

test('takeable clue is globally unavailable after another player found it',async()=>{
 const src=source();
 src.interactions=[];
 src.clues.push({
   externalId:'C_TAKE',
   playerName:'Unique note',
   clueType:'DOCUMENT',
   playerText:'Only one copy exists.',
   locationExternalId:'LOC1',
   presentationMode:'TAKEABLE',
   shareable:true,
   addToNotebook:true,
   active:true
 });

 // Remove the physical dossier so only this clue can make the room searchable.
 const rt=runtime();
 rt.sessionObjects=rt.sessionObjects.filter(o=>o.objectExternalId!=='ITEM2');
 rt.sessionClueDiscoveries.push({
   characterExternalId:'CHAR_B',
   clueExternalId:'C_TAKE',
   discoveredAt:'2026-09-21T18:01:00Z'
 });

 const reader=async op=>{
   if(op===__playerOps.PLAYER_ACCESS_QUERY)
     return{sessionParticipants:[{...participant(),gameSession:session()}]};
   if(op===__playerOps.PLAYER_SOURCE_QUERY)return src;
   if(op===__playerOps.PLAYER_RUNTIME_QUERY)return rt;
   throw new Error('bad op');
 };

 const view=await getPlayerLocation(
   participant().playerAccessToken,
   'LOC1',
   {reader,now:new Date('2026-09-21T18:20:00Z')}
 );

 assert.equal(view.empty,true);
 assert.equal(view.actions.length,0);
});

test('static clue remains available to another player but loses priority to takeable evidence',async()=>{
 const src=source();
 src.interactions=[];
 src.clues=src.clues.filter(c=>c.externalId!=='C2');
 src.clues.push(
   {
     externalId:'C_TAKE',
     playerName:'Unique note',
     clueType:'DOCUMENT',
     playerText:'Only one copy exists.',
     locationExternalId:'LOC1',
     presentationMode:'TAKEABLE',
     shareable:true,
     addToNotebook:true,
     active:true
   },
   {
     externalId:'C_STATIC',
     playerName:'Scratch on the wall',
     clueType:'OBSERVATION',
     playerText:'A mark is carved into the wall.',
     locationExternalId:'LOC1',
     presentationMode:'PERSISTENT',
     shareable:true,
     addToNotebook:true,
     active:true
   }
 );

 const rt=runtime();
 rt.sessionObjects=rt.sessionObjects.filter(o=>o.objectExternalId!=='ITEM2');

 const reader=async op=>{
   if(op===__playerOps.PLAYER_ACCESS_QUERY)
     return{sessionParticipants:[{...participant(),gameSession:session()}]};
   if(op===__playerOps.PLAYER_SOURCE_QUERY)return src;
   if(op===__playerOps.PLAYER_RUNTIME_QUERY)return rt;
   throw new Error('bad op');
 };

 let firstClue=null;
 await executePlayerLocationAction(
   participant().playerAccessToken,
   {
     interactionExternalId:'SYSTEM_LOCATION_SEARCH',
     locationExternalId:'LOC1'
   },
   {
     reader,
     executor:async()=>({}),
     clueReveal:async(sid,input)=>{firstClue=input.clueExternalId;return{};},
     objectTransfer:async()=>({})
   }
 );
 assert.equal(firstClue,'C_TAKE');

 // Simulate the unique clue having been taken; the static clue remains.
 rt.sessionClueDiscoveries.push({
   characterExternalId:'CHAR_B',
   clueExternalId:'C_TAKE',
   discoveredAt:'2026-09-21T18:02:00Z'
 });

 let secondClue=null;
 await executePlayerLocationAction(
   participant().playerAccessToken,
   {
     interactionExternalId:'SYSTEM_LOCATION_SEARCH',
     locationExternalId:'LOC1'
   },
   {
     reader,
     executor:async()=>({}),
     clueReveal:async(sid,input)=>{secondClue=input.clueExternalId;return{};},
     objectTransfer:async()=>({}),
     now:new Date('2026-09-21T18:20:00Z')
   }
 );
 assert.equal(secondClue,'C_STATIC');
});

test('global 10 minute search cooldown blocks any second location search without spending PA',async()=>{
 const src=source();
 const rt=runtime();
 rt.sessionInteractionUses=[{interactionExternalId:'ACT1',actorCharacterExternalId:'CHAR_A',targetExternalId:'LOC1',createdAt:'2026-09-21T18:00:00Z',success:false}];
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return src;if(op===__playerOps.PLAYER_RUNTIME_QUERY)return rt;throw new Error('bad op')};
 const view=await getPlayerLocation(participant().playerAccessToken,'LOC1',{reader,now:new Date('2026-09-21T18:05:00Z')});
 assert.equal(view.searchCooldownRemainingSeconds,300);
 assert.equal(view.actions[0].available,false);
 assert.equal(view.actions[0].searchCooldownRemainingSeconds,300);
 let writes=0;
 await assert.rejects(()=>executePlayerLocationAction(participant().playerAccessToken,{interactionExternalId:'ACT1',locationExternalId:'LOC1'},{reader,executor:async()=>{writes++;return{};},now:new Date('2026-09-21T18:05:00Z')}),/Nouvelle fouille disponible/);
 assert.equal(writes,0);
});

test('global search cooldown expires after ten minutes',async()=>{
 const src=source();
 const rt=runtime();
 rt.sessionInteractionUses=[{interactionExternalId:'ACT1',actorCharacterExternalId:'CHAR_A',targetExternalId:'LOC1',createdAt:'2026-09-21T18:00:00Z',success:true}];
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return src;if(op===__playerOps.PLAYER_RUNTIME_QUERY)return rt;throw new Error('bad op')};
 const view=await getPlayerLocation(participant().playerAccessToken,'LOC1',{reader,now:new Date('2026-09-21T18:10:01Z')});
 assert.equal(view.searchCooldownRemainingSeconds,0);
 assert.equal(view.actions[0].available,true);
});


test('player-to-player interaction rejects self targeting before execution',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();};let executed=false;
 await assert.rejects(()=>executePlayerInteraction(participant().playerAccessToken,{interactionExternalId:'ACT_GM',targetExternalId:'CHAR_A',requestOnly:true},{reader,executor:async()=>({}),interactionExecutor:async()=>{executed=true;return{};}}),/SELF_TARGET_FORBIDDEN/);
 assert.equal(executed,false);
});

test('player-to-player interaction rejects a character outside the session',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();};
 await assert.rejects(()=>executePlayerInteraction(participant().playerAccessToken,{interactionExternalId:'ACT_GM',targetExternalId:'CHAR_Z',requestOnly:true},{reader,executor:async()=>({}),interactionExecutor:async()=>({})}),/TARGET_CHARACTER_NOT_IN_SESSION/);
});


test('clandestine classifier distinguishes theft from discreet search',()=>{
 assert.equal(clandestineInteractionKind({name:'Voler dans les poches',category:'THEFT',targetType:'CHARACTER'}),'STEAL');
 assert.equal(clandestineInteractionKind({name:'Fouiller les poches',category:'INV',targetType:'CHARACTER'}),'SEARCH_PLAYER');
 assert.equal(clandestineInteractionKind({name:'Intimider',category:'SOCIAL',targetType:'CHARACTER'}),null);
});

test('successful clandestine theft reveals only stealable target objects and creates one-shot grant',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();throw new Error('bad op')};
 let grantWrite=null;
 const out=await attemptPlayerClandestineAction(participant().playerAccessToken,{interactionExternalId:'ACT_STEAL',targetCharacterExternalId:'CHAR_B'},{reader,executor:async(op,vars)=>{grantWrite={op,vars};return{};},interactionExecutor:async()=>({interactionName:'Voler dans les poches',success:true})});
 assert.equal(out.success,true);assert.equal(out.kind,'STEAL');assert.equal(out.items.length,1);assert.equal(out.items[0].objectExternalId,'ITEM_B');assert.ok(out.grantToken);assert.equal(grantWrite.vars.data.targetCharacterExternalId,'CHAR_B');
});

test('failed clandestine theft creates no grant but anonymously notifies victim',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();throw new Error('bad op')};
 let writes=0;
 const out=await attemptPlayerClandestineAction(participant().playerAccessToken,{interactionExternalId:'ACT_STEAL',targetCharacterExternalId:'CHAR_B'},{reader,executor:async()=>{writes++;return{};},interactionExecutor:async()=>({interactionName:'Voler',success:false})});
 assert.equal(out.success,false);assert.equal(writes,1);assert.equal(out.items.length,0);
});

test('scan mode is explicit when present and backwards-compatible with secret_cible',()=>{
 assert.equal(interactionScanMode({targetType:'CHARACTER',scanMode:'DIRECT',targetSecret:true}),'DIRECT');
 assert.equal(interactionScanMode({targetType:'CHARACTER',scanMode:'DISCRET',targetSecret:false}),'DISCRET');
 assert.equal(interactionScanMode({targetType:'CHARACTER',scanMode:'SELECT',targetSecret:false}),'SELECT');
 assert.equal(interactionScanMode({targetType:'CHARACTER',targetSecret:true}),'DISCRET');
 assert.equal(interactionScanMode({targetType:'CHARACTER',targetSecret:false}),'DIRECT');
 assert.equal(interactionScanMode({targetType:'LOCATION',scanMode:'DIRECT'}),null);
});

test('Informant SELECT action reveals a prepared target rumor without GM approval',async()=>{
 const src=source();
 src.abilities.push({externalId:'ABILITY_INFORMANT',name:'Rumour Network',description:'Get rumour',category:'INFORMATION',defaultLevel:1,secret:false,active:true});
 src.abilityAssignments.push({externalId:'AA_RUMOR',ownerType:'CHARACTER',ownerExternalId:'CHAR_A',abilityExternalId:'ABILITY_INFORMANT',level:1,flatBonus:0,active:true});
 src.interactions.push({externalId:'ACT_INFORMANT',name:'Get a Rumour',category:'INFORMATION',targetType:'CHARACTER',scanMode:'SELECT',abilityExternalId:'ABILITY_INFORMANT',resolution:'AUTO',validation:'AUTO',costResourceExternalId:'RES_PA',costValue:1,limitPerTarget:1,targetSecret:false,active:true});
 src.clues.push({externalId:'RUMOR_1',playerName:'Rumour about Bob',clueType:'RUMOR',playerText:'Bob may be hiding a contract.',discoveryHook:'RUMOR_TARGET:CHAR_B',addToNotebook:true,active:true});

 const rt=runtime();
 const shaped=shapePlayerPortal(participant(),session(),src,rt,new Date('2026-09-21T18:05:00Z'));
 const action=shaped.interactions.find(x=>x.externalId==='ACT_INFORMANT');
 assert.equal(action.scanMode,'SELECT');
 assert.deepEqual(action.targets.map(x=>x.id),['CHAR_B']);

 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return src;if(op===__playerOps.PLAYER_RUNTIME_QUERY)return rt;throw new Error('bad op')};
 const revealed=[];const writes=[];
 const out=await executePlayerInteraction(participant().playerAccessToken,{interactionExternalId:'ACT_INFORMANT',targetExternalId:'CHAR_B'},{reader,executor:async(op,vars)=>{writes.push({op,vars});return{};},interactionExecutor:async()=>({interactionName:'Get a Rumour',success:true}),clueReveal:async(sid,input)=>{revealed.push(input);return{};}});
 assert.equal(out.scanMode,'SELECT');
 assert.equal(out.rumor.text,'Bob may be hiding a contract.');
 assert.equal(revealed[0].clueExternalId,'RUMOR_1');
 const target=writes.map(x=>x.vars?.data).find(x=>x?.characterExternalId==='CHAR_B');
 assert.match(target.body,/rumeur|rumor/i);
});

test('direct character action notifies target without revealing actor',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();throw new Error('bad op')};
 const writes=[];
 const out=await executePlayerInteraction(participant().playerAccessToken,{interactionExternalId:'ACT_DIRECT',targetExternalId:'CHAR_B'},{reader,executor:async(op,vars)=>{writes.push({op,vars});return{};},interactionExecutor:async()=>({interactionName:'Soigner',success:true})});
 assert.equal(out.scanMode,'DIRECT');
 const target=writes.map(x=>x.vars?.data).find(x=>x?.characterExternalId==='CHAR_B');
 assert.ok(target);assert.match(target.body,/Soigner/);assert.doesNotMatch(target.body,/CHAR_A|Alice|Gael/);
});

test('generic discreet character action remains automatic and anonymously notifies target',async()=>{
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();throw new Error('bad op')};
 const writes=[];let captured;
 const out=await executePlayerInteraction(participant().playerAccessToken,{interactionExternalId:'ACT_SPY',targetExternalId:'CHAR_B'},{reader,executor:async(op,vars)=>{writes.push({op,vars});return{};},interactionExecutor:async(sid,input)=>{captured=input;return{interactionName:'Observer discrètement',success:true};}});
 assert.equal(out.scanMode,'DISCRET');assert.match(captured.note,/DISCRET/);
 const target=writes.map(x=>x.vars?.data).find(x=>x?.characterExternalId==='CHAR_B');
 assert.ok(target);assert.doesNotMatch(target.body,/CHAR_A|Alice|Gael/);
});

test('claim stolen object is atomic and victim notification hides culprit and item',async()=>{
 const rt=runtime();rt.sessionStealGrants=[{grantToken:'GRANT_12345678901234567890123456789012',interactionExternalId:'ACT_STEAL',actorCharacterExternalId:'CHAR_A',targetCharacterExternalId:'CHAR_B',kind:'STEAL',status:'OPEN',createdAt:'2026-09-21T18:05:00Z',expiresAt:'2026-09-21T18:10:00Z',usedAt:null,chosenObjectExternalId:null}];
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return rt;throw new Error('bad op')};
 let write;
 const out=await claimPlayerStolenObject(participant().playerAccessToken,{grantToken:'GRANT_12345678901234567890123456789012',objectExternalId:'ITEM_B'},{reader,executor:async(op,vars)=>{write={op,vars};return{};},now:new Date('2026-09-21T18:06:00Z')});
 assert.equal(out.stolen,true);assert.equal(out.object.name,'Portefeuille');assert.equal(write.vars.notification.characterExternalId,'CHAR_B');assert.equal(write.vars.notification.refExternalId,null);assert.doesNotMatch(write.vars.notification.body,/Alice|Clé|Portefeuille|CHAR_A/);
});

test('V1.6.1 portal exposes owned documentary clues in both bag and notebook model plus own action history',()=>{
 const rt=runtime();
 rt.sessionObjects=rt.sessionObjects.map(o=>o.objectExternalId==='ITEM2'?{...o,holderType:'CHARACTER',holderExternalId:'CHAR_A'}:o);
 rt.sessionActionLogs=[{id:'LOG1',actionType:'INTERACTION_EXECUTE',characterExternalId:'CHAR_A',refExternalId:'ACT1',note:'Fouille du bureau',createdAt:'2026-09-21T18:04:30Z'},{id:'LOG2',actionType:'INTERACTION_EXECUTE',characterExternalId:'CHAR_B',refExternalId:'ACT1',note:'Autre joueur',createdAt:'2026-09-21T18:04:40Z'}];
 const out=shapePlayerPortal(participant(),session(),source(),rt,new Date('2026-09-21T18:05:00Z'));
 assert.equal(out.documentEntries.length,2);
 const dossier=out.documentEntries.find(d=>d.clueExternalId==='C2');
 assert.equal(dossier.objectExternalId,'ITEM2');
 assert.equal(out.actionLogs.length,1);
 assert.equal(out.actionLogs[0].id,'LOG1');
});

test('V1.6.1 giving a documentary object preserves knowledge for sender and grants it to receiver',async()=>{
 const rt=runtime();
 rt.sessionObjects=rt.sessionObjects.map(o=>o.objectExternalId==='ITEM2'?{...o,holderType:'CHARACTER',holderExternalId:'CHAR_A'}:o);
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return source();if(op===__playerOps.PLAYER_RUNTIME_QUERY)return rt;throw new Error('bad op')};
 const revealed=[];let moved;
 await transferPlayerObject(participant().playerAccessToken,{objectExternalId:'ITEM2',targetCharacterExternalId:'CHAR_B'},{reader,executor:async()=>({}),objectTransfer:async(sid,input)=>{moved=input;return input;},clueReveal:async(sid,input)=>{revealed.push(input);return{};}});
 assert.equal(moved.holderExternalId,'CHAR_B');
 assert.equal(revealed.length,2);
 assert.deepEqual(revealed.map(x=>x.characterExternalId),['CHAR_A','CHAR_B']);
 assert.ok(revealed.every(x=>x.clueExternalId==='C2'));
});

test('V1.11C own location is flagged and exposes no search action',async()=>{
 const src=source();
 src.gameLocations=src.gameLocations.map(l=>l.externalId==='LOC1'?{...l,lockExternalId:'OWNER:CHAR_A'}:l);
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return src;if(op===__playerOps.PLAYER_RUNTIME_QUERY)return runtime();throw new Error('bad op')};
 const view=await getPlayerLocation(participant().playerAccessToken,'LOC1',{reader});
 assert.equal(view.forbidden,true);
 assert.equal(view.empty,false);
 assert.equal(view.actions.length,0);
 await assert.rejects(()=>executePlayerLocationAction(participant().playerAccessToken,{interactionExternalId:'ACT1',locationExternalId:'LOC1'},{reader,executor:async()=>({})}),/LOCATION_OWNED_BY_CHARACTER/);
});

test('V1.11C exhausted location is flagged and exposes no search action',async()=>{
 const src=source();
 src.clues=src.clues.filter(c=>c.locationExternalId!=='LOC1');
 const rt=runtime();
 rt.sessionObjects=rt.sessionObjects.filter(o=>!(o.holderType==='LOCATION'&&o.holderExternalId==='LOC1'));
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return{sessionParticipants:[{...participant(),gameSession:session()}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return src;if(op===__playerOps.PLAYER_RUNTIME_QUERY)return rt;throw new Error('bad op')};
 const view=await getPlayerLocation(participant().playerAccessToken,'LOC1',{reader});
 assert.equal(view.forbidden,false);
 assert.equal(view.empty,true);
 assert.equal(view.actions.length,0);
 await assert.rejects(()=>executePlayerLocationAction(participant().playerAccessToken,{interactionExternalId:'ACT1',locationExternalId:'LOC1'},{reader,executor:async()=>({})}),/LOCATION_EMPTY/);
});
