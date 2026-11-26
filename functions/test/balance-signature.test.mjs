import test from 'node:test';
import assert from 'node:assert/strict';
import {balanceSignature} from '../tools/balance-signature.mjs';
test('balance comparison tolerates GraphQL field/row ordering but catches transfers and missing resources',()=>{
 const before=[{characterExternalId:'P04',resourceExternalId:'RES_CASH',currentValue:700},{characterExternalId:'P05',resourceExternalId:'RES_CASH',currentValue:100}];
 const reordered=[{currentValue:100,resourceExternalId:'RES_CASH',characterExternalId:'P05'},{currentValue:700,resourceExternalId:'RES_CASH',characterExternalId:'P04'}];
 assert.equal(balanceSignature(before),balanceSignature(reordered));
 assert.notEqual(balanceSignature(before),balanceSignature([{...before[0],currentValue:600},{...before[1],currentValue:200}]));
 assert.notEqual(balanceSignature(before),balanceSignature(before.slice(0,1)));
});
