// Every paged field must use the same explicit limit/offset and a stable order.
// Recent activity feeds may stay bounded; they are not included in `fields`.
export async function readAllPages(reader, operation, variables, fields, pageSize = 100) {
  const result = {};
  for (let page = 0; page < 1000; page += 1) {
    const data = await reader(operation, {...variables, pageLimit: pageSize, pageOffset: page * pageSize});
    if (page === 0) Object.assign(result, data);
    let more = false;
    for (const field of fields) {
      const rows = data?.[field] ?? [];
      if (!Array.isArray(rows)) throw new Error(`INVALID_PAGE:${field}`);
      if (page === 0) result[field] = [];
      result[field].push(...rows);
      if (rows.length === pageSize) more = true;
    }
    if (!more) return result;
  }
  // Never return a plausible but incomplete tally if the data source misbehaves.
  throw new Error('PAGINATION_LIMIT_EXCEEDED');
}
