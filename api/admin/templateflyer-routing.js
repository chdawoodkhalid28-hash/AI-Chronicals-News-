import { readFile } from "node:fs/promises";

const routingUrl = new URL("../../graphics/templateflyer-routing.json", import.meta.url);

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cleanDirector(value) {
  return String(value || "").replace(/^Director\s+/i, "").trim();
}

function findBeatMaster(routing, storyBeat) {
  const beat = normalize(storyBeat);
  if (!beat) return { status: "HOLD", template: null, reason: "story_beat_required" };
  const directMaster = routing.masters.find(master => normalize(master) === beat);
  if (directMaster) return { status: "ROUTED", template: directMaster };
  const keys = Object.keys(routing.storyBeatRouting).sort((a, b) => b.length - a.length);
  const matchedKey = keys.find(key =>
    beat === key || beat.startsWith(key + "_") || beat.includes("_" + key + "_") || beat.endsWith("_" + key)
  );
  if (!matchedKey) return { status: "HOLD", template: null, reason: "unmapped_story_beat" };
  const template = routing.storyBeatRouting[matchedKey];
  if (!routing.masters.includes(template)) {
    return { status: "HOLD", template: null, reason: "invalid_story_beat_target" };
  }
  return { status: "ROUTED", template, matchedBeat: matchedKey };
}

function resolveAgriculture(routing, storyBeat) {
  const beat = normalize(storyBeat);
  const weatherLed = ["weather", "disaster", "climate_emergency"].some(key =>
    beat === key || beat.startsWith(key + "_") || beat.includes("_" + key + "_") || beat.endsWith("_" + key)
  );
  return {
    status: "ROUTED",
    template: weatherLed ? "Weather & Disasters" : "Business & Economy"
  };
}

export async function resolveTemplate(director, storyBeat = "", options = {}) {
  const routing = JSON.parse(await readFile(routingUrl, "utf8"));
  if (!Array.isArray(routing.masters) || !Array.isArray(routing.directors) ||
      !routing.storyBeatRouting || typeof routing.storyBeatRouting !== "object") {
    throw new Error("Invalid TemplateFlyer routing schema");
  }

  const cleanName = cleanDirector(director);
  const entry = routing.directors.find(item => item.director === cleanName);
  if (!entry) return { status: "HOLD", template: null, reason: "unknown_director" };

  const assignedDeskName = cleanDirector(options.assignedDesk);
  let assignedDeskEntry = null;
  if (assignedDeskName) {
    assignedDeskEntry = routing.directors.find(item => item.director === assignedDeskName);
    if (!assignedDeskEntry) {
      return { status: "HOLD", template: null, reason: "unknown_assigned_desk", director: cleanName };
    }
  }

  // A director with a fixed master cannot silently be redirected to a conflicting desk.
  const ownFixedMaster = routing.masters.includes(entry.template) ? entry.template : null;
  if (ownFixedMaster && assignedDeskEntry) {
    const assignedFixedMaster = routing.masters.includes(assignedDeskEntry.template)
      ? assignedDeskEntry.template : null;
    if (assignedFixedMaster && assignedFixedMaster !== ownFixedMaster) {
      return { status: "HOLD", template: null, reason: "assigned_desk_conflicts_with_fixed_director", director: cleanName, assignedDesk: assignedDeskName };
    }
    if (assignedFixedMaster === ownFixedMaster) {
      return { status: "ROUTED", template: ownFixedMaster, director: cleanName, assignedDesk: assignedDeskName, routingSource: "assigned_desk" };
    }
  }

  if (cleanName === "Agriculture & Rural Affairs") {
    const result = resolveAgriculture(routing, storyBeat);
    return { ...result, director: cleanName, routingSource: "agriculture_story_beat" };
  }

  if (ownFixedMaster) {
    return { status: "ROUTED", template: ownFixedMaster, director: cleanName, routingSource: "fixed_director" };
  }

  if (assignedDeskEntry) {
    if (assignedDeskEntry.director === "Agriculture & Rural Affairs") {
      const result = resolveAgriculture(routing, storyBeat);
      return { ...result, director: cleanName, assignedDesk: assignedDeskName, routingSource: "assigned_desk" };
    }
    const assignedMaster = routing.masters.includes(assignedDeskEntry.template)
      ? assignedDeskEntry.template : null;
    if (assignedMaster) {
      return { status: "ROUTED", template: assignedMaster, director: cleanName, assignedDesk: assignedDeskName, routingSource: "assigned_desk" };
    }
    const beatResult = findBeatMaster(routing, storyBeat);
    if (beatResult.status !== "ROUTED") {
      return { ...beatResult, director: cleanName, assignedDesk: assignedDeskName };
    }
    return { ...beatResult, director: cleanName, assignedDesk: assignedDeskName, routingSource: "assigned_desk_story_beat" };
  }

  const beatResult = findBeatMaster(routing, storyBeat);
  if (beatResult.status !== "ROUTED") return { ...beatResult, director: cleanName };
  return { ...beatResult, director: cleanName, routingSource: "story_beat" };
}
