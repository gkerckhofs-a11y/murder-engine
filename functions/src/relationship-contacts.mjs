// Initial contact notes include absent people and names whose cover is unknown.
// A reference never gets an inferred portrait, character ID or player link.
export function relationshipContacts(source,actor,{portraitFor=()=>null}={}){
 const ids=new Set((source.initialKnowledges??[]).filter(k=>k.characterExternalId===actor).map(k=>k.factExternalId));
 const characters=new Map((source.characters??[]).filter(c=>c.active!==false).map(c=>[c.externalId,c]));
 return (source.facts??[]).filter(f=>f.active!==false&&f.nature==='RELATION'&&ids.has(f.externalId)).map(f=>{
  const category=String(f.notebookCategory??'');
  const id=category.startsWith('RELATION:')?category.slice(9):'';
  const other=id!=='REFERENCE'?characters.get(id):null;
  return {externalId:'CONTACT_'+f.externalId,otherExternalId:other?.externalId??null,otherName:other?.name??f.title,otherPublicRole:other?.publicRole??null,relationType:'Personne citée dans mon histoire',text:f.text,visibility:'PRIVATE',portrait:other?portraitFor(other):null};
 });
}
