import { runFreeNewsroomAutopilot } from "./free-newsroom-autopilot.js";

const SAFE_REPAIRS = new Set([
  "retryTransientJob",
  "cleanGeneratedTemporaryArtifacts",
  "quarantineMalformedQueueItem",
  "createDiagnosticReport"
]);

export function classifyFailure(error) {
  const message = String(error?.message || error || "").toLowerCase();
  if (/timeout|temporar|rate limit|network|econnreset|503|502/.test(message)) return "transient";
  if (/invalid|schema|parse|malformed|syntax/.test(message)) return "bad_input";
  if (/unauthor|forbidden|401|403|permission/.test(message)) return "permission";
  return "unknown";
}

export function planSafeRecovery(failureType, attempt = 0, maxRetries = 2) {
  if (failureType === "transient" && attempt < maxRetries) {
    return { action: "retryTransientJob", retry: true, attempt: attempt + 1, bounded: true };
  }
  if (failureType === "bad_input") {
    return { action: "quarantineMalformedQueueItem", retry: false, bounded: true };
  }
  return { action: "createDiagnosticReport", retry: false, bounded: true };
}

export function validateRepairAction(action) {
  if (!SAFE_REPAIRS.has(action)) throw new Error("Repair action blocked by safety policy");
  return true;
}

export function buildNewsroomOperationsReport({ testExitCode = 0, errors = [] } = {}) {
  const readiness = runFreeNewsroomAutopilot();
  const incidents = errors.map(error => {
    const type = classifyFailure(error);
    const recovery = planSafeRecovery(type);
    validateRepairAction(recovery.action);
    return { message: String(error), failureType: type, recovery, repairedAutomatically: false };
  });
  return {
    generatedAt: new Date().toISOString(),
    newsroom: readiness,
    watchdog: { testsPass: testExitCode === 0, errorCount: errors.length, incidents },
    selfHealing: {
      enabled: true,
      safeActionsOnly: true,
      boundedRetries: 2,
      autoSourceCodeModification: false,
      secretsOrPermissionsModification: false,
      publishingDuringRepair: false
    },
    overall: testExitCode === 0 && errors.length === 0 ? "READY_FOR_REVIEW" : "NEEDS_ATTENTION"
  };
}
