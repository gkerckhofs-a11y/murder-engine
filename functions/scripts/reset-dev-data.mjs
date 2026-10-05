import fs from 'node:fs';
import path from 'node:path';

import {
  initializeApp,
  getApps,
} from 'firebase-admin/app';

import {
  getDataConnect,
} from 'firebase-admin/data-connect';


const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'murder-engine-ludificateur';

const REGION = 'europe-west1';
const SERVICE_ID = 'murder-engine';

const CONFIRM =
  process.env.MURDER_RESET === 'DELETE_ALL_DEV_DATA';


// ----------------------------------------------------------
// Lecture du schéma réel
// ----------------------------------------------------------

const schemaPath = path.resolve(
  process.cwd(),
  '../dataconnect/schema/schema.gql'
);

if (!fs.existsSync(schemaPath)) {
  throw new Error(
    `Schema introuvable : ${schemaPath}\n` +
    `Lance le script depuis ~/murder-engine-prototype/functions`
  );
}

const schema = fs.readFileSync(schemaPath, 'utf8');


// ----------------------------------------------------------
// Détection automatique des @table
// ----------------------------------------------------------

const tables = new Map();

const tableRegex =
  /type\s+([A-Za-z_][A-Za-z0-9_]*)\s+@table(?:\([^)]*\))?\s*\{([\s\S]*?)\n\}/g;

let match;

while ((match = tableRegex.exec(schema))) {
  tables.set(match[1], match[2]);
}

if (!tables.size) {
  throw new Error('Aucune table Data Connect détectée.');
}


// ----------------------------------------------------------
// Dépendances entre tables
//
// Exemple :
// SessionParticipant -> GameSession
// GameSession        -> ScenarioVersion
// ScenarioVersion    -> Scenario
// Scenario           -> Organization
//
// Pour supprimer : ordre inverse.
// ----------------------------------------------------------

const dependencies = new Map();

for (const [typeName, body] of tables) {

  const refs = new Set();

  const fieldRegex =
    /^\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*\[?\s*([A-Z][A-Za-z0-9_]*)/gm;

  let field;

  while ((field = fieldRegex.exec(body))) {
    const referencedType = field[1];

    if (
      referencedType !== typeName &&
      tables.has(referencedType)
    ) {
      refs.add(referencedType);
    }
  }

  dependencies.set(typeName, refs);
}


// ----------------------------------------------------------
// Tri topologique
// ----------------------------------------------------------

const permanent = new Set();
const temporary = new Set();
const ordered = [];

function visit(typeName, stack = []) {

  if (permanent.has(typeName))
    return;

  if (temporary.has(typeName)) {
    throw new Error(
      `Cycle de dépendances détecté : ` +
      [...stack, typeName].join(' -> ')
    );
  }

  temporary.add(typeName);

  for (const dep of dependencies.get(typeName) ?? []) {
    visit(dep, [...stack, typeName]);
  }

  temporary.delete(typeName);
  permanent.add(typeName);

  ordered.push(typeName);
}

for (const typeName of tables.keys()) {
  visit(typeName);
}


// Parents d'abord dans ordered.
// Pour effacer : enfants d'abord.
const deleteOrder = [...ordered]
  .reverse()

  // IMPORTANT :
  // On conserve l'organisation Le Ludificateur.
  .filter(typeName => typeName !== 'Organization');


function lowerCamel(value) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}


// ----------------------------------------------------------
// Mutation transactionnelle
// ----------------------------------------------------------

const mutationFields = deleteOrder
  .map(
    (typeName, index) =>
      `  d${index}: ${lowerCamel(typeName)}_deleteMany(all: true)`
  )
  .join('\n');

const RESET_MUTATION = `
mutation ResetMurderEngineDevData @transaction {
${mutationFields}
}
`;


// ----------------------------------------------------------
// Connexion Admin Data Connect
// ----------------------------------------------------------

if (!getApps().length) {
  initializeApp({
    projectId: PROJECT_ID,
  });
}

const dc = getDataConnect({
  location: REGION,
  serviceId: SERVICE_ID,
});


// ----------------------------------------------------------
// Sécurité multi-tenant
// ----------------------------------------------------------

const PRECHECK = `
query ResetPrecheck {
  organizations {
    id
    name
    slug
  }
}
`;

const precheckResponse =
  await dc.executeGraphqlRead(PRECHECK);

const precheck =
  precheckResponse?.data ??
  precheckResponse;

const organizations =
  precheck?.organizations ?? [];

console.log('');
console.log('==========================================');
console.log(' Murder Engine — RESET DEV DATA');
console.log('==========================================');
console.log('');

console.log('Projet      :', PROJECT_ID);
console.log('Région      :', REGION);
console.log('Service     :', SERVICE_ID);
console.log('');

console.log(
  'Organisation(s) détectée(s) :',
  organizations.map(o => `${o.name} (${o.slug})`).join(', ') || 'aucune'
);

if (
  organizations.length !== 1 ||
  organizations[0]?.slug !== 'ludificateur'
) {
  throw new Error(
    'RESET_REFUSED_MULTI_TENANT: ' +
    'le script refuse de purger une base qui ne contient pas ' +
    'exactement une organisation "ludificateur".'
  );
}


// ----------------------------------------------------------
// Rapport
// ----------------------------------------------------------

console.log('');
console.log('Tables détectées :', tables.size);
console.log('');

console.log('CONSERVÉE :');
console.log('  ✓ Organization');
console.log('');

console.log('SUPPRIMÉES dans cet ordre :');

deleteOrder.forEach((name, i) => {
  console.log(
    `  ${String(i + 1).padStart(2, '0')}. ${name}`
  );
});

console.log('');


// ----------------------------------------------------------
// Dry run par défaut
// ----------------------------------------------------------

if (!CONFIRM) {

  console.log('------------------------------------------');
  console.log('DRY RUN — aucune donnée supprimée.');
  console.log('------------------------------------------');
  console.log('');
  console.log(
    'Pour lancer réellement le reset :'
  );
  console.log('');
  console.log(
    'MURDER_RESET=DELETE_ALL_DEV_DATA ' +
    'node scripts/reset-dev-data.mjs'
  );
  console.log('');

  process.exit(0);
}


// ----------------------------------------------------------
// RESET
// ----------------------------------------------------------

console.log('⚠️  RESET RÉEL EN COURS...');
console.log('');

const result =
  await dc.executeGraphql(
    RESET_MUTATION,
    {
      variables: {},
    }
  );

const errors =
  result?.errors ??
  result?.data?.errors ??
  [];

if (errors.length) {
  console.error(errors);
  throw new Error(
    'RESET_FAILED — transaction annulée.'
  );
}

console.log('');
console.log('==========================================');
console.log(' ✅ RESET TERMINÉ');
console.log('==========================================');
console.log('');
console.log(
  'Organization conservée : ludificateur'
);
console.log(
  'Scénarios / versions / sessions / runtime : supprimés'
);
console.log('');
