import test from 'node:test';
import assert from 'node:assert/strict';
import {getPlayerPersonalNotes,changePlayerPersonalNote,__personalNoteOps,PERSONAL_NOTE_LIMITS} from '../src/player-notes.mjs';
import {__playerOps,shapePlayerPortal} from '../src/player.mjs';
const tokenA='A'.repeat(40), tokenB='B'.repeat(40), tokenC='C'.repeat(40);
const noteId='note_1234567890123456';
const now=new Date('2026-10-09T12:00:00.000Z');
function fixture() {
  const owners=new Map([[tokenA,{id:'P1',sessionId:'S1'}],[tokenB,{id:'P2',sessionId:'S1'}],[tokenC,{id:'P3',sessionId:'S2'}]]);
  const rows=new Map([...owners.values()].map(o=>[o.id,{privateNotesJson:null,privateNotesRevision:0}]));
  const writes=[];
  let failCAS=false;
  const reader=async(op,v)=>{
    const owner=owners.get(v.token);
    if(op===__playerOps.PLAYER_ACCESS_QUERY) return {sessionParticipants:owner ? [{id:owner.id,characterExternalId:'SAME_CHARACTER',active:owner.active!==false,playerAccessEnabled:owner.enabled!==false,gameSession:{id:owner.sessionId,status:owner.status??'LIVE',runtimeInitializedAt:now.toISOString()}}] : []};
    assert.equal(op,__personalNoteOps.NOTES_QUERY);
    assert.equal(v.participantId,owner?.id);
    assert.equal(v.sessionId,owner?.sessionId);
    return {sessionParticipants:owner&&owner.active!==false&&owner.enabled!==false?[{...rows.get(owner.id)}]:[]};
  };
  const executor=async(op,v)=>{
    assert.equal(op,__personalNoteOps.SAVE_NOTES_MUTATION);
    writes.push(v);
    const owner=owners.get(v.token);
    assert.equal(v.participantId,owner.id);assert.equal(v.sessionId,owner.sessionId);
    const row=rows.get(owner.id);
    if(failCAS){failCAS=false;return{sessionParticipant_updateMany:0};}
    if(row.privateNotesRevision!==v.previousRevision)return{sessionParticipant_updateMany:0};
    rows.set(owner.id,{privateNotesJson:v.notesJson,privateNotesRevision:v.revision});
    return{sessionParticipant_updateMany:1};
  };
  return {owners,rows,writes,reader,executor,now,retryOnce(){failCAS=true;}};
}
const create=(f,token=tokenA,id=noteId,text='My first lead')=>changePlayerPersonalNote(token,{operation:'create',id,text},f);

test('notes persist, edit and delete without using AP, notifications or scenario data',async()=>{
  const f=fixture();
  assert.deepEqual((await getPlayerPersonalNotes(tokenA,f)).notes,[]);
  await create(f);
  let saved=(await getPlayerPersonalNotes(tokenA,f)).notes[0];
  assert.equal(saved.text,'My first lead');assert.equal(saved.version,1);
  await changePlayerPersonalNote(tokenA,{operation:'update',id:noteId,version:1,text:'Updated\n<script>alert(1)</script>'},f);
  saved=(await getPlayerPersonalNotes(tokenA,f)).notes[0];
  assert.equal(saved.version,2);assert.equal(saved.text,'Updated\n<script>alert(1)</script>');
  await changePlayerPersonalNote(tokenA,{operation:'delete',id:noteId,version:2},f);
  assert.deepEqual((await getPlayerPersonalNotes(tokenA,f)).notes,[]);
  assert.equal(f.writes.length,3);
});
test('isolation between players and sessions, even with the same character; forged owner IDs ignored',async()=>{
  const f=fixture();await create(f);
  assert.deepEqual((await getPlayerPersonalNotes(tokenB,f)).notes,[]);
  assert.deepEqual((await getPlayerPersonalNotes(tokenC,f)).notes,[]);
  for(const token of [tokenB,tokenC]){
    await assert.rejects(()=>changePlayerPersonalNote(token,{operation:'update',id:noteId,version:1,text:'stolen',participantId:'P1',sessionId:'S1'},f),/PLAYER_NOTE_NOT_FOUND/);
    await changePlayerPersonalNote(token,{operation:'delete',id:noteId,version:1,participantId:'P1',sessionId:'S1'},f);
  }
  assert.equal((await getPlayerPersonalNotes(tokenA,f)).notes[0].text,'My first lead');
  await changePlayerPersonalNote(tokenB,{operation:'create',id:noteId,text:'Private B',sessionId:'S2',participantId:'P1'},f);
  assert.equal((await getPlayerPersonalNotes(tokenB,f)).notes[0].text,'Private B');
  assert.equal((await getPlayerPersonalNotes(tokenA,f)).notes[0].text,'My first lead');
});
test('invalid, disabled, inactive and archived player access cannot read or write notes',async()=>{
  for(const patch of [null,{enabled:false},{active:false},{status:'ARCHIVED'}]){
    const f=fixture();if(patch)Object.assign(f.owners.get(tokenA),patch);else f.owners.delete(tokenA);
    await assert.rejects(()=>getPlayerPersonalNotes(tokenA,f));await assert.rejects(()=>create(f));assert.equal(f.writes.length,0);
  }
  await assert.rejects(()=>getPlayerPersonalNotes('short',fixture()));
});
test('notes work before live play, while paused and after finish',async()=>{
  for(const status of ['READY','PAUSED','FINISHED']){
    const f=fixture();f.owners.get(tokenA).status=status;await create(f);assert.equal((await getPlayerPersonalNotes(tokenA,f)).notes.length,1);
  }
});
test('empty, oversized and malformed notes are rejected; count is bounded',async()=>{
  const f=fixture();
  for(const text of ['', '   ',null,{},'a'.repeat(4001)])await assert.rejects(()=>create(f,tokenA,noteId,text),/PLAYER_NOTE_INVALID_TEXT/);
  await assert.rejects(()=>create(f,tokenA,'bad'),/PLAYER_NOTE_INVALID_ID/);
  await assert.rejects(()=>changePlayerPersonalNote(tokenA,{operation:'replace-all'},f),/PLAYER_NOTE_INVALID_OPERATION/);
  await assert.rejects(()=>changePlayerPersonalNote(tokenA,{operation:'update',id:noteId,text:'valid'},f),/PLAYER_NOTE_INVALID_VERSION/);
  f.rows.get('P1').privateNotesJson=JSON.stringify(Array.from({length:PERSONAL_NOTE_LIMITS.count},(_,i)=>({id:`existing_${i}`,text:'n',version:1,updatedAt:now.toISOString()})));
  await assert.rejects(()=>create(f),/PLAYER_NOTE_LIMIT_REACHED/);
  assert.equal(f.writes.length,0);
});
test('retries are idempotent and stale edits/deletes cannot overwrite newer content',async()=>{
  const f=fixture();await create(f);await create(f);assert.equal(f.writes.length,1);
  const update={operation:'update',id:noteId,version:1,text:'new'};
  await changePlayerPersonalNote(tokenA,update,f);await changePlayerPersonalNote(tokenA,update,f);
  assert.equal(f.writes.length,2);
  await assert.rejects(()=>changePlayerPersonalNote(tokenA,{...update,text:'stale edit'},f),/PLAYER_NOTE_CONFLICT/);
  await assert.rejects(()=>changePlayerPersonalNote(tokenA,{operation:'delete',id:noteId,version:1},f),/PLAYER_NOTE_CONFLICT/);
  assert.equal((await getPlayerPersonalNotes(tokenA,f)).notes[0].text,'new');
});
test('simultaneous creates preserve both notes, compare-and-swap retries safely',async()=>{
  const f=fixture();f.retryOnce();
  await Promise.all([create(f),create(f,tokenA,'second_1234567890123','Second')]);
  assert.equal((await getPlayerPersonalNotes(tokenA,f)).notes.length,2);
});
test('latest changed note comes first and corrupt storage is never overwritten',async()=>{
  const f=fixture();await create(f);await create({...f,now:new Date(now.getTime()+1000)},tokenA,'second_1234567890123','Second');
  assert.equal((await getPlayerPersonalNotes(tokenA,f)).notes[0].text,'Second');
  f.rows.get('P1').privateNotesJson='broken';const writes=f.writes.length;
  await assert.rejects(()=>create(f),/PLAYER_NOTES_INVALID_DATA/);assert.equal(f.writes.length,writes);
});
test('private fields are excluded from the shared portal and runtime queries',()=>{
  assert.doesNotMatch(__playerOps.PLAYER_ACCESS_QUERY,/privateNotes/);
  assert.doesNotMatch(__playerOps.PLAYER_RUNTIME_QUERY,/privateNotes/);
  const portal=shapePlayerPortal({id:'P1',characterExternalId:'C1',privateNotesJson:'SUPER_PRIVATE'},{id:'S1',scenarioVersion:{}},{characters:[{externalId:'C1',name:'C'}]},{});
  assert.doesNotMatch(JSON.stringify(portal),/SUPER_PRIVATE|privateNotes/);
});
