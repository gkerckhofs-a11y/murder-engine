import test from 'node:test';
import assert from 'node:assert/strict';
import { readAllPages } from '../src/pagination.mjs';

for(const count of [0,99,100,101,162,201]){
  test(`complete paginated read with ${count} rows and a smaller companion list`,async()=>{
    const ballots=Array.from({length:count},(_,id)=>({id}));
    const votes=Array.from({length:3},(_,id)=>({id}));
    const offsets=[];
    const reader=async(_op,v)=>{offsets.push(v.pageOffset);return {ballots:ballots.slice(v.pageOffset,v.pageOffset+v.pageLimit),votes:votes.slice(v.pageOffset,v.pageOffset+v.pageLimit),recent:['one bounded feed']};};
    const out=await readAllPages(reader,'query Test',{sessionId:'S'},['ballots','votes']);
    assert.deepEqual(out.ballots,ballots);assert.deepEqual(out.votes,votes);
    assert.deepEqual(out.recent,['one bounded feed']);
    assert.equal(offsets.length,Math.floor(Math.max(count,3)/100)+1);
  });
}

test('a failed later page fails the whole operation instead of returning partial results',async()=>{
  await assert.rejects(()=>readAllPages(async(_q,v)=>{
    if(v.pageOffset)throw new Error('NETWORK_READ_FAILED');
    return {ballots:Array.from({length:100},(_,id)=>({id}))};
  },'query Test',{},['ballots']),/NETWORK_READ_FAILED/);
});
