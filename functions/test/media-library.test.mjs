import test from 'node:test';
import assert from 'node:assert/strict';

import {
  __mediaLibraryOps,
  mediaOverrideFor,
} from '../src/media-library.mjs';

test('media override keys are stable',()=>{
  assert.equal(
    __mediaLibraryOps.overrideKey('character','CHAR_RUBY'),
    'CHARACTER:CHAR_RUBY'
  );

  assert.equal(
    __mediaLibraryOps.overrideKey('OBJECT','OBJ_DISC'),
    'OBJECT:OBJ_DISC'
  );
});

test('media override parser tolerates empty and invalid JSON',()=>{
  assert.deepEqual(__mediaLibraryOps.parseOverrides(null),{});
  assert.deepEqual(__mediaLibraryOps.parseOverrides('not-json'),{});
  assert.deepEqual(
    __mediaLibraryOps.parseOverrides('{"CHARACTER:CHAR_RUBY":{"source":"x"}}'),
    {'CHARACTER:CHAR_RUBY':{source:'x'}}
  );
});

test('media library can resolve object logistics codes for stable aliases',()=>{
  assert.match(
    __mediaLibraryOps.OBJECT_TARGET_QUERY,
    /logisticsCode/
  );
});

test('mediaOverrideFor resolves presentation targets',()=>{
  const map={
    'CHARACTER:CHAR_RUBY':{
      assetExternalId:'MEDIA_LIB_1',
      source:'https://example.test/ruby.webp',
    },
  };

  assert.equal(
    mediaOverrideFor(map,'CHARACTER','CHAR_RUBY')?.assetExternalId,
    'MEDIA_LIB_1'
  );

  assert.equal(
    mediaOverrideFor(map,'OBJECT','CHAR_RUBY'),
    null
  );
});
