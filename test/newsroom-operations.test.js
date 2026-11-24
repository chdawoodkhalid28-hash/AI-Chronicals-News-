import test from "node:test";
import assert from "node:assert/strict";
import { classifyFailure, planSafeRecovery, validateRepairAction, buildNewsroomOperationsReport } from "../lib/newsroom-operations.js";

test("classifies common failure types", () => {
 assert.equal(classifyFailure("network timeout 503"), "transient");
 assert.equal(classifyFailure("malformed JSON schema"), "bad_input");
 assert.equal(classifyFailure("permission denied 403"), "permission");
 assert.equal(classifyFailure("unexpected"), "unknown");
});
test("retry is bounded", () => {
 assert.deepEqual(planSafeRecovery("transient",0,2), {action:"retryTransientJob",retry:true,attempt:1,bounded:true});
 assert.equal(planSafeRecovery("transient",2,2).retry,false);
});
test("unsafe repairs are rejected", () => {
 assert.throws(()=>validateRepairAction("publishNews"),/blocked/);
 assert.throws(()=>validateRepairAction("modifySourceCodeAutomatically"),/blocked/);
 assert.equal(validateRepairAction("createDiagnosticReport"),true);
});
test("report remains non-publishing and admin gated", () => {
 const report=buildNewsroomOperationsReport({errors:["timeout"]});
 assert.equal(report.newsroom.checks.publishingEnabled,false);
 assert.equal(report.newsroom.checks.adminApprovalRequired,true);
 assert.equal(report.selfHealing.autoSourceCodeModification,false);
 assert.equal(report.watchdog.incidents[0].recovery.action,"retryTransientJob");
});
