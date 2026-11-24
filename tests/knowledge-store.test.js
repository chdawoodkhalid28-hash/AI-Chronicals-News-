import test from "node:test";
import assert from "node:assert/strict";
import { createKnowledgeStore, scoreKnowledgeRecords, tokenizeKnowledge } from "../lib/knowledge-store.js";

test("knowledge tokenizer preserves English and Urdu terms", () => {
  assert.deepEqual(tokenizeKnowledge("Pakistan زراعت climate 2026"), ["pakistan", "زراعت", "climate", "2026"]);
});

test("knowledge scoring returns approved knowledge only", () => {
  const records = [
    { id: "a", kind: "knowledge", status: "approved", title: "Agriculture advisory", content: "wheat crop season" },
    { id: "b", kind: "knowledge", status: "draft", title: "Agriculture draft", content: "wheat" },
    { id: "c", kind: "evaluation", status: "approved", title: "Agriculture score", content: "wheat" }
  ];
  const matches = scoreKnowledgeRecords(records, "wheat agriculture", 5);
  assert.deepEqual(matches.map(item => item.id), ["a"]);
});

test("knowledge store writes private Supabase records and searches approved department plus global memory", async () => {
  const records = new Map();
  const writes = [];
  const store = createKnowledgeStore({
    insertRecord: async record => {
      writes.push(record);
      records.set(record.id, record);
      return [record];
    },
    listRecords: async query => {
      assert.match(query, /department=in/);
      return [...records.values()];
    }
  });

  const global = await store.save({
    department: "global",
    title: "Editorial safety",
    content: "Never publish before Admin approval. Verify evidence and protect source privacy.",
    status: "approved",
    tags: ["editorial", "approval"]
  });
  const local = await store.save({
    department: "agriculture_desk",
    title: "Wheat advisory",
    content: "For wheat crop reporting, verify crop season, district and official advisory units.",
    status: "approved"
  });
  await store.save({
    department: "agriculture_desk",
    title: "Draft note",
    content: "Draft wheat note not yet approved.",
    status: "draft"
  });
  await store.save({
    department: "agriculture_desk",
    title: "Evaluation score",
    content: "Test passed.",
    kind: "evaluation",
    status: "approved"
  });

  assert.equal(writes.length, 4);
  assert.ok(writes.every(record => record.id && record.department));
  assert.equal(global.department, "global");
  assert.equal(local.department, "agriculture_desk");

  const matches = await store.search({ department: "agriculture_desk", query: "wheat district advisory approval", limit: 5 });
  assert.ok(matches.some(item => item.id === local.id));
  assert.ok(matches.some(item => item.id === global.id));
  assert.ok(matches.every(item => item.status === undefined));
  assert.ok(matches.every(item => item.kind === undefined));
});

test("knowledge store rejects non-HTTPS sources and invalid departments", async () => {
  const store = createKnowledgeStore({ insertRecord: async () => { throw new Error("must not write"); } });
  await assert.rejects(
    store.save({ department: "newsroom", title: "Bad source", content: "Some content", sourceUrl: "http://example.com" }),
    /HTTPS/
  );
  await assert.rejects(
    store.save({ department: "unknown", title: "Bad desk", content: "Some content" }),
    /Unknown department/
  );
});
