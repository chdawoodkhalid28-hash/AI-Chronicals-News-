import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("front desk lists all 26 configured director roles exactly once", () => {
  const expected = [
    "Director Newsroom / Editor-in-Chief","Director Assignment Desk","Director Pakistan","Director Provincial & Local",
    "Director Politics","Director World","Director Crime & Public Safety","Director Courts & Legal Affairs",
    "Director Business & Economy","Director Finance & Markets","Director Sports","Director Technology & AI",
    "Director Science & Health","Director Climate & Environment","Director Education","Director Agriculture & Rural Affairs",
    "Director Research","Director Open-Source Verification","Director Fact-Check","Director Urdu & English",
    "Director Copy Editing","Director Photo & Visuals","Director Audience & Social Media","Director SEO & Distribution",
    "Director Ethics & Standards","Director Security & Privacy"
  ];
  const cards = [...html.matchAll(/<article class="director-card"[^>]*>[\s\S]*?<h3>([\s\S]*?)<\/h3>/g)]
    .map(match => match[1].replace(/&amp;/g, "&").trim());
  assert.equal(cards.length, 26, "front desk must contain exactly 26 director cards");
  assert.deepEqual(cards, expected);
});

test("front desk exposes the 4 + 12 + 10 newsroom organization", () => {
  for (const marker of ["4 DIRECTORS", "12 DIRECTORS", "10 DIRECTORS", "01–04 · 4 UNITS", "05–16 · 12 UNITS", "17–26 · 10 UNITS"]) {
    assert.ok(html.includes(marker), "missing organization group: " + marker);
  }
  assert.equal((html.match(/class="desk-card"/g) || []).length, 10, "must show 10 core editorial desks");
});

test("front desk includes all six editorial workflow gates and admin control", () => {
  for (const marker of ["Search & Research", "Storyline", "Fact-check", "Graphics & Visuals", "Presentation & SEO", "Admin Approval", "PASS ≠ PUBLISH", "PUBLISHING DISABLED"]) {
    assert.ok(html.includes(marker), "missing workflow/safety marker: " + marker);
  }
});

test("director search, admin route and graphics libraries are wired", () => {
  for (const marker of ['id="directorSearch"', 'id="directorCount"', 'href="/admin.html"', 'href="/graphics/department-templateflyers.html"', 'href="/graphics/ready-made-flyer-library.html"']) {
    assert.ok(html.includes(marker), "missing front desk control/link: " + marker);
  }
});

test("all in-page navigation targets resolve to unique IDs", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "duplicate HTML id found");
  const targets = [...html.matchAll(/href="#([^"]+)"/g)].map(match => match[1]);
  for (const target of targets) assert.ok(ids.includes(target), "broken navigation target: " + target);
});
