const SCENARIO_APPEARANCE_QUERY = `
query ScenarioAppearanceTarget($scenarioId: UUID!) {
  scenario(id: $scenarioId) {
    id
    title
    skinId
    accentColor
  }
}
`;

const UPDATE_SCENARIO_APPEARANCE = `
mutation UpdateScenarioAppearance(
  $scenarioId: UUID!,
  $skinId: String!,
  $accentColor: String,
  $updatedAt: Timestamp!
) @transaction {

  scenario_update(
    id: $scenarioId,
    data: {
      skinId: $skinId,
      accentColor: $accentColor,
      updatedAt: $updatedAt
    }
  )

  scenarioVersion_updateMany(
    where: {
      scenarioId: { eq: $scenarioId }
    },
    data: {
      skinId: $skinId,
      accentColor: $accentColor
    }
  )
}
`;

async function getAdminDataConnect(){
  const [{initializeApp,getApps},{getDataConnect}] =
    await Promise.all([
      import('firebase-admin/app'),
      import('firebase-admin/data-connect'),
    ]);

  if(!getApps().length) initializeApp();

  return getDataConnect({
    location:'europe-west1',
    serviceId:'murder-engine',
  });
}

async function reader(operation,variables){
  const dc=await getAdminDataConnect();
  const response=await dc.executeGraphqlRead(operation,{variables});

  const errors=response?.errors??response?.data?.errors??[];
  if(errors.length){
    const e=new Error('DATACONNECT_APPEARANCE_READ_FAILED');
    e.details=errors;
    throw e;
  }

  return response?.data??response;
}

async function executor(operation,variables){
  const dc=await getAdminDataConnect();
  const response=await dc.executeGraphql(operation,{variables});

  const errors=response?.errors??response?.data?.errors??[];
  if(errors.length){
    const e=new Error('DATACONNECT_APPEARANCE_WRITE_FAILED');
    e.details=errors;
    throw e;
  }

  return response?.data??response;
}

function normalizeSkinId(value){
  const skinId=String(value??'').trim().toUpperCase();

  if(!/^[A-Z][A-Z0-9_]{1,63}$/.test(skinId))
    throw new Error('INVALID_SKIN_ID');

  return skinId;
}

function normalizeAccent(value){
  const accentColor=String(value??'').trim();

  if(!accentColor) return null;

  if(!/^#[0-9A-Fa-f]{6}$/.test(accentColor))
    throw new Error('INVALID_ACCENT_COLOR');

  return accentColor.toUpperCase();
}

export async function updateScenarioAppearanceFamily(
  scenarioId,
  input,
  {now=new Date()}={}
){
  const id=String(scenarioId??'').trim();

  if(!id)
    throw new Error('SCENARIO_ID_REQUIRED');

  const existing=await reader(
    SCENARIO_APPEARANCE_QUERY,
    {scenarioId:id}
  );

  if(!existing?.scenario)
    throw new Error('SCENARIO_NOT_FOUND');

  const skinId=normalizeSkinId(input?.skinId);
  const accentColor=normalizeAccent(input?.accentColor);

  const result=await executor(
    UPDATE_SCENARIO_APPEARANCE,
    {
      scenarioId:id,
      skinId,
      accentColor,
      updatedAt:now.toISOString(),
    }
  );

  return {
    scenarioId:id,
    skinId,
    accentColor,
    updatedVersions:
      Number(result?.scenarioVersion_updateMany??0),
  };
}

export const __scenarioAppearanceOps={
  SCENARIO_APPEARANCE_QUERY,
  UPDATE_SCENARIO_APPEARANCE,
};
