# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.





## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { listScenarios, listScenarioVersions, getScenarioVersionOverview } from '@murder-engine/dataconnect';


// Operation ListScenarios: 
const { data } = await ListScenarios(dataConnect);

// Operation ListScenarioVersions:  For variables, look at type ListScenarioVersionsVars in ../index.d.ts
const { data } = await ListScenarioVersions(dataConnect, listScenarioVersionsVars);

// Operation GetScenarioVersionOverview:  For variables, look at type GetScenarioVersionOverviewVars in ../index.d.ts
const { data } = await GetScenarioVersionOverview(dataConnect, getScenarioVersionOverviewVars);


```