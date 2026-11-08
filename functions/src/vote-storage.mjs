import { readAllPages } from './pagination.mjs';

export const BALLOT_FIELDS = 'voteExternalId round electorCharacterExternalId selectedOptionExternalIds weight castAt updatedAt';

export const BALLOT_BY_KEY_QUERY = `
query VoteBallotByKey($sessionId: UUID!, $voteExternalId: String!, $round: Int!, $electorCharacterExternalId: String!) {
  sessionBallot(key: {gameSessionId: $sessionId, voteExternalId: $voteExternalId, round: $round, electorCharacterExternalId: $electorCharacterExternalId}) {
    ${BALLOT_FIELDS}
  }
}`;

export const ROUND_BALLOTS_QUERY = `
query VoteRoundBallots($sessionId: UUID!, $voteExternalId: String!, $round: Int!, $pageLimit: Int!, $pageOffset: Int!) {
  sessionBallots(where: {gameSessionId: {eq: $sessionId}, voteExternalId: {eq: $voteExternalId}, round: {eq: $round}},
    orderBy: {electorCharacterExternalId: ASC}, limit: $pageLimit, offset: $pageOffset) { ${BALLOT_FIELDS} }
}`;

export async function readRoundBallots(reader, variables) {
  return (await readAllPages(reader, ROUND_BALLOTS_QUERY, variables, ['sessionBallots'])).sessionBallots;
}

// A no-op update takes the session row lock until the transaction commits.
// Open/cast/freeze/finish share this lock, so no ballot can slip past a closure.
export const SESSION_LOCK = `
  sessionLock: gameSession_update(id: $sessionId, data: {liveElapsedSeconds_update: {inc: 0}})
`;
export const RUNNING_SESSION_CHECK = `
  sessionGuard: query @check(expr: "response.sessionGuard.gameSession != null && response.sessionGuard.gameSession.status in ['LIVE', 'PAUSED']", message: "VOTE_REQUIRES_LIVE_SESSION") @redact {
    gameSession(id: $sessionId) { status }
  }
`;
export const OPEN_ROUND_CHECK = `
  roundGuard: query @check(expr: "response.roundGuard.sessionVote != null && response.roundGuard.sessionVote.status == 'OPEN'", message: "VOTE_NOT_OPEN") @redact {
    sessionVote(key: {gameSessionId: $sessionId, voteExternalId: $voteExternalId, round: $round}) { status }
  }
`;
