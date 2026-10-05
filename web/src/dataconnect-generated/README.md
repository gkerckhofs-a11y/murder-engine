# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `admin`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*ListScenarios*](#listscenarios)
  - [*ListScenarioVersions*](#listscenarioversions)
  - [*GetScenarioVersionOverview*](#getscenarioversionoverview)
- [**Mutations**](#mutations)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `admin`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@murder-engine/dataconnect` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@murder-engine/dataconnect';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@murder-engine/dataconnect';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `admin` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## ListScenarios
You can execute the `ListScenarios` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listScenarios(options?: ExecuteQueryOptions): QueryPromise<ListScenariosData, undefined>;

interface ListScenariosRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListScenariosData, undefined>;
}
export const listScenariosRef: ListScenariosRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listScenarios(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListScenariosData, undefined>;

interface ListScenariosRef {
  ...
  (dc: DataConnect): QueryRef<ListScenariosData, undefined>;
}
export const listScenariosRef: ListScenariosRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listScenariosRef:
```typescript
const name = listScenariosRef.operationName;
console.log(name);
```

### Variables
The `ListScenarios` query has no variables.
### Return Type
Recall that executing the `ListScenarios` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListScenariosData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `ListScenarios`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listScenarios } from '@murder-engine/dataconnect';


// Call the `listScenarios()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listScenarios();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listScenarios(dataConnect);

console.log(data.scenarios);

// Or, you can use the `Promise` API.
listScenarios().then((response) => {
  const data = response.data;
  console.log(data.scenarios);
});
```

### Using `ListScenarios`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listScenariosRef } from '@murder-engine/dataconnect';


// Call the `listScenariosRef()` function to get a reference to the query.
const ref = listScenariosRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listScenariosRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.scenarios);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.scenarios);
});
```

## ListScenarioVersions
You can execute the `ListScenarioVersions` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listScenarioVersions(vars: ListScenarioVersionsVariables, options?: ExecuteQueryOptions): QueryPromise<ListScenarioVersionsData, ListScenarioVersionsVariables>;

interface ListScenarioVersionsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: ListScenarioVersionsVariables): QueryRef<ListScenarioVersionsData, ListScenarioVersionsVariables>;
}
export const listScenarioVersionsRef: ListScenarioVersionsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listScenarioVersions(dc: DataConnect, vars: ListScenarioVersionsVariables, options?: ExecuteQueryOptions): QueryPromise<ListScenarioVersionsData, ListScenarioVersionsVariables>;

interface ListScenarioVersionsRef {
  ...
  (dc: DataConnect, vars: ListScenarioVersionsVariables): QueryRef<ListScenarioVersionsData, ListScenarioVersionsVariables>;
}
export const listScenarioVersionsRef: ListScenarioVersionsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listScenarioVersionsRef:
```typescript
const name = listScenarioVersionsRef.operationName;
console.log(name);
```

### Variables
The `ListScenarioVersions` query requires an argument of type `ListScenarioVersionsVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface ListScenarioVersionsVariables {
  scenarioId: UUIDString;
}
```
### Return Type
Recall that executing the `ListScenarioVersions` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListScenarioVersionsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `ListScenarioVersions`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listScenarioVersions, ListScenarioVersionsVariables } from '@murder-engine/dataconnect';

// The `ListScenarioVersions` query requires an argument of type `ListScenarioVersionsVariables`:
const listScenarioVersionsVars: ListScenarioVersionsVariables = {
  scenarioId: ..., 
};

// Call the `listScenarioVersions()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listScenarioVersions(listScenarioVersionsVars);
// Variables can be defined inline as well.
const { data } = await listScenarioVersions({ scenarioId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listScenarioVersions(dataConnect, listScenarioVersionsVars);

console.log(data.scenarioVersions);

// Or, you can use the `Promise` API.
listScenarioVersions(listScenarioVersionsVars).then((response) => {
  const data = response.data;
  console.log(data.scenarioVersions);
});
```

### Using `ListScenarioVersions`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listScenarioVersionsRef, ListScenarioVersionsVariables } from '@murder-engine/dataconnect';

// The `ListScenarioVersions` query requires an argument of type `ListScenarioVersionsVariables`:
const listScenarioVersionsVars: ListScenarioVersionsVariables = {
  scenarioId: ..., 
};

// Call the `listScenarioVersionsRef()` function to get a reference to the query.
const ref = listScenarioVersionsRef(listScenarioVersionsVars);
// Variables can be defined inline as well.
const ref = listScenarioVersionsRef({ scenarioId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listScenarioVersionsRef(dataConnect, listScenarioVersionsVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.scenarioVersions);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.scenarioVersions);
});
```

## GetScenarioVersionOverview
You can execute the `GetScenarioVersionOverview` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getScenarioVersionOverview(vars: GetScenarioVersionOverviewVariables, options?: ExecuteQueryOptions): QueryPromise<GetScenarioVersionOverviewData, GetScenarioVersionOverviewVariables>;

interface GetScenarioVersionOverviewRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetScenarioVersionOverviewVariables): QueryRef<GetScenarioVersionOverviewData, GetScenarioVersionOverviewVariables>;
}
export const getScenarioVersionOverviewRef: GetScenarioVersionOverviewRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getScenarioVersionOverview(dc: DataConnect, vars: GetScenarioVersionOverviewVariables, options?: ExecuteQueryOptions): QueryPromise<GetScenarioVersionOverviewData, GetScenarioVersionOverviewVariables>;

interface GetScenarioVersionOverviewRef {
  ...
  (dc: DataConnect, vars: GetScenarioVersionOverviewVariables): QueryRef<GetScenarioVersionOverviewData, GetScenarioVersionOverviewVariables>;
}
export const getScenarioVersionOverviewRef: GetScenarioVersionOverviewRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getScenarioVersionOverviewRef:
```typescript
const name = getScenarioVersionOverviewRef.operationName;
console.log(name);
```

### Variables
The `GetScenarioVersionOverview` query requires an argument of type `GetScenarioVersionOverviewVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetScenarioVersionOverviewVariables {
  versionId: UUIDString;
}
```
### Return Type
Recall that executing the `GetScenarioVersionOverview` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetScenarioVersionOverviewData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `GetScenarioVersionOverview`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getScenarioVersionOverview, GetScenarioVersionOverviewVariables } from '@murder-engine/dataconnect';

// The `GetScenarioVersionOverview` query requires an argument of type `GetScenarioVersionOverviewVariables`:
const getScenarioVersionOverviewVars: GetScenarioVersionOverviewVariables = {
  versionId: ..., 
};

// Call the `getScenarioVersionOverview()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getScenarioVersionOverview(getScenarioVersionOverviewVars);
// Variables can be defined inline as well.
const { data } = await getScenarioVersionOverview({ versionId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getScenarioVersionOverview(dataConnect, getScenarioVersionOverviewVars);

console.log(data.scenarioVersion);

// Or, you can use the `Promise` API.
getScenarioVersionOverview(getScenarioVersionOverviewVars).then((response) => {
  const data = response.data;
  console.log(data.scenarioVersion);
});
```

### Using `GetScenarioVersionOverview`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getScenarioVersionOverviewRef, GetScenarioVersionOverviewVariables } from '@murder-engine/dataconnect';

// The `GetScenarioVersionOverview` query requires an argument of type `GetScenarioVersionOverviewVariables`:
const getScenarioVersionOverviewVars: GetScenarioVersionOverviewVariables = {
  versionId: ..., 
};

// Call the `getScenarioVersionOverviewRef()` function to get a reference to the query.
const ref = getScenarioVersionOverviewRef(getScenarioVersionOverviewVars);
// Variables can be defined inline as well.
const ref = getScenarioVersionOverviewRef({ versionId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getScenarioVersionOverviewRef(dataConnect, getScenarioVersionOverviewVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.scenarioVersion);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.scenarioVersion);
});
```

# Mutations

No mutations were generated for the `admin` connector.

If you want to learn more about how to use mutations in Data Connect, you can follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

