import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, routingText, departmentSource, admin] = await Promise.all([
  readFile(new URL("../graphics/department-templateflyers.html", import.meta.url), "utf8"),
  readFile(new URL("../graphics/templateflyer-routing.json", import.meta.url), "utf8"),
  readFile(new URL("../api/admin/department-team.js", import.meta.url), "utf8"),
  readFile(new URL("../admin.html", import.meta.url), "utf8")
]);
const routing = JSON.parse(routingText);
const departmentBody = departmentSource.match(/const DEPARTMENTS = \{([\s\S]*?)\n\};/)?.[1] || "";
const authoritativeDirectors = [...departmentBody.matchAll(/^\s*[a-z0-9_]+:\s*"([^"]+)"/gm)].map(match => match[1]);
const flyerTitles = [...html.matchAll(/<div class="num">MASTER FLYER \d+<\/div><h2>([^<]+)<\/h2>/g)].map(match => match[1]);

test("exactly ten named master flyers match the routing masters", () => {
  assert.equal((html.match(/class="dept"/g) || []).length, 10);
  assert.deepEqual(flyerTitles, routing.masters);
  assert.equal(new Set(flyerTitles).size, 10);
});

test("all 26 routing directors match the authoritative department API roster", () => {
  const routedNames = routing.directors.map(item => item.director);
  assert.equal(routedNames.length, 26);
  assert.equal(new Set(routedNames).size, 26);
  assert.deepEqual([...routedNames].sort(), [...authoritativeDirectors].sort());
  assert.ok(routing.directors.every(item => typeof item.template === "string" && item.template.trim()));
});

test("each master flyer has a credited reference image and rights links", () => {
  assert.equal((html.match(/class="editorial-photo"/g) || []).length, 10);
  assert.equal((html.match(/class="photo-credit"/g) || []).length, 10);
  assert.ok((html.match(/class="license"/g) || []).length >= 10);
  assert.ok((html.match(/https:\/\/commons\.wikimedia\.org\/wiki\/File:/g) || []).length >= 10);
});

test("flyer copy is editable and includes all required output formats", () => {
  assert.ok((html.match(/contenteditable="true"/g) || []).length >= 40);
  for (const ratio of ["16:9", "1:1", "9:16"]) {
    assert.ok((html.match(new RegExp(ratio.replace(":", "\\:"), "g")) || []).length >= 10, "missing repeated format guidance: " + ratio);
  }
  assert.match(html, /VERIFIED • SOURCED • REVIEWED/);
});

test("print and responsive layout controls are present", () => {
  assert.match(html, /onclick="window\.print\(\)"/);
  assert.match(html, /@media\(max-width:820px\)/);
  assert.match(html, /@media\(max-width:480px\)/);
});

test("Admin Graphics workspace links directly to the ten master flyers", () => {
  assert.match(admin, /href="\/graphics\/department-templateflyers\.html"/);
});

test("the old incorrect downstream count is absent", () => {
  assert.ok(!html.includes("16 DOWNSTREAM AGENTS REUSE"));
  assert.ok(html.includes("26 DIRECTOR WORKFLOWS ROUTED"));
});
