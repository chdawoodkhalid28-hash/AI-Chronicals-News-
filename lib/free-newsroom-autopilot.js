import curriculum from "../training/free-newsroom-curriculum.json" with { type: "json" };

const PAID_OR_EXTERNAL_EXECUTION_KEYS = /OPENAI_API_KEY|GEMINI_API_KEY|ANTHROPIC_API_KEY|AI_GATEWAY_API_KEY/i;

export function getFreeNewsroomPolicy() {
  return Object.freeze({
    project: curriculum.project,
    mode: curriculum.executionPolicy.defaultMode,
    externalModelCallsEnabled: false,
    paidApisEnabled: false,
    publishingEnabled: false,
    videoGenerationEnabled: false,
    adminApprovalRequired: true,
    maxDepartmentsPerRun: curriculum.executionPolicy.maxDepartmentsPerRun
  });
}

export function createDepartmentTrainingPlan(department) {
  const name = String(department || "").trim();
  if (!curriculum.directors.includes(name)) {
    throw new Error("Unknown AI Chronicals News department");
  }
  return {
    project: curriculum.project,
    department: name,
    mode: "free_static_training",
    modules: curriculum.modules.map(module => ({
      id: module.id,
      title: module.title,
      exercise: module.exercise,
      passCriteria: module.pass
    })),
    outputState: "TRAINING_ONLY",
    publication: "DISABLED",
    adminApprovalRequired: true
  };
}

export function runFreeNewsroomAutopilot({ env = process.env } = {}) {
  const paidKeysPresent = Object.keys(env).filter(key => PAID_OR_EXTERNAL_EXECUTION_KEYS.test(key));
  return {
    generatedAt: new Date().toISOString(),
    project: curriculum.project,
    scope: "newsroom_only",
    departments: curriculum.directors.map(name => ({
      name,
      trainingModules: curriculum.modules.length,
      state: "TRAINING_PLAN_READY"
    })),
    checks: {
      all26DepartmentsIncluded: curriculum.directors.length === 26,
      noDuplicateDepartments: new Set(curriculum.directors).size === 26,
      paidApiCallsExecuted: false,
      externalModelCallsExecuted: false,
      paidCredentialNamesDetected: paidKeysPresent,
      publishingEnabled: false,
      videoGenerationEnabled: false,
      adminApprovalRequired: true
    },
    nextGate: "Admin must review and approve every news item; training automation does not publish."
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const report = runFreeNewsroomAutopilot();
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.checks.all26DepartmentsIncluded || !report.checks.noDuplicateDepartments) process.exitCode = 1;
}
