// GraphQL response field order is not significant; compare explicit value tuples.
export function balanceSignature(resources){
  return JSON.stringify(resources.map(r=>[r.characterExternalId,r.resourceExternalId,r.currentValue])
    .sort((a,b)=>JSON.stringify(a.slice(0,2)).localeCompare(JSON.stringify(b.slice(0,2)))));
}
