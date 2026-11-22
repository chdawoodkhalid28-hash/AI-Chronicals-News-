import test from "node:test";
import assert from "node:assert/strict";
import { createDepartmentTrainingPlan, getFreeNewsroomPolicy, runFreeNewsroomAutopilot } from "../lib/free-newsroom-autopilot.js";
import curriculum from "../training/free-newsroom-curriculum.json" with { type: "json" };

test("newsroom-only curriculum contains exactly 26 unique directors", () => {
  assert.equal(curriculum.directors.length, 26);
  assert.equal(new Set(curriculum.directors).size, 26);
});

test("free-first policy blocks paid AI, auto-publishing and video generation", () => {
  const policy = getFreeNewsroomPolicy();
  assert.equal(policy.externalModelCallsEnabled, false);
  assert.equal(policy.paidApisEnabled, false);
  assert.equal(policy.publishingEnabled, false);
  assert.equal(policy.videoGenerationEnabled, false);
  assert.equal(policy.adminApprovalRequired, true);
});

test("every director receives the same auditable training curriculum", () => {
  for (const director of curriculum.directors) {
    const plan = createDepartmentTrainingPlan(director);
    assert.equal(plan.department, director);
    assert.equal(plan.modules.length, curriculum.modules.length);
    assert.equal(plan.publication, "DISABLED");
    assert.equal(plan.outputState, "TRAINING_ONLY");
  }
});

test("unknown departments are rejected", () => {
  assert.throws(() => createDepartmentTrainingPlan("AI Workforce Enterprise"), /Unknown/);
});

test("autopilot produces a non-publishing report and never executes paid calls", () => {
  const report = runFreeNewsroomAutopilot({ env: { OPENAI_API_KEY: "placeholder" } });
  assert.equal(report.departments.length, 26);
  assert.equal(report.checks.paidApiCallsExecuted, false);
  assert.equal(report.checks.externalModelCallsExecuted, false);
  assert.equal(report.checks.publishingEnabled, false);
  assert.deepEqual(report.checks.paidCredentialNamesDetected, ["OPENAI_API_KEY"]);
});
