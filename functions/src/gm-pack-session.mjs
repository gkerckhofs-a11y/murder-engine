import {getGmPack} from './gm-pack.mjs';
import {getSessionIncarnations} from './session-incarnations.mjs';
import {getGameSession} from './sessions.mjs';

export async function getSessionGmPack(sessionId){
  const [incarnationData,sessionDetail]=await Promise.all([
    getSessionIncarnations(sessionId),
    getGameSession(sessionId),
  ]);

  const versionId=
    incarnationData.session?.versionId;

  if(!versionId)
    throw new Error('SESSION_SCENARIO_VERSION_NOT_FOUND');

  const base=
    await getGmPack(versionId);

  const baseSheets=
    new Map(
      (base.printables?.characterSheets??[])
        .map(sheet=>[sheet.externalId,sheet])
    );

  const characterSheets=
    incarnationData.incarnations.map(row=>{
      const baseSheet=
        baseSheets.get(row.characterExternalId)??{};

      const resolved=
        row.resolved??{};

      return {
        ...baseSheet,
        ...(resolved.character??{}),

        externalId:
          row.characterExternalId,

        participantDisplayName:
          row.participantDisplayName,

        genderVariant:
          row.genderVariant??null,

        frozen:
          Boolean(row.frozen),

        snapshotAt:
          row.snapshotAt??null,

        objectives:
          resolved.objectives ??
          baseSheet.objectives ??
          [],

        relationships:
          resolved.relationships ??
          baseSheet.relationships ??
          [],

        startingDocuments:
          baseSheet.startingDocuments??[],

        startingObjects:
          baseSheet.startingObjects??[],
      };
    });


  const envelopeLabels=
    characterSheets.map(character=>({
      characterExternalId:
        character.externalId,

      name:
        character.name,

      publicRole:
        character.publicRole??null,

      participantDisplayName:
        character.participantDisplayName??null,

      documents:
        (character.startingDocuments??[])
          .map(d=>d.title),

      objects:
        (character.startingObjects??[])
          .map(o=>o.name),
    }));


  const qrCharacters=
    characterSheets.map(character=>({
      externalId:
        character.externalId,

      name:
        character.name,

      publicRole:
        character.publicRole??null,

      participantDisplayName:
        character.participantDisplayName??null,

      portrait:
        character.portrait??null,
    }));


  const casting=
    characterSheets.map(character=>({
      characterExternalId:
        character.externalId,

      characterName:
        character.name,

      publicRole:
        character.publicRole??null,

      participantDisplayName:
        character.participantDisplayName,

      genderVariant:
        character.genderVariant??null,

      frozen:
        Boolean(character.frozen),

      snapshotAt:
        character.snapshotAt??null,
    }));


  const playerAccess=
    (sessionDetail?.participants??[])
      .filter(p=>
        p.active!==false &&
        p.characterExternalId &&
        p.playerAccessEnabled===true &&
        p.playerAccessToken
      )
      .map(p=>{
        const character=
          characterSheets.find(c=>
            c.externalId===p.characterExternalId
          );

        return {
          participantId:p.id,
          participantDisplayName:p.displayName,
          characterExternalId:p.characterExternalId,
          characterName:character?.name??p.characterExternalId,
          publicRole:character?.publicRole??null,
          playerAccessToken:p.playerAccessToken,
        };
      })
      .sort((a,b)=>
        String(a.characterName).localeCompare(String(b.characterName))
      );


  const frozenCount=
    casting.filter(row=>row.frozen).length;

  const sessionDiagnostics=[
    ...(frozenCount<casting.length
      ? [{
          severity:'WARNING',
          title:'Fiches non figées',
          message:
            `${casting.length-frozenCount} personnage(s) utilisent encore leur contenu canonique dynamique. `+
            `Fige les fiches avant la production finale du Pack.`,
        }]
      : [{
          severity:'INFO',
          title:'Incarnations figées',
          message:
            `Les ${casting.length} fiches personnages sont figées pour cette session.`,
        }]
    ),
  ];


  const setupChecklist=[
    {
      group:'SESSION',
      label:
        `Vérifier le casting des ${characterSheets.length} personnages`,
    },
    {
      group:'SESSION',
      label:
        `Vérifier que les ${characterSheets.length} incarnations sont figées`,
    },
    {
      group:'IMPRESSION',
      label:
        `Imprimer ${characterSheets.length} fiches personnages`,
    },
    {
      group:'IMPRESSION',
      label:
        `Préparer ${characterSheets.length} QR personnages`,
    },

    ...(base.printables?.setupChecklist??[])
      .filter(row=>
        !/fiches personnages/i.test(row.label??'') &&
        !/QR personnages/i.test(row.label??'')
      ),
  ];


  return {
    ...base,

    session:{
      ...incarnationData.session,

      casting,

      playerAccess,

      frozenCount,

      characterCount:
        characterSheets.length,

      packReady:
        characterSheets.length>0 &&
        frozenCount===characterSheets.length,
    },

    counts:{
      ...base.counts,
      characters:
        characterSheets.length,
    },

    printables:{
      ...base.printables,

      characterSheets,

      envelopeLabels,

      setupChecklist,
    },

    logistics:{
      ...base.logistics,

      qrCharacters,
    },

    diagnostics:[
      ...sessionDiagnostics,
      ...(base.diagnostics??[]),
    ],

    capabilities:{
      ...base.capabilities,
      sessionSpecificMaterials:true,
      playerAccessQr:true,
    },
  };
}
