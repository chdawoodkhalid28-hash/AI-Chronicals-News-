import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../admin.html", import.meta.url), "utf8");

test("newsroom navigation exposes all five operating areas", () => {
  for (const id of ["dashboardPanel", "assignmentPanel", "researchPanel", "graphicsPanel", "queuePanel"]) {
    assert.ok(html.includes('id="' + id + '"'), "missing section: " + id);
    assert.ok(html.includes('href="#' + id + '"'), "missing navigation link: " + id);
  }
});

test("all in-page navigation targets resolve to unique IDs", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "duplicate HTML id found");
  const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
  for (const target of targets) assert.ok(ids.includes(target), "broken navigation target: " + target);
});

test("section markup is balanced", () => {
  const tags = [...html.matchAll(/<\/?section\b[^>]*>/gi)];
  let depth = 0;
  for (const tag of tags) {
    if (/^<\//.test(tag[0])) depth--;
    else depth++;
    assert.ok(depth >= 0, "unexpected closing section tag");
  }
  assert.equal(depth, 0, "unclosed section tag");
});

test("generated report is inside the research workspace", () => {
  const research = html.indexOf('id="researchPanel"');
  const report = html.indexOf('id="outputPanel"');
  const graphics = html.indexOf('id="graphicsPanel"');
  assert.ok(research >= 0 && report > research && graphics > report);
});

test("publication safety language remains visible", () => {
  assert.ok(html.includes("اشاعت بند ہے"));
  assert.ok(html.includes("ایڈمن منظوری کے بغیر کوئی خبر شائع نہیں ہوگی"));
});


test("Department Knowledge admin UI exposes all configured desks and safe draft defaults", () => {
  assert.ok(html.includes('id="knowledgePanel"'));
  assert.ok(html.includes('href="#knowledgePanel"'));
  assert.ok(html.includes('id="knowledgeDepartment"'));
  assert.ok(html.includes('id="knowledgeTitle"'));
  assert.ok(html.includes('id="knowledgeContent"'));
  assert.ok(html.includes('id="knowledgeSource"'));
  assert.ok(html.includes('id="knowledgeTags"'));
  assert.ok(html.includes('<option value="draft" selected>'));
  assert.ok(html.includes('<option value="approved">'));
  assert.ok(html.includes('id="saveKnowledge"'));
  assert.ok(html.includes('id="searchKnowledge"'));
  assert.ok(html.includes('fetch("/api/admin/knowledge"'));
  assert.ok(html.includes('action:"save"'));
  assert.ok(html.includes('action:"search"'));
  assert.ok(html.includes('createElement("a")'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(html.includes("vector embeddings نہیں"));
});

test("Knowledge department selector covers all 26 backend department keys plus Global", async () => {
  const store = await readFile(new URL("../lib/knowledge-store.js", import.meta.url), "utf8");
  const selectorStart = html.indexOf('<select id="knowledgeDepartment">');
  assert.ok(selectorStart >= 0, "Knowledge department selector missing");
  const selectorEnd = html.indexOf("</select>", selectorStart);
  const selector = html.slice(selectorStart, selectorEnd);
  const uiKeys = [...selector.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);
  const backendStart = store.indexOf("const DEPARTMENT_KEYS = new Set([");
  assert.ok(backendStart >= 0, "backend department registry missing");
  const backendEnd = store.indexOf("]);", backendStart);
  const backendBlock = store.slice(backendStart, backendEnd);
  const backendKeys = [...backendBlock.matchAll(/"([a-z_]+)"/g)].map(match => match[1]);
  assert.equal(uiKeys.length, 27, "selector must include Global plus 26 desks");
  assert.equal(new Set(uiKeys).size, uiKeys.length, "duplicate department option");
  assert.deepEqual(uiKeys.filter(key => key !== "global").sort(), backendKeys.sort());
});
