// Minimal D1 shim over node:sqlite so drizzle-orm/d1 runs real SQL in tests.
import { DatabaseSync } from "node:sqlite";
export function d1Sqlite(setupSql = "") {
  const sqlite = new DatabaseSync(":memory:");
  if (setupSql) sqlite.exec(setupSql);
  const norm = (values) => values.map((v) => (typeof v === "boolean" ? Number(v) : v === undefined ? null : v));
  const prepared = (sql) => {
    let params = [];
    const api = {
      bind(...values) { params = norm(values); return api; },
      async all() { const s = sqlite.prepare(sql); return { results: s.all(...params), success: true, meta: {} }; },
      async raw() { const s = sqlite.prepare(sql); s.setReturnArrays?.(true); return s.all(...params).map((row) => Array.isArray(row) ? row : Object.values(row)); },
      async run() { const s = sqlite.prepare(sql); if (/\breturning\b/i.test(sql)) return { results: s.all(...params), success: true, meta: {} }; const info = s.run(...params); return { success: true, meta: { changes: info.changes } }; },
      async first() { const s = sqlite.prepare(sql); return s.get(...params) ?? null; },
    };
    return api;
  };
  return { sqlite, d1: { prepare: prepared, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; }, async exec(sql) { sqlite.exec(sql); } } };
}
