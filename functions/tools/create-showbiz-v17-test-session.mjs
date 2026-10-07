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
import { writeFile } from 'node:fs/promises';

const SESSION_NAME='TEST – SHOWBIZ V1.7 – 21 joueurs';

const library=await listScenarioLibrary();
const candidates=library.flatMap(s=>
  (s.versions??[]).map(v=>({scenario:s,version:v}))
).filter(x=>
  /showbiz/i.test(String(x.scenario.title??'')) &&
  String(x.version.versionLabel??'')==='1.7'
);

const chosen=candidates.sort((a,b)=>
  new Date(b.version.importedAt??0).getTime()-
  new Date(a.version.importedAt??0).getTime()
)[0];

if(!chosen){
  throw new Error('SHOWBIZ_V1_7_NOT_FOUND');
}

const existing=(await listGameSessions()).find(s=>
  s.name===SESSION_NAME &&
  s.scenarioVersion?.id===chosen.version.id
);

let sessionId=existing?.id??null;
let created=false;

if(!sessionId){
  const createdSession=await createGameSession({
    versionId:chosen.version.id,
    name:SESSION_NAME,
    language:'EN',
    venue:'TEST',
    notes:'Session de test automatique SHOWBIZ V1.7 — 21 personnages, casting 1:1.',
  });
  sessionId=createdSession.id;
  created=true;
}

let detail=await getGameSession(sessionId);

if(detail.runtimeInitializedAt){
  const access=await configureSessionPlayerAccess(sessionId,true);
  const output={
    created,
    reused:true,
    sessionId,
    sessionName:SESSION_NAME,
    versionId:chosen.version.id,
    versionLabel:chosen.version.versionLabel,
    sourceFilename:chosen.version.sourceFilename,
    status:detail.status,
    runtimeInitialized:true,
    playerLinks:access.links.map(x=>({
      characterExternalId:x.characterExternalId,
      displayName:x.displayName,
      url:`https://murder-engine-ludificateur.web.app/?player=${encodeURIComponent(x.token)}`,
    })),
  };
  await writeFile('showbiz-test-session.json',JSON.stringify(output,null,2),'utf8');
  console.log(JSON.stringify({...output,playerLinksCount:output.playerLinks.length,playerLinks:'[omitted from log]'},null,2));
  process.exit(0);
}

const characters=[...(detail.characters??[])]
  .filter(c=>c.playable!==false&&c.active!==false)
  .sort((a,b)=>String(a.name).localeCompare(String(b.name)));

if(characters.length!==21){
  throw new Error('EXPECTED_21_PLAYABLE_CHARACTERS_GOT_'+characters.length);
}

// Reuse existing test participants from a previous partial run when possible.
detail=await getGameSession(sessionId);

const participantByCharacter=new Map(
  (detail.participants??[])
    .filter(p=>p.characterExternalId)
    .map(p=>[p.characterExternalId,p])
);

const participantByName=new Map(
  (detail.participants??[])
    .map(p=>[p.displayName,p])
);

for(let i=0;i<characters.length;i++){
  const character=characters[i];
  const displayName='TEST – '+character.name;

  let participant=participantByCharacter.get(character.externalId)
    ?? participantByName.get(displayName)
    ?? null;

  if(!participant){
    const email=`showbiz.test.${String(i+1).padStart(2,'0')}@example.invalid`;

    const createdParticipant=await addGameSessionParticipant(sessionId,{
      displayName,
      email,
      ageBracket:'26_40',
      genderPreference:'SANS_PREFERENCE',
      desiredInvolvement:'ACTIF',
      source:'MANUAL',
      notes:'Participant de test automatique pour '+character.name,
    });

    participant={
      id:createdParticipant.id,
      displayName,
      characterExternalId:null,
    };

    participantByName.set(displayName,participant);
  }

  if(participant.characterExternalId!==character.externalId){
    await assignCharacterToParticipant(
      sessionId,
      participant.id,
      character.externalId
    );
    participant.characterExternalId=character.externalId;
    participantByCharacter.set(character.externalId,participant);
  }
}

detail=await getGameSession(sessionId);

if(
  detail.counts.participants!==21 ||
  detail.counts.assigned!==21 ||
  detail.counts.unassignedParticipants!==0 ||
  detail.counts.unassignedCharacters!==0
){
  throw new Error(
    'TEST_SESSION_CASTING_COUNTS_INVALID_'+
    JSON.stringify(detail.counts)
  );
}

// Freeze canonical character sheets for this test session.
const frozen=await freezeSessionIncarnations(sessionId);

// READY -> runtime
await setGameSessionStatus(sessionId,'READY');
const runtime=await initializeSessionRuntime(sessionId);

// Enable player portals
const access=await configureSessionPlayerAccess(sessionId,true);

detail=await getGameSession(sessionId);

const output={
  created,
  reused:false,
  sessionId,
  sessionName:SESSION_NAME,
  versionId:chosen.version.id,
  versionLabel:chosen.version.versionLabel,
  sourceFilename:chosen.version.sourceFilename,
  status:detail.status,
  counts:detail.counts,
  frozen,
  runtime,
  playerLinks:access.links
    .map(x=>({
      characterExternalId:x.characterExternalId,
      displayName:x.displayName,
      url:`https://murder-engine-ludificateur.web.app/?player=${encodeURIComponent(x.token)}`,
    }))
    .sort((a,b)=>a.displayName.localeCompare(b.displayName)),
};

await writeFile(
  'showbiz-test-session.json',
  JSON.stringify(output,null,2),
  'utf8'
);

console.log(JSON.stringify({
  created:output.created,
  sessionId:output.sessionId,
  sessionName:output.sessionName,
  versionId:output.versionId,
  versionLabel:output.versionLabel,
  sourceFilename:output.sourceFilename,
  status:output.status,
  counts:output.counts,
  frozen:output.frozen,
  runtime:output.runtime,
  playerLinksCount:output.playerLinks.length,
},null,2));
