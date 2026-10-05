import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface Character_Key {
  scenarioVersionId: UUIDString;
  externalId: string;
  __typename?: 'Character_Key';
}

export interface ClueFact_Key {
  scenarioVersionId: UUIDString;
  clueExternalId: string;
  factExternalId: string;
  __typename?: 'ClueFact_Key';
}

export interface Clue_Key {
  scenarioVersionId: UUIDString;
  externalId: string;
  __typename?: 'Clue_Key';
}

export interface Fact_Key {
  scenarioVersionId: UUIDString;
  externalId: string;
  __typename?: 'Fact_Key';
}

export interface GameObject_Key {
  scenarioVersionId: UUIDString;
  externalId: string;
  __typename?: 'GameObject_Key';
}

export interface GameSession_Key {
  id: UUIDString;
  __typename?: 'GameSession_Key';
}

export interface GetScenarioVersionOverviewData {
  scenarioVersion?: {
    id: UUIDString;
    sourceScenarioId: string;
    versionLabel: string;
    templateVersion: string;
    language: string;
    status: string;
    subtitle?: string | null;
    universe?: string | null;
    era?: string | null;
    gmSummary: string;
    playerSummary: string;
    durationMinutes?: number | null;
    minPlayers?: number | null;
    maxPlayers?: number | null;
    sourceFilename?: string | null;
    sourceHash?: string | null;
    importedAt: TimestampString;
    scenario: {
      id: UUIDString;
      title: string;
      slug: string;
      organization: {
        id: UUIDString;
        name: string;
        slug: string;
      } & Organization_Key;
    } & Scenario_Key;
    characters_on_scenarioVersion: ({
      externalId: string;
      name: string;
      publicRole?: string | null;
      importance: string;
      intensity: string;
      playable: boolean;
      active: boolean;
    })[];
    facts_on_scenarioVersion: ({
      externalId: string;
      title: string;
      nature: string;
      importance: string;
      isPublic: boolean;
      active: boolean;
    })[];
    clues_on_scenarioVersion: ({
      externalId: string;
      playerName: string;
      clueType: string;
      support: string;
      major: boolean;
      active: boolean;
    })[];
  } & ScenarioVersion_Key;
}

export interface GetScenarioVersionOverviewVariables {
  versionId: UUIDString;
}

export interface InitialKnowledge_Key {
  scenarioVersionId: UUIDString;
  characterExternalId: string;
  factExternalId: string;
  __typename?: 'InitialKnowledge_Key';
}

export interface Interaction_Key {
  scenarioVersionId: UUIDString;
  externalId: string;
  __typename?: 'Interaction_Key';
}

export interface ListScenarioVersionsData {
  scenarioVersions: ({
    id: UUIDString;
    sourceScenarioId: string;
    versionLabel: string;
    templateVersion: string;
    language: string;
    status: string;
    subtitle?: string | null;
    universe?: string | null;
    era?: string | null;
    durationMinutes?: number | null;
    minPlayers?: number | null;
    maxPlayers?: number | null;
    sourceFilename?: string | null;
    sourceHash?: string | null;
    locked: boolean;
    importedAt: TimestampString;
  } & ScenarioVersion_Key)[];
}

export interface ListScenarioVersionsVariables {
  scenarioId: UUIDString;
}

export interface ListScenariosData {
  scenarios: ({
    id: UUIDString;
    title: string;
    slug: string;
    archived: boolean;
    createdAt: TimestampString;
    updatedAt: TimestampString;
    organization: {
      id: UUIDString;
      name: string;
      slug: string;
    } & Organization_Key;
  } & Scenario_Key)[];
}

export interface Organization_Key {
  id: UUIDString;
  __typename?: 'Organization_Key';
}

export interface Plot_Key {
  scenarioVersionId: UUIDString;
  externalId: string;
  __typename?: 'Plot_Key';
}

export interface Resource_Key {
  scenarioVersionId: UUIDString;
  externalId: string;
  __typename?: 'Resource_Key';
}

export interface ScenarioVersion_Key {
  id: UUIDString;
  __typename?: 'ScenarioVersion_Key';
}

export interface Scenario_Key {
  id: UUIDString;
  __typename?: 'Scenario_Key';
}

interface ListScenariosRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListScenariosData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListScenariosData, undefined>;
  operationName: string;
}
export const listScenariosRef: ListScenariosRef;

export function listScenarios(options?: ExecuteQueryOptions): QueryPromise<ListScenariosData, undefined>;
export function listScenarios(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListScenariosData, undefined>;

interface ListScenarioVersionsRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: ListScenarioVersionsVariables): QueryRef<ListScenarioVersionsData, ListScenarioVersionsVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: ListScenarioVersionsVariables): QueryRef<ListScenarioVersionsData, ListScenarioVersionsVariables>;
  operationName: string;
}
export const listScenarioVersionsRef: ListScenarioVersionsRef;

export function listScenarioVersions(vars: ListScenarioVersionsVariables, options?: ExecuteQueryOptions): QueryPromise<ListScenarioVersionsData, ListScenarioVersionsVariables>;
export function listScenarioVersions(dc: DataConnect, vars: ListScenarioVersionsVariables, options?: ExecuteQueryOptions): QueryPromise<ListScenarioVersionsData, ListScenarioVersionsVariables>;

interface GetScenarioVersionOverviewRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetScenarioVersionOverviewVariables): QueryRef<GetScenarioVersionOverviewData, GetScenarioVersionOverviewVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetScenarioVersionOverviewVariables): QueryRef<GetScenarioVersionOverviewData, GetScenarioVersionOverviewVariables>;
  operationName: string;
}
export const getScenarioVersionOverviewRef: GetScenarioVersionOverviewRef;

export function getScenarioVersionOverview(vars: GetScenarioVersionOverviewVariables, options?: ExecuteQueryOptions): QueryPromise<GetScenarioVersionOverviewData, GetScenarioVersionOverviewVariables>;
export function getScenarioVersionOverview(dc: DataConnect, vars: GetScenarioVersionOverviewVariables, options?: ExecuteQueryOptions): QueryPromise<GetScenarioVersionOverviewData, GetScenarioVersionOverviewVariables>;

