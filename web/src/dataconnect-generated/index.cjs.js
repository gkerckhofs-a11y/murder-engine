const { queryRef, executeQuery, validateArgsWithOptions, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'admin',
  service: 'murder-engine',
  location: 'europe-west1'
};
exports.connectorConfig = connectorConfig;

const listScenariosRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListScenarios');
}
listScenariosRef.operationName = 'ListScenarios';
exports.listScenariosRef = listScenariosRef;

exports.listScenarios = function listScenarios(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(listScenariosRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const listScenarioVersionsRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListScenarioVersions', inputVars);
}
listScenarioVersionsRef.operationName = 'ListScenarioVersions';
exports.listScenarioVersionsRef = listScenarioVersionsRef;

exports.listScenarioVersions = function listScenarioVersions(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(listScenarioVersionsRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const getScenarioVersionOverviewRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetScenarioVersionOverview', inputVars);
}
getScenarioVersionOverviewRef.operationName = 'GetScenarioVersionOverview';
exports.getScenarioVersionOverviewRef = getScenarioVersionOverviewRef;

exports.getScenarioVersionOverview = function getScenarioVersionOverview(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(getScenarioVersionOverviewRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;
