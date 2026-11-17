import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const files = [
  "admin.html",
  "connectors.html",
  "graphics/department-templateflyers.html",
  "graphics/ready-made-flyer-library.html",
  "graphics/broadcast-vfx-template-suite.html",
  "graphics/drafts/newsroom-layout-final-review.html",
  "graphics/drafts/departmental-templates-final-review.html",
  "graphics/drafts/breaking-news-final-review.html"
];
const pages = Object.fromEntries(await Promise.all(files.map(async path => [
  path,
  await readFile(new URL(path, root), "utf8")
])));

test("Admin dashboard links to all operational and graphics workspaces", () => {
  const admin = pages["admin.html"];
  for (const href of [
    "/admin-news.html",
    "/connectors.html",
    "/graphics/department-templateflyers.html",
    "/graphics/drafts/newsroom-layout-final-review.html",
    "/graphics/drafts/departmental-templates-final-review.html",
    "/graphics/drafts/breaking-news-final-review.html",
    "/graphics/broadcast-vfx-template-suite.html"
  ]) assert.ok(admin.includes('href="' + href + '"'), "missing Admin destination: " + href);
});

test("connector page is protected by the admin middleware route", async () => {
  const middleware = await readFile(new URL("../middleware.js", root), "utf8");
  assert.match(middleware, /matcher:\s*\["\/connectors\.html"\]/);
  assert.match(middleware, /acn_admin_access/);
  assert.match(middleware, /ADMIN_PASSWORD/);
  assert.match(middleware, /Response\.redirect/);
  assert.ok(pages["connectors.html"].includes('id="connectors"'));
  assert.ok(pages["connectors.html"].includes('id="tools"'));
  assert.ok(pages["connectors.html"].includes('id="workflow"'));
  assert.ok(pages["connectors.html"].includes('id="security"'));
});

test("all operational and graphics pages declare mobile viewport and unique IDs", () => {
  for (const [path, html] of Object.entries(pages)) {
    assert.match(html, /<meta[^>]+name=["']viewport["']/i, path + " missing viewport");
    const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, path + " contains duplicate IDs");
  }
});

test("in-page links on the connector and graphics pages resolve", () => {
  for (const path of [
    "connectors.html",
    "graphics/department-templateflyers.html",
    "graphics/ready-made-flyer-library.html",
    "graphics/broadcast-vfx-template-suite.html"
  ]) {
    const html = pages[path];
    const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]));
    const targets = [...html.matchAll(/href=["']#([^"']+)["']/g)].map(match => match[1]);
    for (const target of targets) assert.ok(ids.has(target), path + " has broken anchor #" + target);
  }
});

test("graphics library exposes all ten department master flyers and reusable assets", () => {
  const flyers = pages["graphics/department-templateflyers.html"];
  assert.equal((flyers.match(/class="dept"/g) || []).length, 10);
  assert.equal((flyers.match(/class="editorial-photo"/g) || []).length, 10);
  assert.equal((flyers.match(/class="photo-credit"/g) || []).length, 10);
  assert.ok(flyers.includes('href="/graphics/ready-made-flyer-library.html"'));
  assert.ok(flyers.includes('id="print-flyers"'));
});
