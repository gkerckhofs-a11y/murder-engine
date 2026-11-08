// Preserve image assignments when a personal copy is retired in favour of its room clue.
export function attachNidRoomMedia(raw){
 const media=JSON.parse(raw||'{}'),next={...media};let added=0;
 for(const [key,value] of Object.entries(media)){
  const m=key.match(/^OBJECT:DOC_OBJ_DOC_PERS_P\d{2}_(\d{3}_\d{2})$/);if(!m)continue;
  const clueKey='CLUE:CL_NE_'+m[1];
  if(Object.hasOwn(next,clueKey))continue;
  next[clueKey]={...value,targetExternalId:'CL_NE_'+m[1],category:'CLUE'};added++;
 }
 return {json:added?JSON.stringify(next):raw,added};
}
