import assert from "node:assert/strict";
import test from "node:test";
import { parseEtaTimeFromBody, serializeAssignmentEtaTime } from "../../src/utils/etaTime";

test("parseEtaTimeFromBody converts offset ISO to UTC instant", () => {
  const parsed = parseEtaTimeFromBody("2026-05-18T19:30:00+09:00");
  assert.ok(parsed instanceof Date);
  assert.equal(parsed!.toISOString(), "2026-05-18T10:30:00.000Z");
});

test("parseEtaTimeFromBody accepts UTC ISO", () => {
  const parsed = parseEtaTimeFromBody("2026-05-18T10:30:00.000Z");
  assert.equal(parsed!.toISOString(), "2026-05-18T10:30:00.000Z");
});

test("serializeAssignmentEtaTime returns UTC ISO for clients", () => {
  const parsed = parseEtaTimeFromBody("2026-05-18T19:30:00+09:00");
  assert.equal(serializeAssignmentEtaTime(parsed), "2026-05-18T10:30:00.000Z");
});
