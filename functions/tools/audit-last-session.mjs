// Read-only production diagnosis. No player endpoints, mutation, messages or gameplay.
// All session data is encrypted before leaving the runner; logs contain counts only.
import {initializeApp} from 'firebase-admin/app';
import {getDataConnect} from 'firebase-admin/data-connect';
import {GoogleAuth} from 'google-auth-library';
import {randomBytes,publicEncrypt,createCipheriv} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const project='murder-engine-ludificateur';
if(process.env.GOOGLE_CLOUD_PROJECT!==project)throw Error('PROJECT_GUARD');
initializeApp({projectId:project});
const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
const report={capturedAt:new Date().toISOString(),errors:[]};
async function read(query,variables={}){
  if(!/^query\s/.test(query.trim()))throw Error('READ_ONLY_GUARD');
  const r=await dc.executeGraphqlRead(query,{variables});
  if(r.errors?.length)throw Error(JSON.stringify(r.errors));
  return r.data??r;
}
async function part(name,fn){try{return await fn();}catch(e){report.errors.push({part:name,message:String(e.message),code:e.code??e.response?.status});return null;}}
report.overview=await part('overview',()=>read(`query AuditOverview {
 gameSessions(limit:500,orderBy:{createdAt:DESC}) { id name venue status scheduledAt startedAt finishedAt pausedAt realSessionStartedAt rehearsalOfId activeRehearsalId liveElapsedSeconds createdAt runtimeInitializedAt scenarioVersion {id versionLabel scenario {title}} }
 sessionActionLogs(limit:2000,orderBy:{createdAt:DESC}) {gameSessionId actionType refExternalId characterExternalId createdAt}
}`));
if(report.overview){
 const latest=new Map();
 for(const row of report.overview.sessionActionLogs??[])if(!latest.has(row.gameSessionId))latest.set(row.gameSessionId,row.createdAt);
 const candidates=(report.overview.gameSessions??[]).filter(s=>latest.has(s.id)||s.startedAt).sort((a,b)=>Date.parse(latest.get(b.id)||b.startedAt)-Date.parse(latest.get(a.id)||a.startedAt)).slice(0,3);
 report.sessions=[];
 for(const s of candidates){
  const detail=await part('detail:'+s.id,()=>read(`query AuditDetail($id:UUID!){
   gameSession(id:$id){id name status startedAt pausedAt finishedAt realSessionStartedAt rehearsalOfId liveElapsedSeconds scenarioVersion {id versionLabel scenario {title} characters_on_scenarioVersion {externalId name publicRole}}}
   sessionParticipants(where:{gameSessionId:{eq:$id}},limit:200){id displayName characterExternalId characterDisplayName active playerAccessEnabled playerFirstOpenedAt playerLastOpenedAt playerOpenCount briefingReadAt}
   sessionCasino(key:{gameSessionId:$id}){revision stateJson updatedAt}
   sessionResources(where:{gameSessionId:{eq:$id}},limit:2000){characterExternalId resourceExternalId initialValue currentValue maxValue updatedAt}
   sessionActionLogs(where:{gameSessionId:{eq:$id}},orderBy:{createdAt:ASC},limit:10000){id actionType characterExternalId refExternalId beforeValue afterValue deltaValue note createdAt}
   sessionInteractionUses(where:{gameSessionId:{eq:$id}},orderBy:{createdAt:ASC},limit:5000){interactionExternalId actorCharacterExternalId targetType targetExternalId success resolution costResourceExternalId costValue note createdAt}
   sessionClueDiscoveries(where:{gameSessionId:{eq:$id}},limit:5000){characterExternalId clueExternalId sourceInteractionExternalId sourceRef discoveredAt}
   sessionObjects(where:{gameSessionId:{eq:$id}},limit:2000){objectExternalId holderType holderExternalId inPlay updatedAt}
   sessionEvents(where:{gameSessionId:{eq:$id}},limit:500){eventExternalId status firedAt acknowledgedAt skippedAt updatedAt}
   sessionObjectives(where:{gameSessionId:{eq:$id}},limit:2000){characterExternalId objectiveExternalId status progress updatedAt}
   sessionPlayerNotifications(where:{gameSessionId:{eq:$id}},limit:2000){characterExternalId kind title createdAt readAt}
  }`,{id:s.id}));
  if(detail)report.sessions.push(detail);
 }
 const auth=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient();
 report.deployedFunctions=await part('function-metadata',async()=>{
  const r=await auth.request({url:`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/europe-west1/functions`,params:{pageSize:1000}});
  return (r.data.functions??[]).map(f=>({name:f.name,state:f.state,updateTime:f.updateTime,revision:f.serviceConfig?.revision}));
 });
 if(candidates.length){
  const date=new Date(latest.get(candidates[0].id)||candidates[0].startedAt);date.setUTCHours(0,0,0,0);
  const end=new Date(date.getTime()+2*86400000);
  report.loggingWindow={from:date.toISOString(),to:end.toISOString()};
  report.cloudErrors=await part('cloud-errors',async()=>{
   const rows=[];let pageToken;
   for(let page=0;page<10;page++){
    const r=await auth.request({url:'https://logging.googleapis.com/v2/entries:list',method:'POST',data:{resourceNames:[`projects/${project}`],filter:`timestamp >= "${date.toISOString()}" AND timestamp < "${end.toISOString()}" AND (severity>=ERROR OR httpRequest.status>=400)`,orderBy:'timestamp asc',pageSize:1000,...(pageToken?{pageToken}:{})}});
    rows.push(...(r.data.entries??[]));pageToken=r.data.nextPageToken;if(!pageToken)break;
   }
   return {entries:rows,truncated:!!pageToken};
  });
 }
}
const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
const data=Buffer.concat([cipher.update(JSON.stringify(report),'utf8'),cipher.final()]);
const recipient=readFileSync(new URL('./audit-recipient-public.pem',import.meta.url));
mkdirSync('audit-output',{recursive:true});
writeFileSync('audit-output/session-audit.encrypted.json',JSON.stringify({version:1,key:publicEncrypt({key:recipient,oaepHash:'sha256'},key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}));
console.log(JSON.stringify({encrypted:true,sessions:report.sessions?.length??0,diagnosticErrors:report.errors.length}));
