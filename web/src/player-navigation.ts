export type ReadEntry = { id:string; section:string; revision:string; read?:boolean; notificationId?:string };
export function fingerprint(value:unknown):string {
  const text=JSON.stringify(value)??'';
  let hash=2166136261;
  for(let i=0;i<text.length;i++) hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return (hash>>>0).toString(36);
}

// Only merge records already authorized by the player portal. A remembered
// document is still readable after its physical support has changed hands.
export function playerClues(portal:any):any[] {
  const map=new Map<string,any>();
  const inventory=new Map<string,any>((portal.inventory??[]).map((o:any)=>[o.objectExternalId,o]));
  for(const d of portal.discoveries??[]) {
    if(!d.clue)continue;
    const object=inventory.get(d.clue.objectExternalId);
    map.set(d.clueExternalId,{...d.clue,clueExternalId:d.clueExternalId,externalId:d.clueExternalId,discoveredAt:d.discoveredAt,owned:!!object||!!d.clue.inBag,object:object??null});
  }
  for(const d of portal.documentEntries??[]) {
    const previous=map.get(d.clueExternalId);
    map.set(d.clueExternalId,{...previous,...d,externalId:d.clueExternalId,discoveredAt:previous?.discoveredAt??d.discoveredAt,owned:true,object:d.object??inventory.get(d.objectExternalId)??null});
  }
  return [...map.values()].sort((a,b)=>dateValue(b.discoveredAt)-dateValue(a.discoveredAt));
}
function dateValue(value:any) { const n=Date.parse(value??''); return Number.isFinite(n)?n:0; }
export function clueRecap(clue:any):string {
  // An extract, never an inference from GM fields, hidden facts or other clues.
  const text=String(clue.playerText??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  const first=text.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim()??text;
  if(first.length<=260)return first;
  return first.slice(0,257).replace(/\s+\S*$/,'')+'…';
}
export function playerInfoFeed(portal:any):any[] {
  const clues=playerClues(portal);
  const linked=new Set(clues.flatMap(c=>(c.knownFacts??[]).map((f:any)=>f.externalId)));
  return [
    ...clues.map(clue=>({id:`info:clue:${clue.externalId}`,kind:'clue',at:clue.discoveredAt,title:clue.playerName,body:clueRecap(clue),clue})),
    ...(portal.knowledge??[]).filter((k:any)=>k.fact&&!linked.has(k.factExternalId)).map((k:any)=>({id:`info:fact:${k.factExternalId}`,kind:'fact',at:k.learnedAt,title:k.fact.title,body:k.fact.text,category:k.fact.notebookCategory})),
    ...(portal.notifications??[]).map((n:any)=>({id:`info:notification:${n.id}`,kind:'notification',at:n.createdAt,title:n.title,body:n.body,notification:n})),
    ...(portal.voteResults??[]).map((vote:any)=>({id:`info:result:${vote.externalId}:${vote.round}`,kind:'result',at:vote.closedAt,title:vote.title,vote})),
  ].sort((a,b)=>dateValue(b.at)-dateValue(a.at)||a.id.localeCompare(b.id));
}
export function playerReadEntries(portal:any):ReadEntry[] {
  if(!portal)return [];
  const c=portal.character??{};
  const entry=(id:string,section:string,value:unknown):ReadEntry=>({id,section,revision:fingerprint(value)});
  return [
    entry('sheet:story','sheet:story',[c.biography,c.secretIntro,c.apparentMotive,c.personalTimeline,portal.discoverableAboutMe]),
    ...(portal.objectives??[]).map((o:any)=>entry(`sheet:mission:${o.externalId}`,'sheet:missions',[o.title,o.description,o.status,o.progress,o.notes])),
    ...(c.interpretationNotes||c.appearanceNotes?[entry('sheet:roleplay','sheet:roleplay',[c.interpretationNotes,c.appearanceNotes])]:[]),
    entry('sheet:qr','sheet:qr',c.externalId),
    entry('notebook:context','notebook:context',portal.session?.playerSummary),
    ...(portal.relationships??[]).map((r:any)=>entry(`relation:${r.externalId}`,'notebook:relations',[r.otherName,r.otherPublicRole,r.text])),
    ...playerInfoFeed(portal).map(row=>({...entry(row.id,'notebook:info',[row.title,row.body,row.clue?.knownFacts,row.vote]),read:!!row.notification?.readAt,notificationId:row.notification?.id})),
    ...(portal.resources??[]).filter((r:any)=>['RES_PA','RES_CASH'].includes(r.resourceExternalId)).map((r:any)=>entry(`resource:${r.resourceExternalId}`,'bag:resources',[r.currentValue,r.maxValue])),
    ...playerClues(portal).map(clue=>entry(`bag:clue:${clue.externalId}`,'bag:clues',[clue.playerName,clue.playerText,clue.owned,clue.immersiveDocument])),
    ...(portal.inventory??[]).filter((o:any)=>!playerClues(portal).some(c=>c.objectExternalId===o.objectExternalId)).map((o:any)=>entry(`bag:object:${o.objectExternalId}`,'bag:clues',[o.name,o.identification,o.charges])),
    ...(portal.votes??[]).map((v:any)=>entry(`play:vote:${v.externalId}:${v.round}`,'play',[v.title,v.question,v.options])),
    ...(portal.pendingAbilityRequests??[]).map((r:any)=>entry(`play:request:${r.grantToken}`,'play',[r.kind,r.actorName,r.options,r.dealTerms])),
  ];
}
export function unreadCount(entries:ReadEntry[],seen:Record<string,string>,section:string) {
  return entries.filter(e=>(e.section===section||e.section.startsWith(section+':'))&&!e.read&&seen[e.id]!==e.revision).length;
}
