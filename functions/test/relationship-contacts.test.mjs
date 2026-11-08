import test from 'node:test';
import assert from 'node:assert/strict';
import {relationshipContacts} from '../src/relationship-contacts.mjs';

test('only the original owner sees explicit contacts and an unknown cover stays unlinked', () => {
  const source = {
    characters: [{externalId: 'B', name: 'The archivist', publicRole: 'Archivist'}],
    facts: [
      {externalId: 'KNOWN', nature: 'RELATION', notebookCategory: 'RELATION:B', text: 'We worked together.'},
      {externalId: 'REFERENCE', nature: 'RELATION', notebookCategory: 'RELATION:REFERENCE', title: 'Former colleague', text: 'I know no cover.'},
      {externalId: 'UNTAGGED', nature: 'RELATION', title: 'Regular note'},
    ],
    initialKnowledges: ['KNOWN', 'REFERENCE', 'UNTAGGED'].map(factExternalId => ({
      characterExternalId: 'A',
      factExternalId,
    })),
  };
  const contacts = relationshipContacts(source, 'A', {portraitFor: () => ({source: 'archivist.png'})});
  assert.equal(contacts.length, 2);
  assert.equal(contacts[0].visibility, 'PRIVATE');
  assert.equal(contacts[0].otherExternalId, 'B');
  assert.equal(contacts[0].portrait.source, 'archivist.png');
  assert.equal(contacts[1].otherName, 'Former colleague');
  assert.equal(contacts[1].otherExternalId, null);
  assert.equal(contacts[1].otherPublicRole, null);
  assert.equal(contacts[1].portrait, null);
  assert.deepEqual(relationshipContacts(source, 'B'), []);
});
