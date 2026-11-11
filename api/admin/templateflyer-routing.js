import { readFile } from "node:fs/promises";

const routingUrl = new URL("../../graphics/templateflyer-routing.json", import.meta.url);

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function resolveTemplate(director, storyBeat = "") {
  const routing = JSON.parse(await readFile(routingUrl, "utf8"));
  const cleanDirector = String(director || "").replace(/^Director\\s+/i, "").trim();
  const entry = routing.directors.find(item => item.director === cleanDirector);
  if (!entry) return { status: "HOLD", template: null, reason: "unknown_director" };

  if (cleanDirector === "Agriculture & Rural Affairs") {
    const beat = normalize(storyBeat);
    const weatherLed = ["weather", "disaster", "climate_emergency"].some(key =>
      beat === key || beat.startsWith(key + "_") || beat.includes("_" + key + "_") || beat.endsWith("_" + key)
    );
    return { status: "ROUTED", template: weatherLed ? "Weather & Disasters" : "Business & Economy", director: cleanDirector };
  }

  if (routing.masters.includes(entry.template)) {
    return { status: "ROUTED", template: entry.template, director: cleanDirector };
  }

  const beat = normalize(storyBeat);
  if (!beat) return { status: "HOLD", template: null, reason: "story_beat_required", director: cleanDirector };
  const directMaster = routing.masters.find(master => normalize(master) === beat);
  if (directMaster) return { status: "ROUTED", template: directMaster, director: cleanDirector };

  const keys = Object.keys(routing.storyBeatRouting).sort((a, b) => b.length - a.length);
  const matchedKey = keys.find(key =>
    beat === key || beat.startsWith(key + "_") || beat.includes("_" + key + "_") || beat.endsWith("_" + key)
  );
  if (!matchedKey) return { status: "HOLD", template: null, reason: "unmapped_story_beat", director: cleanDirector };
  return { status: "ROUTED", template: routing.storyBeatRouting[matchedKey], director: cleanDirector, matchedBeat: matchedKey };
}
