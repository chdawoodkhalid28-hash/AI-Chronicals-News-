import { Buffer } from "node:buffer";

export const MAX_RECORD_BYTES = 3_000_000;
export const ALLOWED_DECISIONS = new Set([
  "PENDING_ADMIN_REVIEW",
  "APPROVED_BY_ADMIN — NOT PUBLISHED",
  "REVISION_REQUIRED"
]);

export function isValidId(value) {
  return typeof value === "string" && /^run-[A-Za-z0-9_-]{1,100}$/.test(value);
}

export function validateItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item) || !isValidId(item.id)) return false;
  if (!item.payload || typeof item.payload !== "object" || Array.isArray(item.payload)) return false;
  if (!item.payload.buland || typeof item.payload.buland !== "object" || Array.isArray(item.payload.buland)) return false;
  if (!item.payload.executionSummary || typeof item.payload.executionSummary !== "object" || Array.isArray(item.payload.executionSummary)) return false;
  const teams = item.payload.departmentTeams;
  if (!teams || typeof teams !== "object") return false;
  return true;
}

export function sanitizeItem(item) {
  const payload = JSON.parse(JSON.stringify(item.payload));
  payload.executionSummary.publication = "DISABLED";
  payload.executionSummary.editorialStatus = "PENDING_ADMIN_APPROVAL";
  const safeItem = {
    id: item.id,
    savedAt: typeof item.savedAt === "string" ? item.savedAt.slice(0, 64) : new Date().toISOString(),
    instruction: String(item.instruction || "").slice(0, 2000),
    completedDepartments: Math.max(0, Math.min(26, Number(item.completedDepartments) || 0)),
    decision: ALLOWED_DECISIONS.has(item.decision) ? item.decision : "PENDING_ADMIN_REVIEW",
    payload
  };
  if (Buffer.byteLength(JSON.stringify(safeItem), "utf8") > MAX_RECORD_BYTES) {
    const error = new Error("Queue record is too large");
    error.statusCode = 413;
    throw error;
  }
  return safeItem;
}
