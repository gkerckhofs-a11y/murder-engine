import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {shapePlayerPortal} from '../src/player.mjs';
import {relationshipContacts} from '../src/relationship-contacts.mjs';
const patch=JSON.parse(readFileSync(new URL('../../fixtures/nid/relationship-completion.json',import.meta.url)));
const base=JSON.parse(readFileSync(new URL('../../fixtures/nid/editorial-gameplay.json',import.meta.url)));
const source={...base,relationships:patch.existingRelationships,facts:patch.rows.map(r=>r.fact),initialKnowledges:patch.rows.map(r=>({characterExternalId:r.owner,factExternalId:r.fact.externalId,sourceType:'INITIAL'}))};
const session={id:'REL_TEST',status:'READY',scenarioVersion:{id:'V1',scenario:{title:'Nid'}},sessionParticipants_on_gameSession:base.characters.map(c=>({characterExternalId:c.externalId,active:true}))};
const counts=[];
for(const c of base.characters)test('all story names appear safely in Relations: '+c.externalId,()=>{
 const portal=shapePlayerPortal({id:c.externalId,characterExternalId:c.externalId},session,source,{});
 const mentions=patch.mentions.filter(m=>m.owner===c.externalId);
 for(const m of mentions){
  const row=patch.rows.find(r=>r.owner===m.owner&&r.entity===m.entity);
  const target=m.targetCharacter||row?.target;
  const relation=target?portal.relationships.find(r=>r.otherExternalId===target):portal.relationships.find(r=>r.otherName===m.title);
  assert.ok(relation,c.externalId+':'+m.title);
  if(!target){assert.equal(relation.otherExternalId,null);assert.equal(relation.portrait,null);assert.equal(relation.otherPublicRole,null);}
  if(row)assert.ok(relation.text.includes(row.fact.text));
 }
 assert.equal(portal.otherCharacters.length,15);
 assert.equal(new Set(portal.relationships.map(r=>r.otherExternalId||r.externalId)).size,portal.relationships.length);
 counts.push({character:c.externalId,name:c.name,mentions:mentions.length,before:patch.existingRelationships.filter(r=>[r.characterAExternalId,r.characterBExternalId].includes(c.externalId)).length,after:portal.relationships.length});
});
test('contacts are private to their initial owner and are not transferable secret facts',()=>{
 for(const c of base.characters){const contacts=relationshipContacts(source,c.externalId);assert.equal(contacts.length,patch.rows.filter(r=>r.owner===c.externalId).length);for(const r of contacts){const fact=source.facts.find(f=>'CONTACT_'+f.externalId===r.externalId);assert.equal(fact.charmable,false);assert.equal(fact.isPublic,false);}}
 assert.deepEqual(relationshipContacts(source,'NO_CHARACTER'),[]);
 const ref=relationshipContacts(source,'P01',{portraitFor:()=>({source:'should-only-appear-for-known-cover'})}).find(r=>r.otherName==='Jean-Claude Marchand');assert.equal(ref.otherExternalId,null);assert.equal(ref.portrait,null);
 const known=shapePlayerPortal({id:'P12',characterExternalId:'P12'},session,source,{}).relationships.filter(r=>r.otherExternalId==='P16');assert.equal(known.length,1);assert.match(known[0].text,/Karl von Strausser/);
 mkdirSync('nid-relations-evidence',{recursive:true});writeFileSync('nid-relations-evidence/coverage.json',JSON.stringify(counts,null,2));
});
