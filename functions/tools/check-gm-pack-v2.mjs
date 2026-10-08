import {getSessionGmPack} from '../src/gm-pack-session.mjs';

const sessionId='9e60756629c5466bbd31bb8e07e99848';
const pack=await getSessionGmPack(sessionId);

const byMode={};
for(const clue of pack.materials?.clues??[]){
  const label=clue.acquisition?.label??'UNKNOWN';
  byMode[label]=(byMode[label]??0)+1;
}

const diagnostics=(pack.diagnostics??[]).map(d=>({
  severity:d.severity,
  title:d.title,
  message:d.message,
}));

console.log(JSON.stringify({
  scenario:pack.scenario?.title,
  session:pack.session?.name,
  counts:pack.counts,
  plots:(pack.preparation?.plots??[]).map(p=>({
    externalId:p.externalId,
    title:p.title,
    characters:p.characters?.length??0,
    clues:p.clues?.length??0,
    majorClues:p.majorClueCount??0,
  })),
  clueModes:byMode,
  majorClues:(pack.materials?.clues??[])
    .filter(c=>c.major)
    .map(c=>({
      externalId:c.externalId,
      name:c.playerName,
      mode:c.acquisition?.label,
      physical:c.acquisition?.physical,
    })),
  diagnostics,
  playerAccessCount:pack.session?.playerAccess?.length??0,
},null,2));
