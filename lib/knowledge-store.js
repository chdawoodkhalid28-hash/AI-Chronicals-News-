import { randomUUID } from "node:crypto";
import { supabaseRequest } from "./supabase-rest.js";

const MAX_RECORD_BYTES = 20000;
const DEPARTMENT_KEYS = new Set([
  "newsroom", "assignment_desk", "pakistan_desk", "provincial_local_desk",
  "politics_desk", "world_desk", "crime_desk", "courts_legal_desk",
  "business_economy_desk", "finance_markets_desk", "sports_desk",
  "technology_ai_desk", "science_health_desk", "climate_environment_desk",
  "education_desk", "agriculture_desk", "research_desk",
  "open_source_verification_desk", "fact_check_desk", "urdu_english_desk",
  "copy_editing_desk", "photo_visuals_desk", "audience_social_desk",
  "seo_distribution_desk", "ethics_standards_desk", "security_privacy_desk"
]);

export function tokenizeKnowledge(value) {
  return String(value || "").toLocaleLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]{2,}/gu) || [];
}

export function scoreKnowledgeRecords(records, query, limit = 5) {
  const queryTokens = [...new Set(tokenizeKnowledge(query))];
  if (!queryTokens.length) return [];
  return records
    .filter(record => record && record.kind === "knowledge" && record.status === "approved")
    .map(record => {
      const searchable = tokenizeKnowledge([record.title, record.content, ...(record.tags || [])].join(" "));
      const counts = new Map();
      for (const token of searchable) counts.set(token, (counts.get(token) || 0) + 1);
      const matched = queryTokens.filter(token => counts.has(token));
      const score = matched.reduce((total, token) => total + Math.min(counts.get(token), 4), 0);
      return { record, score, matchedTerms: matched };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || String(b.record.createdAt).localeCompare(String(a.record.createdAt)))
    .slice(0, Math.max(1, Math.min(Number(limit) || 5, 10)))
    .map(item => ({ ...item.record, score: item.score, matchedTerms: item.matchedTerms }));
}

export function createKnowledgeStore(deps = {}) {
  const insertRecord = deps.insertRecord || (record => supabaseRequest("department_knowledge", { method: "POST", body: record }));
  const listRecords = deps.listRecords || (query => supabaseRequest("department_knowledge", { query }));

  async function save({ department, title, content, sourceUrl = "", status = "draft", kind = "knowledge", tags = [] }) {
    if (department !== "global" && !DEPARTMENT_KEYS.has(department)) throw new Error("Unknown department");
    if (!["knowledge", "evaluation"].includes(kind)) throw new Error("Unsupported record kind");
    if (!["draft", "approved"].includes(status)) throw new Error("Invalid record status");
    if (typeof title !== "string" || !title.trim() || title.length > 240) throw new Error("Title must contain 1 to 240 characters");
    if (typeof content !== "string" || !content.trim() || Buffer.byteLength(content, "utf8") > MAX_RECORD_BYTES) {
      throw new Error("Content must contain 1 to 20000 UTF-8 bytes");
    }
    if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) throw new Error("Source URL must use HTTPS");
    const safeTags = Array.isArray(tags) ? tags.filter(tag => typeof tag === "string").slice(0, 12).map(tag => tag.slice(0, 60)) : [];
    const record = {
      id: randomUUID(),
      department,
      kind,
      title: title.trim(),
      content: content.trim(),
      source_url: sourceUrl || "",
      tags: safeTags,
      status,
      created_at: new Date().toISOString()
    };
    if (Buffer.byteLength(JSON.stringify(record), "utf8") > MAX_RECORD_BYTES + 1000) {
      throw new Error("Knowledge record is too large");
    }
    const inserted = await insertRecord(record);
    const saved = Array.isArray(inserted) ? inserted[0] : inserted;
    if (!saved || !saved.id) throw new Error("Supabase did not confirm the knowledge record insert");
    return { id: saved.id, department, kind, status, title: record.title };
  }

  async function search({ department, query, limit = 5 }) {
    if (department !== "global" && !DEPARTMENT_KEYS.has(department)) throw new Error("Unknown department");
    if (typeof query !== "string" || query.trim().length < 2) return [];
    const scope = department === "global" ? ["global"] : ["global", department];
    const params = new URLSearchParams({
      select: "id,department,kind,title,content,source_url,tags,status,created_at",
      department: "in.(" + scope.join(",") + ")",
      order: "created_at.desc",
      limit: "200"
    });
    const rows = await listRecords(params.toString());
    const records = (Array.isArray(rows) ? rows : []).map(row => ({
      id: row.id,
      department: row.department,
      kind: row.kind,
      title: row.title,
      content: row.content,
      sourceUrl: row.source_url || "",
      tags: Array.isArray(row.tags) ? row.tags : [],
      status: row.status,
      createdAt: row.created_at
    }));
    return scoreKnowledgeRecords(records, query, limit).map(record => ({
      id: record.id,
      department: record.department,
      title: record.title,
      content: record.content.slice(0, 3000),
      sourceUrl: record.sourceUrl,
      tags: record.tags,
      createdAt: record.createdAt,
      score: record.score,
      matchedTerms: record.matchedTerms
    }));
  }

  return { save, search };
}

export const knowledgeStore = createKnowledgeStore();
