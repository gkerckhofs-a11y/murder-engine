import {getSessionGmPack} from './gm-pack-session.mjs';
import {
  getSessionIncarnations as readSessionIncarnations,
  updateSessionIncarnation as saveSessionIncarnation,
  freezeSessionIncarnations as freezeIncarnations
} from './session-incarnations.mjs';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { parseWorkbookBuffer } from './parse-xlsx.mjs';
import { validateWorkbook, summarizeWorkbook } from './diagnostics.mjs';
import { buildImportPlan, importPlanCounts } from './import-plan.mjs';
import { persistImportPlan } from './dataconnect-import.mjs';
import { listScenarioLibrary, getScenarioVersionOverview, getCharacterDetail, setScenarioVersionArchived } from './library.mjs';
import { getGmPack } from './gm-pack.mjs';
import { listGameSessions, getGameSession, createGameSession, addGameSessionParticipant, assignCharacterToParticipant, setGameSessionStatus, updateGameSessionDetails, setGameSessionArchived, deleteGameSession, configureGameSessionPrecast, getPublicPrecastSession, submitPublicPrecast, getSessionSetupAssistant, applySessionCastingAssignments } from './sessions.mjs';
import { initializeSessionRuntime, getSessionRuntime } from './runtime.mjs';
import { getLiveDashboard, controlLiveSession, changeLiveResource, setLiveCharacterState, setLiveEventStatus } from './live.mjs';
import { getInteractionDashboard, executeInteraction, revealClueToCharacter, transferSessionObject } from './interactions.mjs';
import { getVoteDashboard, openSessionVote, castSessionBallot, closeSessionVote } from './votes.mjs';
import { configureSessionPlayerAccess, getPlayerPortal, markPlayerBriefingRead, markPlayerNotificationRead, sendPlayerNotification, executePlayerInteraction, transferPlayerObject, transferPlayerCash, castPlayerVote, getPlayerLocation, executePlayerLocationAction, attemptPlayerClandestineAction, claimPlayerStolenObject } from './player.mjs';
import { updateScenarioAppearanceFamily } from './scenario-appearance.mjs';
import {
  listPrecastCampaigns,
  getPrecastCampaign,
  createPrecastCampaign,
  setPrecastCampaignStatus,
  getPublicPrecastCampaign,
  submitPublicPrecastRegistration,
  createSessionFromPrecast,
} from './registrations.mjs';

const MAX_FILE_BYTES = 8 * 1024 * 1024;


function readSkinSelection(req) {
  const rawSkinId = String(req.header('x-skin-id') ?? '').trim().toUpperCase();
  const rawAccentColor = String(req.header('x-accent-color') ?? '').trim();

  // Compatibilité avec les imports plus anciens.
  if (!rawSkinId) return null;

  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(rawSkinId))
    throw new Error(`INVALID_SKIN_ID:${rawSkinId}`);

  if (rawAccentColor && !/^#[0-9A-Fa-f]{6}$/.test(rawAccentColor))
    throw new Error('INVALID_ACCENT_COLOR');

  return {
    skinId: rawSkinId,
    accentColor: rawAccentColor || null,
  };
}

function readXlsx(req, res) {
  const filename = String(req.header('x-file-name') ?? 'scenario.xlsx');
  if (!filename.toLowerCase().endsWith('.xlsx')) {
    res.status(400).json({ error: 'XLSX_REQUIRED' });
    return null;
  }
  const raw = req.rawBody;
  if (!raw?.length) {
    res.status(400).json({ error: 'EMPTY_FILE' });
    return null;
  }
  if (raw.length > MAX_FILE_BYTES) {
    res.status(413).json({ error: 'FILE_TOO_LARGE', maxBytes: MAX_FILE_BYTES });
    return null;
  }
  return { filename, raw };
}

export const validateImport = onRequest({ region: 'europe-west1', cors: true, maxInstances: 10, timeoutSeconds: 60 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  const input = readXlsx(req, res); if (!input) return;
  try {
    const workbook = parseWorkbookBuffer(input.raw, input.filename);
    const result = validateWorkbook(workbook);
    logger.info('Murder Engine import validation', { filename: input.filename, counts: result.counts, blocking: result.blocking });
    return res.status(200).json({ ok: !result.blocking, summary: summarizeWorkbook(workbook), ...result });
  } catch (error) {
    logger.error('Import parse failed', error);
    return res.status(400).json({ error: 'WORKBOOK_PARSE_FAILED', message: error instanceof Error ? error.message : String(error) });
  }
});

export const commitImport = onRequest({ region: 'europe-west1', cors: true, maxInstances: 3, timeoutSeconds: 300 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  const input = readXlsx(req, res); if (!input) return;

  const organizationSlug = String(req.header('x-organization-slug') ?? 'ludificateur');
  const organizationName = String(req.header('x-organization-name') ?? 'Le Ludificateur');

  try {
    const skinSelection = readSkinSelection(req);
    const workbook = parseWorkbookBuffer(input.raw, input.filename);
    const validation = validateWorkbook(workbook);
    const summary = summarizeWorkbook(workbook);
    if (validation.blocking) {
      return res.status(409).json({ error: 'IMPORT_BLOCKED', ok: false, summary, ...validation });
    }

    const plan = buildImportPlan(workbook, {
      sourceBuffer: input.raw,
      organizationSlug,
      organizationName,
    });

    // V1.10 :
    // le choix fait dans Murder Engine prime sur le champ THEME du MASTER.
    if (skinSelection) {
      plan.scenario.skinId = skinSelection.skinId;
      plan.scenario.accentColor = skinSelection.accentColor;

      // Copie de compatibilité : le portail joueur et le Pack MJ
      // savent déjà lire ces champs depuis ScenarioVersion.
      plan.scenarioVersion.skinId = skinSelection.skinId;
      plan.scenarioVersion.accentColor = skinSelection.accentColor;
    }

    const importReport = { summary, counts: validation.counts, diagnostics: validation.diagnostics };
    const persisted = await persistImportPlan(plan, importReport);
    logger.info('Murder Engine scenario committed', { filename: input.filename, ...persisted, counts: importPlanCounts(plan) });

    return res.status(201).json({
      ok: true,
      summary,
      diagnostics: validation.diagnostics,
      counts: validation.counts,
      imported: importPlanCounts(plan),
      ...persisted,
    });
  } catch (error) {
    logger.error('Scenario commit failed', error);
    return res.status(500).json({
      error: 'IMPORT_COMMIT_FAILED',
      message: error instanceof Error ? error.message : String(error),
      details: error?.details ?? undefined,
    });
  }
});


function requireGet(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return false;
  }
  return true;
}

export const listScenarios = onRequest({ region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 }, async (req, res) => {
  if (!requireGet(req, res)) return;
  try {
    const scenarios = await listScenarioLibrary();
    return res.status(200).json({ ok: true, scenarios });
  } catch (error) {
    logger.error('Scenario library read failed', error);
    return res.status(500).json({
      error: 'LIBRARY_READ_FAILED',
      message: error instanceof Error ? error.message : String(error),
      details: error?.details ?? undefined,
    });
  }
});

export const getGmPackView = onRequest(
  { region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 },
  async (req, res) => {
    if (!requireGet(req, res)) return;

    const versionId = String(req.query.versionId ?? '').trim();
    if (!versionId) {
      return res.status(400).json({ error: 'VERSION_ID_REQUIRED' });
    }

    try {
      const pack = await getGmPack(versionId);
      return res.status(200).json({ ok: true, pack });
    } catch (error) {
      logger.error('GM Pack read failed', error);
      return res.status(
        error instanceof Error && error.message === 'VERSION_NOT_FOUND' ? 404 : 500
      ).json({
        error: 'GM_PACK_READ_FAILED',
        message: error instanceof Error ? error.message : String(error),
        details: error?.details ?? undefined,
      });
    }
  }
);


export const setScenarioVersionArchivedView = onRequest(
  { region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST');
      return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    try {
      const versionId = String(req.body?.versionId ?? '').trim();
      const archived = req.body?.archived === true;

      if (!versionId)
        return res.status(400).json({ error: 'VERSION_ID_REQUIRED' });

      const version =
        await setScenarioVersionArchived(versionId, archived);

      return res.status(200).json({
        ok: true,
        version,
      });
    } catch (error) {
      logger.error('Scenario version archive failed', error);

      return res.status(500).json({
        error: 'VERSION_ARCHIVE_FAILED',
        message: error instanceof Error
          ? error.message
          : String(error),
        details: error?.details ?? undefined,
      });
    }
  }
);

export const getScenarioVersion = onRequest({ region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 }, async (req, res) => {
  if (!requireGet(req, res)) return;
  const versionId = String(req.query.versionId ?? '').trim();
  if (!versionId) return res.status(400).json({ error: 'VERSION_ID_REQUIRED' });
  try {
    const version = await getScenarioVersionOverview(versionId);
    if (!version) return res.status(404).json({ error: 'VERSION_NOT_FOUND' });
    return res.status(200).json({ ok: true, version });
  } catch (error) {
    logger.error('Scenario version read failed', error);
    return res.status(500).json({
      error: 'VERSION_READ_FAILED',
      message: error instanceof Error ? error.message : String(error),
      details: error?.details ?? undefined,
    });
  }
});

export const getCharacter = onRequest({ region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 }, async (req, res) => {
  if (!requireGet(req, res)) return;
  const versionId = String(req.query.versionId ?? '').trim();
  const externalId = String(req.query.externalId ?? '').trim();
  if (!versionId || !externalId) return res.status(400).json({ error: 'VERSION_AND_CHARACTER_REQUIRED' });
  try {
    const detail = await getCharacterDetail(versionId, externalId);
    if (!detail) return res.status(404).json({ error: 'CHARACTER_NOT_FOUND' });
    return res.status(200).json({ ok: true, ...detail });
  } catch (error) {
    logger.error('Character detail read failed', error);
    return res.status(500).json({
      error: 'CHARACTER_READ_FAILED',
      message: error instanceof Error ? error.message : String(error),
      details: error?.details ?? undefined,
    });
  }
});


function requirePostJson(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return null;
  }
  return req.body ?? {};
}

export const listPrecastCampaignsView = onRequest({ region:'europe-west1', cors:true, maxInstances:5, timeoutSeconds:60 }, async (req,res)=>{
  if(!requireGet(req,res)) return;
  try { return res.status(200).json({ok:true,campaigns:await listPrecastCampaigns()}); }
  catch(error){ logger.error('Precast campaigns read failed',error); return res.status(500).json({error:'PRECAST_CAMPAIGNS_READ_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});

export const getPrecastCampaignView = onRequest({ region:'europe-west1', cors:true, maxInstances:5, timeoutSeconds:60 }, async (req,res)=>{
  if(!requireGet(req,res)) return;
  const campaignId=String(req.query.campaignId??'').trim();
  if(!campaignId) return res.status(400).json({error:'PRECAST_CAMPAIGN_ID_REQUIRED'});
  try { return res.status(200).json({ok:true,campaign:await getPrecastCampaign(campaignId)}); }
  catch(error){ logger.error('Precast campaign read failed',error); return res.status(404).json({error:'PRECAST_CAMPAIGN_READ_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});

export const createPrecastCampaignView = onRequest({ region:'europe-west1', cors:true, maxInstances:5, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(201).json({ok:true,campaign:await createPrecastCampaign(body)}); }
  catch(error){ logger.error('Precast campaign creation failed',error); return res.status(400).json({error:'PRECAST_CAMPAIGN_CREATE_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});

export const updatePrecastCampaignStatusView = onRequest({ region:'europe-west1', cors:true, maxInstances:5, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await setPrecastCampaignStatus(String(body.campaignId??'').trim(),body.status)}); }
  catch(error){ logger.error('Precast campaign status failed',error); return res.status(400).json({error:'PRECAST_CAMPAIGN_STATUS_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});

export const getPublicPrecastCampaignView = onRequest({ region:'europe-west1', cors:true, maxInstances:12, timeoutSeconds:60 }, async (req,res)=>{
  if(!requireGet(req,res)) return;
  const token=String(req.query.token??'').trim();
  try { return res.status(200).json({ok:true,campaign:await getPublicPrecastCampaign(token)}); }
  catch(error){ const message=error instanceof Error?error.message:String(error); return res.status(/NOT_FOUND|CLOSED|INVALID/.test(message)?404:400).json({error:'PUBLIC_PRECAST_CAMPAIGN_FAILED',message}); }
});

export const submitPublicPrecastRegistrationView = onRequest({ region:'europe-west1', cors:true, maxInstances:12, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(201).json({ok:true,registration:await submitPublicPrecastRegistration(String(body.token??'').trim(),body)}); }
  catch(error){ const message=error instanceof Error?error.message:String(error); return res.status(/NOT_FOUND|CLOSED/.test(message)?404:400).json({error:'PUBLIC_PRECAST_SUBMIT_FAILED',message,details:error?.details??undefined}); }
});

export const createSessionFromPrecastView = onRequest({ region:'europe-west1', cors:true, maxInstances:3, timeoutSeconds:180 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(201).json({ok:true,result:await createSessionFromPrecast(String(body.campaignId??'').trim(),body)}); }
  catch(error){ logger.error('Create session from precast failed',error); return res.status(400).json({error:'PRECAST_CREATE_SESSION_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});


export const listSessions = onRequest({ region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 }, async (req, res) => {
  if (!requireGet(req, res)) return;
  try {
    const sessions = await listGameSessions();
    return res.status(200).json({ ok: true, sessions });
  } catch (error) {
    logger.error('Session library read failed', error);
    return res.status(500).json({ error: 'SESSION_LIBRARY_READ_FAILED', message: error instanceof Error ? error.message : String(error), details: error?.details ?? undefined });
  }
});

export const getSession = onRequest({ region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 }, async (req, res) => {
  if (!requireGet(req, res)) return;
  const sessionId = String(req.query.sessionId ?? '').trim();
  if (!sessionId) return res.status(400).json({ error: 'SESSION_ID_REQUIRED' });
  try {
    const session = await getGameSession(sessionId);
    if (!session) return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    return res.status(200).json({ ok: true, session });
  } catch (error) {
    logger.error('Session read failed', error);
    return res.status(500).json({ error: 'SESSION_READ_FAILED', message: error instanceof Error ? error.message : String(error), details: error?.details ?? undefined });
  }
});

export const createSession = onRequest({ region: 'europe-west1', cors: true, maxInstances: 3, timeoutSeconds: 60 }, async (req, res) => {
  const body = requirePostJson(req, res); if (!body) return;
  try {
    const session = await createGameSession(body);
    return res.status(201).json({ ok: true, session });
  } catch (error) {
    logger.error('Session creation failed', error);
    const message = error instanceof Error ? error.message : String(error);
    const status = /REQUIRED|NOT_FOUND/.test(message) ? 400 : 500;
    return res.status(status).json({ error: 'SESSION_CREATE_FAILED', message, details: error?.details ?? undefined });
  }
});

export const addSessionParticipant = onRequest({ region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 }, async (req, res) => {
  const body = requirePostJson(req, res); if (!body) return;
  const sessionId = String(body.sessionId ?? '').trim();
  try {
    const participant = await addGameSessionParticipant(sessionId, body);
    return res.status(201).json({ ok: true, participant });
  } catch (error) {
    logger.error('Participant creation failed', error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: 'PARTICIPANT_CREATE_FAILED', message, details: error?.details ?? undefined });
  }
});

export const castSessionParticipant = onRequest({ region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 }, async (req, res) => {
  const body = requirePostJson(req, res); if (!body) return;
  const sessionId = String(body.sessionId ?? '').trim();
  const participantId = String(body.participantId ?? '').trim();
  try {
    const casting = await assignCharacterToParticipant(sessionId, participantId, body.characterExternalId ?? null);
    return res.status(200).json({ ok: true, casting });
  } catch (error) {
    logger.error('Casting update failed', error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: 'CASTING_UPDATE_FAILED', message, details: error?.details ?? undefined });
  }
});

export const getSessionSetup = onRequest({ region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 }, async (req, res) => {
  if (!requireGet(req, res)) return;
  const sessionId = String(req.query.sessionId ?? '').trim();
  if (!sessionId) return res.status(400).json({ error: 'SESSION_ID_REQUIRED' });
  try {
    const setup = await getSessionSetupAssistant(sessionId);
    return res.status(200).json({ ok: true, setup });
  } catch (error) {
    logger.error('Session setup assistant failed', error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(/NOT_FOUND/.test(message) ? 404 : 500).json({ error: 'SESSION_SETUP_FAILED', message, details: error?.details ?? undefined });
  }
});

export const applySessionCasting = onRequest({ region: 'europe-west1', cors: true, maxInstances: 3, timeoutSeconds: 60 }, async (req, res) => {
  const body = requirePostJson(req, res); if (!body) return;
  const sessionId = String(body.sessionId ?? '').trim();
  try {
    const result = await applySessionCastingAssignments(sessionId, body.assignments);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    logger.error('Bulk casting failed', error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: 'SESSION_CASTING_APPLY_FAILED', message, details: error?.details ?? undefined });
  }
});


export const updateSessionDetails = onRequest({ region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 }, async (req, res) => {
  const body = requirePostJson(req, res); if (!body) return;
  const sessionId = String(body.sessionId ?? '').trim();
  try {
    const session = await updateGameSessionDetails(sessionId, body);
    return res.status(200).json({ ok: true, session });
  } catch (error) {
    logger.error('Session details update failed', error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: 'SESSION_DETAILS_UPDATE_FAILED', message, details: error?.details ?? undefined });
  }
});

export const updateSessionStatus = onRequest({ region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 }, async (req, res) => {
  const body = requirePostJson(req, res); if (!body) return;
  const sessionId = String(body.sessionId ?? '').trim();
  try {
    const session = await setGameSessionStatus(sessionId, body.status);
    return res.status(200).json({ ok: true, session });
  } catch (error) {
    logger.error('Session status update failed', error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: 'SESSION_STATUS_UPDATE_FAILED', message, details: error?.details ?? undefined });
  }
});

export const archiveSession = onRequest({ region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 }, async (req, res) => {
  const body = requirePostJson(req, res); if (!body) return;
  const sessionId = String(body.sessionId ?? '').trim();
  try {
    const session = await setGameSessionArchived(sessionId, body.archived !== false);
    return res.status(200).json({ ok: true, session });
  } catch (error) {
    logger.error('Session archive update failed', error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: 'SESSION_ARCHIVE_FAILED', message, details: error?.details ?? undefined });
  }
});

export const deleteSession = onRequest({ region: 'europe-west1', cors: true, maxInstances: 3, timeoutSeconds: 60 }, async (req, res) => {
  const body = requirePostJson(req, res); if (!body) return;
  const sessionId = String(body.sessionId ?? '').trim();
  try {
    const session = await deleteGameSession(sessionId);
    return res.status(200).json({ ok: true, session });
  } catch (error) {
    logger.error('Session delete failed', error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: 'SESSION_DELETE_FAILED', message, details: error?.details ?? undefined });
  }
});


export const configureSessionPrecast = onRequest({ region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 }, async (req, res) => {
  const body = requirePostJson(req, res); if (!body) return;
  const sessionId = String(body.sessionId ?? '').trim();
  try {
    const precast = await configureGameSessionPrecast(sessionId, Boolean(body.enabled));
    return res.status(200).json({ ok: true, precast });
  } catch (error) {
    logger.error('Precast configuration failed', error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: 'PRECAST_CONFIG_FAILED', message, details: error?.details ?? undefined });
  }
});

export const getPublicPrecast = onRequest({ region: 'europe-west1', cors: true, maxInstances: 10, timeoutSeconds: 30 }, async (req, res) => {
  if (!requireGet(req, res)) return;
  res.set('Cache-Control', 'no-store');
  const token = String(req.query.token ?? '').trim();
  try {
    const session = await getPublicPrecastSession(token);
    return res.status(200).json({ ok: true, session });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /NOT_FOUND|CLOSED|INVALID_PRECAST_TOKEN/.test(message) ? 404 : 400;
    return res.status(status).json({ error: 'PRECAST_LINK_UNAVAILABLE', message });
  }
});

export const submitPublicPrecastForm = onRequest({ region: 'europe-west1', cors: true, maxInstances: 10, timeoutSeconds: 30 }, async (req, res) => {
  const body = requirePostJson(req, res); if (!body) return;
  res.set('Cache-Control', 'no-store');
  const token = String(body.token ?? '').trim();
  try {
    const submission = await submitPublicPrecast(token, body);
    return res.status(201).json({ ok: true, submission });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /NOT_FOUND|CLOSED|INVALID_PRECAST_TOKEN/.test(message) ? 404 : 400;
    return res.status(status).json({ error: 'PRECAST_SUBMIT_FAILED', message });
  }
});


export const getRuntimeState = onRequest({ region: 'europe-west1', cors: true, maxInstances: 5, timeoutSeconds: 60 }, async (req, res) => {
  if (!requireGet(req, res)) return;
  const sessionId = String(req.query.sessionId ?? '').trim();
  if (!sessionId) return res.status(400).json({ error: 'SESSION_ID_REQUIRED' });
  try {
    const runtime = await getSessionRuntime(sessionId);
    return res.status(200).json({ ok: true, runtime });
  } catch (error) {
    logger.error('Runtime read failed', error);
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: 'RUNTIME_READ_FAILED', message, details: error?.details ?? undefined });
  }
});

export const initializeRuntime = onRequest({ region: 'europe-west1', cors: true, maxInstances: 3, timeoutSeconds: 180 }, async (req, res) => {
  const body = requirePostJson(req, res); if (!body) return;
  const sessionId = String(body.sessionId ?? '').trim();
  try {
    const runtime = await initializeSessionRuntime(sessionId);
    return res.status(200).json({ ok: true, runtime });
  } catch (error) {
    logger.error('Runtime initialization failed', error);
    const message = error instanceof Error ? error.message : String(error);
    const status = /REQUIRED|NOT_FOUND|READY|CASTING|SOURCE|PARTICIPANTS|INITIALIZED/.test(message) ? 400 : 500;
    return res.status(status).json({ error: 'RUNTIME_INITIALIZE_FAILED', message, details: error?.details ?? undefined });
  }
});

export const getLiveState = onRequest({ region: 'europe-west1', cors: true, maxInstances: 8, timeoutSeconds: 60 }, async (req, res) => {
  if (!requireGet(req, res)) return;
  const sessionId = String(req.query.sessionId ?? '').trim();
  if (!sessionId) return res.status(400).json({ error: 'SESSION_ID_REQUIRED' });
  try { return res.status(200).json({ ok:true, live: await getLiveDashboard(sessionId) }); }
  catch (error) { logger.error('Live dashboard read failed', error); return res.status(400).json({ error:'LIVE_READ_FAILED', message:error instanceof Error?error.message:String(error), details:error?.details??undefined }); }
});

export const controlLive = onRequest({ region:'europe-west1', cors:true, maxInstances:5, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true, result:await controlLiveSession(String(body.sessionId??'').trim(), body.action)}); }
  catch(error){ logger.error('Live control failed',error); return res.status(400).json({error:'LIVE_CONTROL_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});

export const updateLiveResource = onRequest({ region:'europe-west1', cors:true, maxInstances:8, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true, result:await changeLiveResource(String(body.sessionId??'').trim(),body)}); }
  catch(error){ logger.error('Live resource update failed',error); return res.status(400).json({error:'LIVE_RESOURCE_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});

export const updateLiveState = onRequest({ region:'europe-west1', cors:true, maxInstances:8, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true, result:await setLiveCharacterState(String(body.sessionId??'').trim(),body)}); }
  catch(error){ logger.error('Live state update failed',error); return res.status(400).json({error:'LIVE_STATE_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});

export const updateLiveEvent = onRequest({ region:'europe-west1', cors:true, maxInstances:8, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true, result:await setLiveEventStatus(String(body.sessionId??'').trim(),body)}); }
  catch(error){ logger.error('Live event update failed',error); return res.status(400).json({error:'LIVE_EVENT_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});



export const getInteractionState = onRequest({ region:'europe-west1', cors:true, maxInstances:8, timeoutSeconds:60 }, async (req,res)=>{
  if (!requireGet(req,res)) return;
  const sessionId=String(req.query.sessionId??'').trim();
  if(!sessionId) return res.status(400).json({error:'SESSION_ID_REQUIRED'});
  try { return res.status(200).json({ok:true, interactions:await getInteractionDashboard(sessionId)}); }
  catch(error){ logger.error('Interaction dashboard read failed',error); return res.status(400).json({error:'INTERACTION_READ_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});

export const executeLiveInteraction = onRequest({ region:'europe-west1', cors:true, maxInstances:10, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  const sessionId=String(body.sessionId??'').trim();
  try {
    const result=await executeInteraction(sessionId,body);
    if(['PLAYER','CHARACTER'].includes(String(result.targetType??'').toUpperCase())&&result.targetExternalId){
      try{
        await sendPlayerNotification(sessionId,{characterExternalId:result.targetExternalId,kind:'INTERACTION_TARGET',title:'Action sur votre personnage',body:`Une action « ${result.interactionName} » vient d’être exercée sur votre personnage. ${result.success?'Elle a réussi.':'Elle a échoué.'} Murder Engine ne révèle pas son auteur.`,refExternalId:result.interactionExternalId,priority:'NORMAL'});
      }catch(notificationError){logger.warn('Interaction target notification skipped',notificationError);}
    }
    return res.status(200).json({ok:true,result});
  }
  catch(error){ logger.error('Interaction execution failed',error); const message=error instanceof Error?error.message:String(error); return res.status(400).json({error:'INTERACTION_EXECUTE_FAILED',message,remainingSeconds:error?.remainingSeconds,details:error?.details??undefined}); }
});

export const revealLiveClue = onRequest({ region:'europe-west1', cors:true, maxInstances:10, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  const sessionId=String(body.sessionId??'').trim();
  try { const result=await revealClueToCharacter(sessionId,body); try{await sendPlayerNotification(sessionId,{characterExternalId:String(body.characterExternalId??'').trim(),kind:'CLUE',title:'Nouvel indice',body:'Un nouvel indice a été ajouté à votre carnet.',refExternalId:String(body.clueExternalId??'').trim(),priority:'IMPORTANT'});}catch(notificationError){logger.warn('Player clue notification skipped',notificationError);} return res.status(200).json({ok:true,result}); }
  catch(error){ logger.error('Clue reveal failed',error); return res.status(400).json({error:'CLUE_REVEAL_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});

export const transferLiveObject = onRequest({ region:'europe-west1', cors:true, maxInstances:10, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  const sessionId=String(body.sessionId??'').trim();
  try { const result=await transferSessionObject(sessionId,body); if(String(body.holderType??'').toUpperCase()==='CHARACTER'&&body.holderExternalId){try{await sendPlayerNotification(sessionId,{characterExternalId:String(body.holderExternalId),kind:'OBJECT',title:'Objet reçu',body:'Un objet vient d’être ajouté à votre inventaire.',refExternalId:String(body.objectExternalId??'').trim(),priority:'NORMAL'});}catch(notificationError){logger.warn('Player object notification skipped',notificationError);}} return res.status(200).json({ok:true,result}); }
  catch(error){ logger.error('Object transfer failed',error); return res.status(400).json({error:'OBJECT_TRANSFER_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});


export const getVoteState = onRequest({ region:'europe-west1', cors:true, maxInstances:8, timeoutSeconds:60 }, async (req,res)=>{
  if (!requireGet(req,res)) return;
  const sessionId=String(req.query.sessionId??'').trim();
  if(!sessionId) return res.status(400).json({error:'SESSION_ID_REQUIRED'});
  try { return res.status(200).json({ok:true,votes:await getVoteDashboard(sessionId)}); }
  catch(error){ logger.error('Vote dashboard read failed',error); return res.status(400).json({error:'VOTE_READ_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});

export const openLiveVote = onRequest({ region:'europe-west1', cors:true, maxInstances:8, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await openSessionVote(String(body.sessionId??'').trim(),body)}); }
  catch(error){ logger.error('Vote open failed',error); return res.status(400).json({error:'VOTE_OPEN_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});

export const castLiveBallot = onRequest({ region:'europe-west1', cors:true, maxInstances:12, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await castSessionBallot(String(body.sessionId??'').trim(),body)}); }
  catch(error){ logger.error('Ballot cast failed',error); return res.status(400).json({error:'BALLOT_CAST_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});

export const closeLiveVote = onRequest({ region:'europe-west1', cors:true, maxInstances:8, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await closeSessionVote(String(body.sessionId??'').trim(),body)}); }
  catch(error){ logger.error('Vote close failed',error); return res.status(400).json({error:'VOTE_CLOSE_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});

export const configurePlayerAccess = onRequest({ region:'europe-west1', cors:true, maxInstances:5, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await configureSessionPlayerAccess(String(body.sessionId??'').trim(),Boolean(body.enabled))}); }
  catch(error){ logger.error('Player access configuration failed',error); return res.status(400).json({error:'PLAYER_ACCESS_CONFIG_FAILED',message:error instanceof Error?error.message:String(error),details:error?.details??undefined}); }
});

export const getPublicPlayerPortal = onRequest({ region:'europe-west1', cors:true, maxInstances:15, timeoutSeconds:60 }, async (req,res)=>{
  if(!requireGet(req,res))return; const token=String(req.query.token??'').trim(); const trackOpen=String(req.query.refresh??'')!=='1';
  try { return res.status(200).json({ok:true,portal:await getPlayerPortal(token,{trackOpen})}); }
  catch(error){ logger.error('Player portal read failed',error); return res.status(404).json({error:'PLAYER_PORTAL_READ_FAILED',message:error instanceof Error?error.message:String(error)}); }
});

export const markPlayerBriefing = onRequest({ region:'europe-west1', cors:true, maxInstances:15, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await markPlayerBriefingRead(String(body.token??'').trim())}); }
  catch(error){ logger.error('Player briefing read failed',error); return res.status(400).json({error:'PLAYER_BRIEFING_FAILED',message:error instanceof Error?error.message:String(error)}); }
});

export const readPlayerNotification = onRequest({ region:'europe-west1', cors:true, maxInstances:15, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await markPlayerNotificationRead(String(body.token??'').trim(),String(body.notificationId??'').trim())}); }
  catch(error){ logger.error('Player notification read failed',error); return res.status(400).json({error:'PLAYER_NOTIFICATION_READ_FAILED',message:error instanceof Error?error.message:String(error)}); }
});

export const sendLivePlayerNotification = onRequest({ region:'europe-west1', cors:true, maxInstances:8, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await sendPlayerNotification(String(body.sessionId??'').trim(),body)}); }
  catch(error){ logger.error('Player notification send failed',error); return res.status(400).json({error:'PLAYER_NOTIFICATION_SEND_FAILED',message:error instanceof Error?error.message:String(error)}); }
});

export const executePublicPlayerInteraction = onRequest({ region:'europe-west1', cors:true, maxInstances:15, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await executePlayerInteraction(String(body.token??'').trim(),body)}); }
  catch(error){ logger.error('Player interaction failed',error); const message=error instanceof Error?error.message:String(error); return res.status(400).json({error:'PLAYER_INTERACTION_FAILED',message,remainingSeconds:error?.remainingSeconds}); }
});

export const getPublicPlayerLocation = onRequest({ region:'europe-west1', cors:true, maxInstances:15, timeoutSeconds:60 }, async (req,res)=>{
  if(!requireGet(req,res))return;
  try { return res.status(200).json({ok:true,location:await getPlayerLocation(String(req.query.token??'').trim(),String(req.query.locationExternalId??'').trim())}); }
  catch(error){ logger.error('Player location read failed',error); return res.status(400).json({error:'PLAYER_LOCATION_READ_FAILED',message:error instanceof Error?error.message:String(error)}); }
});

export const executePublicPlayerLocationAction = onRequest({ region:'europe-west1', cors:true, maxInstances:15, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await executePlayerLocationAction(String(body.token??'').trim(),body)}); }
  catch(error){ logger.error('Player location action failed',error); const message=error instanceof Error?error.message:String(error); return res.status(400).json({error:'PLAYER_LOCATION_ACTION_FAILED',message,remainingSeconds:error?.remainingSeconds}); }
});

export const attemptPublicPlayerClandestineAction = onRequest({ region:'europe-west1', cors:true, maxInstances:15, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await attemptPlayerClandestineAction(String(body.token??'').trim(),body)}); }
  catch(error){ logger.error('Player clandestine action failed',error); const message=error instanceof Error?error.message:String(error); return res.status(400).json({error:'PLAYER_CLANDESTINE_ACTION_FAILED',message,remainingSeconds:error?.remainingSeconds}); }
});

export const claimPublicPlayerStolenObject = onRequest({ region:'europe-west1', cors:true, maxInstances:15, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await claimPlayerStolenObject(String(body.token??'').trim(),body)}); }
  catch(error){ logger.error('Player steal claim failed',error); return res.status(400).json({error:'PLAYER_STEAL_CLAIM_FAILED',message:error instanceof Error?error.message:String(error)}); }
});

export const transferPublicPlayerObject = onRequest({ region:'europe-west1', cors:true, maxInstances:15, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await transferPlayerObject(String(body.token??'').trim(),body)}); }
  catch(error){ logger.error('Player object transfer failed',error); return res.status(400).json({error:'PLAYER_OBJECT_TRANSFER_FAILED',message:error instanceof Error?error.message:String(error)}); }
});

export const transferPublicPlayerCash = onRequest({ region:'europe-west1', cors:true, maxInstances:15, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await transferPlayerCash(String(body.token??'').trim(),body)}); }
  catch(error){ logger.error('Player cash transfer failed',error); return res.status(400).json({error:'PLAYER_CASH_TRANSFER_FAILED',message:error instanceof Error?error.message:String(error)}); }
});

export const castPublicPlayerVote = onRequest({ region:'europe-west1', cors:true, maxInstances:15, timeoutSeconds:60 }, async (req,res)=>{
  const body=requirePostJson(req,res); if(!body)return;
  try { return res.status(200).json({ok:true,result:await castPlayerVote(String(body.token??'').trim(),body)}); }
  catch(error){ logger.error('Player vote failed',error); return res.status(400).json({error:'PLAYER_VOTE_FAILED',message:error instanceof Error?error.message:String(error)}); }
});



export const getSessionIncarnationsView = onRequest(
  {
    region:'europe-west1',
    cors:true,
    maxInstances:10,
    timeoutSeconds:60
  },
  async(req,res)=>{
    if(!requireGet(req,res))return;

    const sessionId=
      String(req.query.sessionId??'').trim();

    if(!sessionId)
      return res.status(400).json({
        error:'SESSION_ID_REQUIRED'
      });

    try{
      const data=
        await readSessionIncarnations(sessionId);

      return res.status(200).json({
        ok:true,
        ...data
      });

    }catch(error){
      logger.error(
        'Session incarnations read failed',
        error
      );

      return res.status(500).json({
        error:'SESSION_INCARNATIONS_READ_FAILED',
        message:
          error instanceof Error
            ? error.message
            : String(error),
        details:error?.details??undefined,
      });
    }
  }
);


export const updateSessionIncarnationView = onRequest(
  {
    region:'europe-west1',
    cors:true,
    maxInstances:10,
    timeoutSeconds:60
  },
  async(req,res)=>{
    if(req.method!=='POST'){
      res.set('Allow','POST');
      return res.status(405).json({
        error:'METHOD_NOT_ALLOWED',
        expected:'POST'
      });
    }

    const sessionId=
      String(req.body?.sessionId??'').trim();

    if(!sessionId)
      return res.status(400).json({
        error:'SESSION_ID_REQUIRED'
      });

    try{
      const result=
        await saveSessionIncarnation(
          sessionId,
          req.body
        );

      return res.status(200).json({
        ok:true,
        result
      });

    }catch(error){
      logger.error(
        'Session incarnation update failed',
        error
      );

      return res.status(500).json({
        error:'SESSION_INCARNATION_UPDATE_FAILED',
        message:
          error instanceof Error
            ? error.message
            : String(error),
        details:error?.details??undefined,
      });
    }
  }
);


export const freezeSessionIncarnationsView = onRequest(
  {
    region:'europe-west1',
    cors:true,
    maxInstances:10,
    timeoutSeconds:60
  },
  async(req,res)=>{
    if(req.method!=='POST'){
      res.set('Allow','POST');
      return res.status(405).json({
        error:'METHOD_NOT_ALLOWED',
        expected:'POST'
      });
    }

    const sessionId=
      String(req.body?.sessionId??'').trim();

    if(!sessionId)
      return res.status(400).json({
        error:'SESSION_ID_REQUIRED'
      });

    try{
      const result=
        await freezeIncarnations(sessionId);

      return res.status(200).json({
        ok:true,
        result
      });

    }catch(error){
      logger.error(
        'Session incarnations freeze failed',
        error
      );

      return res.status(500).json({
        error:'SESSION_INCARNATIONS_FREEZE_FAILED',
        message:
          error instanceof Error
            ? error.message
            : String(error),
        details:error?.details??undefined,
      });
    }
  }
);



export const getSessionGmPackView = onRequest(
  {
    region:'europe-west1',
    cors:true,
    maxInstances:5,
    timeoutSeconds:60,
  },
  async(req,res)=>{
    if(!requireGet(req,res))return;

    const sessionId=
      String(req.query.sessionId??'').trim();

    if(!sessionId)
      return res.status(400).json({
        error:'SESSION_ID_REQUIRED'
      });

    try{
      const pack=
        await getSessionGmPack(sessionId);

      return res.status(200).json({
        ok:true,
        pack
      });

    }catch(error){
      logger.error(
        'Session GM Pack read failed',
        error
      );

      return res.status(500).json({
        error:'SESSION_GM_PACK_READ_FAILED',
        message:
          error instanceof Error
            ? error.message
            : String(error),
        details:error?.details??undefined,
      });
    }
  }
);



// =========================================================
// V1.10B2 — APPARENCE COMMUNE DU SCÉNARIO
// =========================================================

export const updateScenarioAppearanceView = onRequest(
  {
    region: 'europe-west1',
    cors: true,
    maxInstances: 5,
    timeoutSeconds: 60,
  },
  async (req, res) => {
    const body = requirePostJson(req, res);
    if (!body) return;

    try {
      const appearance = await updateScenarioAppearanceFamily(
        String(body.scenarioId ?? '').trim(),
        body
      );

      return res.status(200).json({
        ok: true,
        appearance,
      });
    }
    catch (error) {
      logger.error(
        'Scenario appearance update failed',
        error
      );

      return res.status(400).json({
        error: 'SCENARIO_APPEARANCE_UPDATE_FAILED',
        message:
          error instanceof Error
            ? error.message
            : String(error),
        details: error?.details ?? undefined,
      });
    }
  }
);
