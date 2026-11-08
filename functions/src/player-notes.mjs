import { authorizePlayerAccess, readPlayerData, writePlayerData } from './player.mjs';

export const PERSONAL_NOTE_LIMITS = Object.freeze({ count: 100, length: 4000 });

// Deliberately separate from portal/runtime/GM queries: private text is never
// included in character snapshots, clues, notifications or action logs.
const NOTES_QUERY = `
query PlayerPersonalNotes($participantId: UUID!, $sessionId: UUID!, $token: String!) {
  sessionParticipants(where: {
    id: {eq: $participantId}, gameSessionId: {eq: $sessionId},
    playerAccessToken: {eq: $token}, playerAccessEnabled: {eq: true}, active: {eq: true}
  }) { privateNotesJson privateNotesRevision }
}`;
const SAVE_NOTES_MUTATION = `
mutation SavePlayerPersonalNotes(
  $participantId: UUID!, $sessionId: UUID!, $token: String!,
  $previousRevision: Int!, $revision: Int!, $notesJson: String!
) {
  sessionParticipant_updateMany(where: {
    id: {eq: $participantId}, gameSessionId: {eq: $sessionId},
    playerAccessToken: {eq: $token}, playerAccessEnabled: {eq: true}, active: {eq: true},
    privateNotesRevision: {eq: $previousRevision}
  }, data: {privateNotesJson: $notesJson, privateNotesRevision: $revision})
}`;

function parseNotes(raw) {
  if (raw == null) return [];
  let notes;
  try { notes = JSON.parse(raw); } catch { throw new Error('PLAYER_NOTES_INVALID_DATA'); }
  if (!Array.isArray(notes) || notes.some(n => !n || typeof n.id !== 'string' || typeof n.text !== 'string' || !Number.isInteger(n.version))) {
    throw new Error('PLAYER_NOTES_INVALID_DATA');
  }
  return notes;
}
function response(notes) {
  return { notes: [...notes].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)), limits: PERSONAL_NOTE_LIMITS };
}
async function readNotes(owner, reader) {
  const data = await reader(NOTES_QUERY, owner);
  const row = data?.sessionParticipants?.[0];
  if (!row) throw new Error('PLAYER_LINK_NOT_FOUND');
  return {notes: parseNotes(row.privateNotesJson), revision: row.privateNotesRevision ?? 0};
}
async function ownerFromToken(token, reader) {
  const participant = await authorizePlayerAccess(token, reader);
  // Client-supplied session, participant or character IDs are never used.
  return {participantId: participant.id, sessionId: participant.gameSession.id, token: String(token).trim()};
}
export async function getPlayerPersonalNotes(token, {reader=readPlayerData}={}) {
  const owner = await ownerFromToken(token, reader);
  return response((await readNotes(owner, reader)).notes);
}
export async function changePlayerPersonalNote(token, input, {reader=readPlayerData, executor=writePlayerData, now=new Date()}={}) {
  const owner = await ownerFromToken(token, reader);
  const operation = input?.operation;
  if (!['create','update','delete'].includes(operation)) throw new Error('PLAYER_NOTE_INVALID_OPERATION');
  const id = input?.id;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(id)) throw new Error('PLAYER_NOTE_INVALID_ID');
  const text = typeof input?.text === 'string' ? input.text.trim() : '';
  if (operation !== 'delete' && (!text || text.length > PERSONAL_NOTE_LIMITS.length)) throw new Error('PLAYER_NOTE_INVALID_TEXT');
  if (operation !== 'create' && (!Number.isInteger(input?.version) || input.version < 1)) throw new Error('PLAYER_NOTE_INVALID_VERSION');
  const timestamp = (now instanceof Date ? now : new Date(now)).toISOString();
  for (let attempt=0; attempt<3; attempt++) {
    const {notes, revision} = await readNotes(owner, reader);
    const existing = notes.find(n => n.id === id);
    let next;
    if (operation === 'create') {
      // Stable client ID makes retrying after a lost response safe.
      if (existing) {
        if (existing.text === text) return response(notes);
        throw new Error('PLAYER_NOTE_CONFLICT');
      }
      if (notes.length >= PERSONAL_NOTE_LIMITS.count) throw new Error('PLAYER_NOTE_LIMIT_REACHED');
      next = [...notes, {id, text, version:1, createdAt:timestamp, updatedAt:timestamp}];
    } else {
      if (!existing) {
        if (operation === 'delete') return response(notes);
        throw new Error('PLAYER_NOTE_NOT_FOUND');
      }
      if (existing.version !== input.version) {
        if (operation === 'update' && existing.version === input.version + 1 && existing.text === text) return response(notes);
        throw new Error('PLAYER_NOTE_CONFLICT');
      }
      next = operation === 'delete' ? notes.filter(n => n.id !== id)
        : notes.map(n => n.id === id ? {...n, text, version:n.version+1, updatedAt:timestamp} : n);
    }
    const result = await executor(SAVE_NOTES_MUTATION, {
      ...owner, previousRevision:revision, revision:revision+1, notesJson:JSON.stringify(next)
    });
    if (result?.sessionParticipant_updateMany === 1) return response(next);
  }
  throw new Error('PLAYER_NOTE_CONFLICT');
}
export const __personalNoteOps = {NOTES_QUERY, SAVE_NOTES_MUTATION};
