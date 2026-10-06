import test from "node:test";
import assert from "node:assert/strict";
import { formatAdminDate, formatAdminDateTime, formatAdminUtcClock } from "../app/lib/adminDateTime.ts";

test("TOP converte instantes em viradas de dia para Brasília", () => {
  assert.match(formatAdminDateTime("2026-10-06T02:30:00Z"), /^05\/10\/2026,? 23:30 \(Brasília\)$/);
  assert.match(formatAdminDateTime("2026-10-06T03:00:00Z"), /^06\/10\/2026,? 00:00 \(Brasília\)$/);
  assert.equal(formatAdminDate("2026-10-06T02:30:00Z"), "05/10/2026 (Brasília)");
});

test("CURRENT_TIMESTAMP do SQLite é UTC; Z e offset explícito preservam o mesmo instante", () => {
  const expected = formatAdminDateTime("2026-10-06T02:30:00Z");
  assert.equal(formatAdminDateTime("2026-10-06 02:30:00"), expected);
  assert.equal(formatAdminDateTime("2026-10-06T02:30:00"), expected);
  assert.equal(formatAdminDateTime("2026-10-05T23:30:00-03:00"), expected);
  assert.equal(formatAdminDateTime("2026-10-06 04:30:00+02:00"), expected);
  assert.equal(formatAdminDate("2026-10-06 02:30:00"), "05/10/2026 (Brasília)");
  assert.equal(formatAdminDateTime("2026-10-06 02:30:00.500"), formatAdminDateTime("2026-10-06T02:30:00.500Z"));
});

test("TOP respeita a transição histórica do horário de verão", () => {
  assert.match(formatAdminDateTime("2018-11-04T02:59:00Z"), /^03\/11\/2018,? 23:59 \(Brasília\)$/);
  assert.match(formatAdminDateTime("2018-11-04T03:00:00Z"), /^04\/11\/2018,? 01:00 \(Brasília\)$/);
  assert.equal(formatAdminDateTime("2018-11-04 03:00:00"), formatAdminDateTime("2018-11-04T03:00:00Z"));
  assert.match(formatAdminDateTime("2019-02-17T01:59:00Z"), /^16\/02\/2019,? 23:59 \(Brasília\)$/);
  assert.match(formatAdminDateTime("2019-02-17T02:00:00Z"), /^16\/02\/2019,? 23:00 \(Brasília\)$/);
  assert.equal(formatAdminUtcClock("00:00", new Date("2018-11-05T12:00:00Z")), "22:00 (Brasília)");
  assert.equal(formatAdminUtcClock("00:00", new Date("2026-10-06T12:00:00Z")), "21:00 (Brasília)");
});

test("TOP apresenta fallback para valores vazios, inválidos e relógio UTC incorreto", () => {
  assert.equal(formatAdminDateTime(null), "—");
  assert.equal(formatAdminDateTime("inválida", "Nunca"), "Nunca");
  assert.equal(formatAdminDateTime(""), "—");
  assert.equal(formatAdminDateTime("2026-02-30 12:00:00"), "—");
  assert.equal(formatAdminDateTime("2026-10-06 25:00:00"), "—");
  assert.equal(formatAdminDate(new Date(Number.NaN)), "—");
  assert.equal(formatAdminUtcClock("25:99"), "—");
});
