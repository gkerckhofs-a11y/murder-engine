import test from 'node:test';
import assert from 'node:assert/strict';
import {playerClues,playerInfoFeed,playerReadEntries,unreadCount,clueRecap} from '../src/player-navigation.ts';
const portal=()=>({session:{id:'S',playerSummary:'Context'},character:{externalId:'A',biography:'Bio'},participant:{id:'P'},objectives:[],relationships:[],resources:[],inventory:[],knowledge:[],discoveries:[{clueExternalId:'C',discoveredAt:'2026-10-15T19:00:00Z',clue:{playerName:'Letter',playerText:'A meeting was arranged. It is signed by the director.',objectExternalId:'OBJ',inBag:false}}],documentEntries:[],notifications:[{id:'N',title:'Latest news',body:'The doors are closed.',createdAt:'2026-10-15T20:00:00Z',readAt:null}],votes:[],voteResults:[]});
test('remembered evidence survives a transfer and cannot be marked as owned',()=>{
 const p=portal();assert.equal(playerClues(p)[0].owned,false);
 (p.inventory as any[]).push({objectExternalId:'OBJ',name:'Letter'});
 assert.equal(playerClues(p)[0].owned,true);
 assert.equal(playerClues(p).length,1);
});
test('one chronological Info feed includes news and a short factual clue recap',()=>{
 const feed=playerInfoFeed(portal());
 assert.equal(feed[0].kind,'notification');assert.equal(feed[1].kind,'clue');
 assert.equal(feed[1].body,'A meeting was arranged.');
 assert.equal(clueRecap({playerText:'Text.',gmNotes:'Secret answer'}),'Text.');
});
test('badges clear only viewed revisions and reappear when content changes',()=>{
 const p=portal(),entries=playerReadEntries(p),seen:Record<string,string>={};
 assert.equal(unreadCount(entries,seen,'notebook:info'),2);
 const news=entries.find(e=>e.id==='info:notification:N')!;seen[news.id]=news.revision;
 assert.equal(unreadCount(entries,seen,'notebook:info'),1);
 assert.equal(unreadCount(entries,seen,'bag:clues'),1);
 p.notifications[0].body='An updated message.';
 assert.equal(unreadCount(playerReadEntries(p),seen,'notebook:info'),2);
});
test('read server notifications stay read; a new vote round is a new item',()=>{
 const p=portal();(p.notifications[0] as any).readAt='2026-10-15T21:00:00Z';
 assert.equal(unreadCount(playerReadEntries(p),{},'notebook:info'),1);
 (p.votes as any[]).push({externalId:'V',round:1,title:'Vote',options:[]});
 const entry=playerReadEntries(p).find(e=>e.section==='play')!;const seen={[entry.id]:entry.revision};
 assert.equal(unreadCount(playerReadEntries(p),seen,'play'),0);
 (p.votes[0] as any).round=2;
 assert.equal(unreadCount(playerReadEntries(p),seen,'play'),1);
});
test('related learned facts are grouped under their clue without losing the detail',()=>{
 const p=portal();(p.discoveries[0].clue as any).knownFacts=[{externalId:'F',title:'Prior meeting',text:'An existing fact.'}];
 (p.knowledge as any[]).push({factExternalId:'F',fact:{title:'Prior meeting',text:'An existing fact.'}});
 const feed=playerInfoFeed(p);assert.equal(feed.filter(x=>x.kind==='fact').length,0);
 assert.equal(feed.find(x=>x.kind==='clue').clue.knownFacts[0].text,'An existing fact.');
});
