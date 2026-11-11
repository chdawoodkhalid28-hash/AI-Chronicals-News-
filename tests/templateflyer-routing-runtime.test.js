import test from "node:test";
import assert from "node:assert/strict";
import { resolveTemplate } from "../api/admin/templateflyer-routing.js";

const expected = [
  ["Newsroom / Editor-in-Chief", null],
  ["Assignment Desk", null],
  ["Pakistan", null],
  ["Provincial & Local", null],
  ["Politics", "Politics & Government"],
  ["World", "World & Foreign Affairs"],
  ["Crime & Public Safety", "Crime & Public Safety"],
  ["Courts & Legal Affairs", "Courts & Judiciary"],
  ["Business & Economy", "Business & Economy"],
  ["Finance & Markets", "Business & Economy"],
  ["Sports", "Sports"],
  ["Technology & AI", "Health & Science"],
  ["Science & Health", "Health & Science"],
  ["Climate & Environment", "Weather & Disasters"],
  ["Education", "Education"],
  ["Agriculture & Rural Affairs", "Business & Economy"],
  ["Research", null],
  ["Open-Source Verification", null],
  ["Fact-Check", null],
  ["Urdu & English", null],
  ["Copy Editing", null],
  ["Photo & Visuals", null],
  ["Audience & Social Media", null],
  ["SEO & Distribution", null],
  ["Ethics & Standards", null],
  ["Security & Privacy", null]
];

test("all 26 director workflows resolve to an approved master or explicitly require a story beat", async () => {
  for (const [director, template] of expected) {
    const result = await resolveTemplate(director, template ? "" : "politics");
    assert.equal(result.status, "ROUTED", director + " should route");
    assert.ok(["Politics & Government","Courts & Judiciary","Crime & Public Safety","Business & Economy","Weather & Disasters","Health & Science","Education","Sports","Entertainment & Culture","World & Foreign Affairs"].includes(result.template));
    if (template) assert.equal(result.template, template, director);
  }
});

test("dynamic departments hold when no story beat is supplied", async () => {
  const result = await resolveTemplate("Research");
  assert.equal(result.status, "HOLD");
  assert.equal(result.reason, "story_beat_required");
});

test("dynamic departments route from the story beat, not the department name", async () => {
  const result = await resolveTemplate("Research", "foreign affairs");
  assert.equal(result.status, "ROUTED");
  assert.equal(result.template, "World & Foreign Affairs");
});

test("agriculture defaults to business and routes weather-led coverage to weather master", async () => {
  assert.equal((await resolveTemplate("Agriculture & Rural Affairs")).template, "Business & Economy");
  assert.equal((await resolveTemplate("Agriculture & Rural Affairs", "weather disaster")).template, "Weather & Disasters");
});

test("unknown or unmapped assignments are held rather than guessed", async () => {
  const unknown = await resolveTemplate("Imaginary Desk", "politics");
  const unmapped = await resolveTemplate("Research", "miscellaneous");
  assert.equal(unknown.status, "HOLD");
  assert.equal(unknown.reason, "unknown_director");
  assert.equal(unmapped.status, "HOLD");
  assert.equal(unmapped.reason, "unmapped_story_beat");
});
