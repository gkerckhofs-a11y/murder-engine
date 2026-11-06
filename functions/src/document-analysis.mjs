/**
 * Scenario-agnostic document examination. This file contains no persistence,
 * transport or UI logic: the scenario defines all facts and skill thresholds.
 */
const TYPES = new Set(['CLUE', 'DOCUMENT', 'OBJECT']);
const key = (type,id) => type + ':' + id;
const byId = (rows) => new Map((rows || []).filter(x => x && x.active !== false).map(x => [x.externalId,x]));
const rows = (source,first,second) => source?.[first] ?? source?.[second] ?? [];

export function examinationAliases(source,type,externalId) {
  const targetType = String(type ?? '').trim().toUpperCase();
  const id = String(externalId ?? '').trim();
  if (!TYPES.has(targetType) || !id || id.length > 180) throw new Error('DOCUMENT_TARGET_INVALID');

  const clues = rows(source,'clues');
  const docs = rows(source,'documentDefinitions','documents');
  const aliases = new Set([key(targetType,id)]);
  const addClue = (clue) => {
    if (!clue || clue.active === false) return;
    aliases.add(key('CLUE',clue.externalId));
    if (clue.objectExternalId) aliases.add(key('OBJECT',clue.objectExternalId));
    if (clue.documentExternalId) {
      aliases.add(key('DOCUMENT',clue.documentExternalId));
      const doc = docs.find(d => d.externalId === clue.documentExternalId && d.active !== false);
      if (doc && String(doc.support).toUpperCase() !== 'DIGITAL')
        aliases.add(key('OBJECT','DOC_OBJ_' + doc.externalId));
    }
  };

  if (targetType === 'CLUE') addClue(clues.find(c => c.externalId === id));
  if (targetType === 'OBJECT') {
    for (const clue of clues.filter(c => c.objectExternalId === id)) addClue(clue);
    if (id.startsWith('DOC_OBJ_')) {
      const docId = id.slice('DOC_OBJ_'.length);
      if (docs.some(d => d.externalId === docId && d.active !== false)) {
        aliases.add(key('DOCUMENT',docId));
        for (const clue of clues.filter(c => c.documentExternalId === docId)) addClue(clue);
      }
    }
  }
  if (targetType === 'DOCUMENT') {
    const doc = docs.find(d => d.externalId === id && d.active !== false);
    if (doc && String(doc.support).toUpperCase() !== 'DIGITAL')
      aliases.add(key('OBJECT','DOC_OBJ_' + id));
    for (const clue of clues.filter(c => c.documentExternalId === id)) addClue(clue);
  }
  return aliases;
}

export function isDocumentExaminable(source,type,externalId) {
  const aliases = examinationAliases(source,type,externalId);
  return rows(source,'documentAnalysisDefinitions','documentAnalyses')
    .some(r => r.active !== false && aliases.has(key(String(r.targetType).toUpperCase(),r.targetExternalId)));
}

export function verifyDocumentPossession(source,runtime,characterExternalId,type,externalId) {
  const targetType = String(type ?? '').trim().toUpperCase();
  const id = String(externalId ?? '').trim();
  const clues = byId(rows(source,'clues'));
  const docs = byId(rows(source,'documentDefinitions','documents'));
  const objects = byId(rows(source,'gameObjects'));
  const heldObject = (objectId) => (runtime?.sessionObjects ?? []).some(o =>
    o.objectExternalId === objectId && o.inPlay !== false &&
    o.holderType === 'CHARACTER' && o.holderExternalId === characterExternalId
  );
  const discovered = (clueId) => (runtime?.sessionClueDiscoveries ?? []).some(d =>
    d.clueExternalId === clueId && d.characterExternalId === characterExternalId
  );

  if (targetType === 'OBJECT') {
    if (!objects.has(id)) throw new Error('DOCUMENT_TARGET_NOT_FOUND');
    if (!heldObject(id)) throw new Error('DOCUMENT_NOT_IN_INVENTORY');
    return true;
  }

  if (targetType === 'CLUE') {
    const clue = clues.get(id);
    if (!clue) throw new Error('DOCUMENT_TARGET_NOT_FOUND');
    if (clue.objectExternalId) {
      if (!heldObject(clue.objectExternalId)) throw new Error('DOCUMENT_NOT_IN_INVENTORY');
    } else if (clue.documentExternalId &&
      String(docs.get(clue.documentExternalId)?.support).toUpperCase() !== 'DIGITAL' &&
      docs.has(clue.documentExternalId)) {
      if (!heldObject('DOC_OBJ_' + clue.documentExternalId))
        throw new Error('DOCUMENT_NOT_IN_INVENTORY');
    } else if (!discovered(id)) throw new Error('DOCUMENT_NOT_IN_INVENTORY');
    return true;
  }

  if (targetType === 'DOCUMENT') {
    const doc = docs.get(id);
    if (!doc) throw new Error('DOCUMENT_TARGET_NOT_FOUND');
    const relatedClues = [...clues.values()].filter(c => c.documentExternalId === id);
    const objectIds = relatedClues.map(c => c.objectExternalId).filter(Boolean);
    if (String(doc.support).toUpperCase() !== 'DIGITAL')
      objectIds.push('DOC_OBJ_' + id);
    if (objectIds.length) {
      if (!objectIds.some(heldObject)) throw new Error('DOCUMENT_NOT_IN_INVENTORY');
    } else if (!relatedClues.some(c => discovered(c.externalId))) {
      throw new Error('DOCUMENT_NOT_IN_INVENTORY');
    }
    return true;
  }
  throw new Error('DOCUMENT_TARGET_INVALID');
}

/** Returns only facts this actor can legitimately interpret, no locked content. */
export function planDocumentExamination(source,runtime,characterExternalId,type,externalId) {
  verifyDocumentPossession(source,runtime,characterExternalId,type,externalId);
  const aliases = examinationAliases(source,type,externalId);
  const rules = rows(source,'documentAnalysisDefinitions','documentAnalyses')
    .filter(r => r.active !== false && aliases.has(key(String(r.targetType).toUpperCase(),r.targetExternalId)));
  if (!rules.length) throw new Error('DOCUMENT_NOT_ANALYZABLE');

  const abilities = byId(rows(source,'abilities'));
  const facts = byId(rows(source,'facts'));
  const levels = new Map();
  for (const a of rows(source,'abilityAssignments')) {
    if (a.active === false) continue;
    if (a.ownerType !== 'CHARACTER' || a.ownerExternalId !== characterExternalId) continue;
    if (!abilities.has(a.abilityExternalId)) continue;
    levels.set(a.abilityExternalId,Math.max(Number(levels.get(a.abilityExternalId) ?? -1),Number(a.level ?? 0)));
  }
  const matched = new Map();
  for (const rule of rules) {
    const abilityId = String(rule.abilityExternalId ?? '').trim();
    const required = Number(rule.minLevel ?? 0);
    if (!Number.isInteger(required) || required < 0) continue;
    if (abilityId && (!levels.has(abilityId) || levels.get(abilityId) < required)) continue;
    if (!abilityId && required > 0) continue;
    const fact = facts.get(rule.factExternalId);
    if (!fact) continue;
    if (!matched.has(fact.externalId)) {
      matched.set(fact.externalId,{
        factExternalId:fact.externalId,
        title:fact.title,
        text:fact.text,
        abilityName:abilityId ? (abilities.get(abilityId)?.name ?? null) : null,
        requiredLevel:required,
      });
    }
  }
  return {
    targetType:String(type).toUpperCase(),targetExternalId:String(externalId),
    results:[...matched.values()],
  };
}
