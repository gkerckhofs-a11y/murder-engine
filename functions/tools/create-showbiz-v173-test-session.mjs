import { listScenarioLibrary } from '../src/library.mjs';
import {
  listGameSessions,
  createGameSession,
  addGameSessionParticipant,
  assignCharacterToParticipant,
  setGameSessionStatus,
  getGameSession,
} from '../src/sessions.mjs';
import { freezeSessionIncarnations } from '../src/session-incarnations.mjs';
import { initializeSessionRuntime } from '../src/runtime.mjs';
import { configureSessionPlayerAccess } from '../src/player.mjs';

const TARGET_VERSION='1.7.3';
const SESSION_NAME='TEST – SHOWBIZ V1.7.3 – 21 joueurs';

const library=await listScenarioLibrary();

const candidates=library.flatMap(s=>
  (s.versions??[]).map(v=>({scenario:s,version:v}))
).filter(x=>
  /showbiz/i.test(String(x.scenario.title??'')) ||
  /showbiz/i.test(String(x.version.sourceScenarioId??'')) ||
  /showbiz/i.test(String(x.version.sourceFilename??''))
);

if(!candidates.length)
  throw new Error('SHOWBIZ_VERSION_NOT_FOUND');

const chosen=candidates.sort((a,b)=>
  new Date(b.version.importedAt??0).getTime()-
  new Date(a.version.importedAt??0).getTime()
)[0];

if(String(chosen.version.versionLabel??'')!==TARGET_VERSION){
  throw new Error(
    'LATEST_SHOWBIZ_VERSION_IS_'+
    String(chosen.version.versionLabel??'UNKNOWN')+
    '_EXPECTED_'+TARGET_VERSION
  );
}

const existing=(await listGameSessions()).find(s=>
  s.name===SESSION_NAME &&
  s.scenarioVersion?.id===chosen.version.id
);

let sessionId=existing?.id??null;
let created=false;

if(!sessionId){
  const session=await createGameSession({
    versionId:chosen.version.id,
    name:SESSION_NAME,
    language:chosen.version.language??'EN',
    venue:'TEST',
    notes:'Session de test automatique SHOWBIZ V1.7.3 — 21 personnages, casting 1:1.',
  });
  sessionId=session.id;
  created=true;
}

let detail=await getGameSession(sessionId);

const playable=[...(detail.characters??[])]
  .filter(c=>c.playable!==false&&c.active!==false)
  .sort((a,b)=>String(a.name).localeCompare(String(b.name)));

if(playable.length!==21)
  throw new Error('EXPECTED_21_PLAYABLE_CHARACTERS_GOT_'+playable.length);

if(!detail.runtimeInitializedAt){
  let participantByName=new Map(
    (detail.participants??[]).map(p=>[p.displayName,p])
  );

  for(let i=0;i<playable.length;i++){
    const character=playable[i];
    const displayName='TEST – '+character.name;

    if(!participantByName.has(displayName)){
      await addGameSessionParticipant(sessionId,{
        displayName,
        email:`showbiz.v173.test.${String(i+1).padStart(2,'0')}@example.invalid`,
        ageBracket:'26_40',
        genderPreference:'SANS_PREFERENCE',
        desiredInvolvement:'ACTIF',
        source:'MANUAL',
        notes:'Participant de test automatique pour '+character.name,
      });
    }
  }

  detail=await getGameSession(sessionId);
  participantByName=new Map(
    (detail.participants??[]).map(p=>[p.displayName,p])
  );

  for(const character of playable){
    const displayName='TEST – '+character.name;
    const participant=participantByName.get(displayName);

    if(!participant)
      throw new Error('TEST_PARTICIPANT_NOT_FOUND_'+character.externalId);

    if(participant.characterExternalId!==character.externalId){
      await assignCharacterToParticipant(
        sessionId,
        participant.id,
        character.externalId
      );
    }
  }

  detail=await getGameSession(sessionId);

  if(
    detail.counts.participants!==21 ||
    detail.counts.assigned!==21 ||
    detail.counts.unassignedParticipants!==0 ||
    detail.counts.unassignedCharacters!==0
  ){
    throw new Error('CASTING_INVALID_'+JSON.stringify(detail.counts));
  }

  await freezeSessionIncarnations(sessionId);
  await setGameSessionStatus(sessionId,'READY');
  await initializeSessionRuntime(sessionId);
}

const access=await configureSessionPlayerAccess(sessionId,true);
detail=await getGameSession(sessionId);

console.log(JSON.stringify({
  created,
  sessionId,
  sessionName:SESSION_NAME,
  scenarioTitle:chosen.scenario.title,
  versionId:chosen.version.id,
  versionLabel:chosen.version.versionLabel,
  sourceFilename:chosen.version.sourceFilename,
  importedAt:chosen.version.importedAt,
  status:detail.status,
  counts:detail.counts,
  runtimeInitialized:Boolean(detail.runtimeInitializedAt),
  playerAccessCount:access.links?.length??0,
},null,2));
