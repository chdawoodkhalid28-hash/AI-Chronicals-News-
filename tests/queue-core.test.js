import test from "node:test";
import assert from "node:assert/strict";
import { ALLOWED_DECISIONS, isValidId, sanitizeItem, validateItem } from "../api/admin/queue-core.js";

function validItem() {
  return {
    id: "run-12345",
    instruction: "Daily news briefing",
    completedDepartments: 26,
    decision: "PENDING_ADMIN_REVIEW",
    payload: {
      buland: { instruction: "Research and prepare" },
      executionSummary: { publication: "ENABLED", editorialStatus: "APPROVED" },
      departmentTeams: {}
    }
  };
}

test("accepts only safe queue record IDs", () => {
  assert.equal(isValidId("run-12345"), true);
  assert.equal(isValidId("../run-1"), false);
  assert.equal(isValidId("approval-1"), false);
});

test("validates expected newsroom payload structure", () => {
  assert.equal(validateItem(validItem()), true);
  assert.equal(validateItem({ ...validItem(), payload: [] }), false);
  assert.equal(validateItem({ ...validItem(), payload: { buland: {}, executionSummary: "bad", departmentTeams: {} } }), false);
  assert.equal(validateItem({ ...validItem(), id: "bad/id" }), false);
});

test("forces non-public editorial state without mutating caller data", () => {
  const original = validItem();
  const safe = sanitizeItem(original);
  assert.equal(safe.payload.executionSummary.publication, "DISABLED");
  assert.equal(safe.payload.executionSummary.editorialStatus, "PENDING_ADMIN_APPROVAL");
  assert.equal(original.payload.executionSummary.publication, "ENABLED");
  assert.equal(original.payload.executionSummary.editorialStatus, "APPROVED");
});

test("clamps completed departments and normalizes unknown decisions", () => {
  const item = validItem();
  item.completedDepartments = 99;
  item.decision = "PUBLISH_NOW";
  const safe = sanitizeItem(item);
  assert.equal(safe.completedDepartments, 26);
  assert.equal(safe.decision, "PENDING_ADMIN_REVIEW");
  assert.equal(ALLOWED_DECISIONS.has("APPROVED_BY_ADMIN — NOT PUBLISHED"), true);
});
