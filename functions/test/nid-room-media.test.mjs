import test from 'node:test';
import assert from 'node:assert/strict';
import {attachNidRoomMedia} from '../src/nid-room-media.mjs';
test('retired personal copies keep their images on the matching room clue, preserving prior assignments',()=>{
 const raw=JSON.stringify({'OBJECT:DOC_OBJ_DOC_PERS_P10_210_01':{source:'room.png'},'OBJECT:DOC_OBJ_DOC_PERS_P01_201_01':{source:'old.png'},'CLUE:CL_NE_201_01':{source:'new.png'},'CHARACTER:P10':{source:'portrait.png'}});
 const result=attachNidRoomMedia(raw),out=JSON.parse(result.json);assert.equal(result.added,1);assert.equal(out['CLUE:CL_NE_210_01'].source,'room.png');assert.equal(out['CLUE:CL_NE_201_01'].source,'new.png');assert.equal(out['CHARACTER:P10'].source,'portrait.png');assert.equal(out['OBJECT:DOC_OBJ_DOC_PERS_P10_210_01'].source,'room.png');assert.deepEqual(attachNidRoomMedia(result.json),{json:result.json,added:0});
});
