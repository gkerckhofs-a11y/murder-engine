import test from 'node:test';
import assert from 'node:assert/strict';
import {
  examinationAliases,
  isDocumentExaminable,
  planDocumentExamination,
  verifyDocumentPossession,
} from '../src/document-analysis.mjs';
import { examinePlayerDocument } from '../src/player.mjs';

const token='A'.repeat(40);
function fixture(holder='KARL') {
  const source={
    documentDefinitions:[{externalId:'TELE',title:'Un plan illisible',support:'PHYSICAL',active:true}],
    gameObjects:[{externalId:'DOC_OBJ_TELE',active:true}],
    clues:[
      {externalId:'C_TELE',objectExternalId:'DOC_OBJ_TELE',documentExternalId:'TELE',active:true},
      {externalId:'C_CUN',documentExternalId:'CUNEI',active:true},
    ],
    facts:[
      {externalId:'F_PARTIAL',title:'Invention militaire',text:'Un puissant dispositif d artillerie.',active:true},
      {externalId:'F_FULL',title:'Teleforce',text:'L analyse scientifique complète.',active:true},
      {externalId:'F_CUN',title:'Tablette traduite',text:'Un roi ancien a signé le décret.',active:true},
      {externalId:'F_AUTH',title:'Faux manifeste',text:'Le papier est anachronique.',active:true},
    ],
    abilities:[
      {externalId:'SCI',name:'Analyse scientifique',active:true},
      {externalId:'CUN',name:'Lire le cunéiforme',active:true},
      {externalId:'AUTH',name:'Authentification',active:true},
    ],
    abilityAssignments:[
      {ownerType:'CHARACTER',ownerExternalId:'KARL',abilityExternalId:'SCI',level:1,active:true},
      {ownerType:'CHARACTER',ownerExternalId:'CATHERINE',abilityExternalId:'SCI',level:2,active:true},
      {ownerType:'CHARACTER',ownerExternalId:'ARCHEO',abilityExternalId:'CUN',level:2,active:true},
      {ownerType:'CHARACTER',ownerExternalId:'ARCHEO',abilityExternalId:'AUTH',level:1,active:true},
    ],
    documentAnalysisDefinitions:[
      {externalId:'A1',targetType:'DOCUMENT',targetExternalId:'TELE',abilityExternalId:'SCI',minLevel:1,factExternalId:'F_PARTIAL',active:true},
      {externalId:'A2',targetType:'DOCUMENT',targetExternalId:'TELE',abilityExternalId:'SCI',minLevel:2,factExternalId:'F_FULL',active:true},
      {externalId:'A3',targetType:'CLUE',targetExternalId:'C_CUN',abilityExternalId:'CUN',minLevel:2,factExternalId:'F_CUN',active:true},
      {externalId:'A4',targetType:'CLUE',targetExternalId:'C_CUN',abilityExternalId:'AUTH',minLevel:1,factExternalId:'F_AUTH',active:true},
    ],
  };
  source.documentDefinitions.push({externalId:'CUNEI',title:'Tablette',support:'DIGITAL',active:true});
  const runtime={
    sessionObjects:[{objectExternalId:'DOC_OBJ_TELE',holderType:'CHARACTER',holderExternalId:holder,inPlay:true}],
    sessionClueDiscoveries:[{characterExternalId:'ARCHEO',clueExternalId:'C_CUN'}],
    sessionKnowledges:[],
  };
  return {source,runtime};
}

test('the same physical plan yields nothing, a partial text, or complete analysis by level',()=>{
  for(const [holder,expected] of [
    ['NOVICE',[]],
    ['KARL',['F_PARTIAL']],
    ['CATHERINE',['F_PARTIAL','F_FULL']],
  ]){
    const {source,runtime}=fixture(holder);
    const a=planDocumentExamination(source,runtime,holder,'OBJECT','DOC_OBJ_TELE');
    assert.deepEqual(a.results.map(x=>x.factExternalId),expected);
  }
});

test('a document configured via DOCUMENT is also discoverable from its linked CLUE or OBJECT',()=>{
  const {source}=fixture();
  assert.equal(isDocumentExaminable(source,'OBJECT','DOC_OBJ_TELE'),true);
  assert.equal(isDocumentExaminable(source,'CLUE','C_TELE'),true);
  assert.equal(isDocumentExaminable(source,'DOCUMENT','TELE'),true);
  assert.equal(examinationAliases(source,'OBJECT','DOC_OBJ_TELE').has('DOCUMENT:TELE'),true);
});

test('archaeologist can translate cuneiform and authenticate an unrelated fake through distinct abilities',()=>{
  const {source,runtime}=fixture();
  const expert=planDocumentExamination(source,runtime,'ARCHEO','CLUE','C_CUN');
  assert.deepEqual(expert.results.map(x=>x.factExternalId),['F_CUN','F_AUTH']);
  runtime.sessionClueDiscoveries.push({characterExternalId:'NOVICE',clueExternalId:'C_CUN'});
  assert.deepEqual(planDocumentExamination(source,runtime,'NOVICE','CLUE','C_CUN').results,[]);
});

test('a previous owner loses examination access when the physical object is transferred',()=>{
  const {source,runtime}=fixture('KARL');
  verifyDocumentPossession(source,runtime,'KARL','DOCUMENT','TELE');
  runtime.sessionObjects[0].holderExternalId='CATHERINE';
  assert.throws(()=>planDocumentExamination(source,runtime,'KARL','DOCUMENT','TELE'),{message:'DOCUMENT_NOT_IN_INVENTORY'});
  assert.deepEqual(planDocumentExamination(source,runtime,'CATHERINE','DOCUMENT','TELE').results.map(x=>x.factExternalId),['F_PARTIAL','F_FULL']);
});

test('a discovered digital clue is examinable, but historical physical discovery never implies current possession',()=>{
  const {source,runtime}=fixture('CATHERINE');
  assert.equal(planDocumentExamination(source,runtime,'ARCHEO','DOCUMENT','CUNEI').results.length,2);
  runtime.sessionClueDiscoveries.push({characterExternalId:'KARL',clueExternalId:'C_TELE'});
  assert.throws(()=>planDocumentExamination(source,runtime,'KARL','CLUE','C_TELE'),{message:'DOCUMENT_NOT_IN_INVENTORY'});
});

test('inactive abilities and analysis rules never reveal private facts',()=>{
  const {source,runtime}=fixture('KARL');
  source.abilityAssignments[0].active=false;
  assert.deepEqual(planDocumentExamination(source,runtime,'KARL','DOCUMENT','TELE').results,[]);
  source.documentAnalysisDefinitions[0].active=false;
  assert.equal(planDocumentExamination(source,runtime,'KARL','DOCUMENT','TELE').results.length,0);
});

test('old scenarios remain unchanged when no analysis rules are configured',()=>{
  const {source,runtime}=fixture('KARL');
  source.documentAnalysisDefinitions=[];
  assert.equal(isDocumentExaminable(source,'DOCUMENT','TELE'),false);
  assert.throws(()=>planDocumentExamination(source,runtime,'KARL','DOCUMENT','TELE'),{message:'DOCUMENT_NOT_ANALYZABLE'});
});

test('player endpoint grants only the expert facts, once, with the existing knowledge store',async()=>{
  const {source,runtime}=fixture('KARL');
  const participant={
    id:'PART_KARL',characterExternalId:'KARL',active:true,playerAccessEnabled:true,
    gameSession:{id:'SESSION_1',status:'LIVE',runtimeInitializedAt:'2026-11-06T16:00:00Z',
      scenarioVersion:{id:'VERSION_1'},
      sessionParticipants_on_gameSession:[{characterExternalId:'KARL',active:true}],
    },
  };
  const reader=async(operation)=>{
    if(operation.includes('query PlayerAccessByToken'))return {sessionParticipants:[participant]};
    if(operation.includes('query PlayerSource'))return source;
    if(operation.includes('query PlayerRuntime'))return runtime;
    throw new Error('unexpected read');
  };
  const writes=[];
  const executor=async(operation,args)=>{writes.push({operation,args}); return {};};
  const input={targetType:'DOCUMENT',targetExternalId:'TELE'};
  const result=await examinePlayerDocument(token,input,{reader,executor,now:new Date('2026-11-06T16:10:00Z')});
  assert.equal(result.newFactCount,1);
  assert.deepEqual(result.results.map(x=>x.factExternalId),['F_PARTIAL']);
  assert.equal(writes.filter(w=>w.operation.includes('sessionKnowledge_insert')).length,1);
  assert.equal(writes.find(w=>w.operation.includes('sessionKnowledge_insert')).args.data.sourceType,'DOCUMENT_ANALYSIS');

  runtime.sessionKnowledges.push({characterExternalId:'KARL',factExternalId:'F_PARTIAL'});
  writes.length=0;
  const again=await examinePlayerDocument(token,input,{reader,executor});
  assert.equal(again.newFactCount,0);
  assert.equal(writes.length,0);
});
