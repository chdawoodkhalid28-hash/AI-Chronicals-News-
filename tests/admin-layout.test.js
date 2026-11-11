import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../admin.html", import.meta.url), "utf8");

test("newsroom navigation exposes all five operating areas", () => {
  for (const id of ["dashboardPanel", "assignmentPanel", "researchPanel", "graphicsPanel", "queuePanel"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing section: ${id}`);
    assert.match(html, new RegExp(`href=["']#${id}["']`), `missing navigation link: ${id}`);
  }
});

test("all in-page navigation targets resolve to unique IDs", () => {
  const ids = [...html.matchAll(/\\bid=["']([^"']+)["']/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "duplicate HTML id found");
  const targets = [...html.matchAll(/href=["']#([^"']+)["']/g)].map((match) => match[1]);
  for (const target of targets) assert.ok(ids.includes(target), `broken navigation target: ${target}`);
});

test("section markup is balanced", () => {
  const tags = [...html.matchAll(/<\\/?section\\b[^>]*>/gi)];
  let depth = 0;
  for (const tag of tags) {
    if (/^<\\//.test(tag[0])) depth--;
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
  assert.match(html, /اشاعت بند ہے/);
  assert.match(html, /ایڈمن منظوری کے بغیر کوئی خبر شائع نہیں ہوگی/);
});
