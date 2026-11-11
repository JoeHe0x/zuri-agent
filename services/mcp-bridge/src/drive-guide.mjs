import { readFileSync } from "node:fs";

const candidates = [
  new URL("./zuri-drive-SKILL.md", import.meta.url),
  new URL("../../../skills/zuri-agent/SKILL.md", import.meta.url),
];
const MARKERS = [
  ["<!-- zuri-drive-guide:en -->", "<!-- zuri-drive-guide:end -->"],
  ["<!-- qz-drive-guide:en -->", "<!-- qz-drive-guide:end -->"],
];
let cached = "";

function loadGuideSource() {
  if (cached) return cached;
  const errors = [];
  for (const url of candidates) {
    try {
      cached = readFileSync(url, "utf8");
      return cached;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      errors.push(url.pathname);
    }
  }
  throw new Error(`direct-drive guide is missing. Looked in ${errors.join(", ")}.`);
}

/** Read the direct-drive usage guide. */
export function driveGuide() {
  const text = loadGuideSource();
  for (const [startMarker, endMarker] of MARKERS) {
    const start = text.indexOf(startMarker);
    if (start >= 0) {
      const end = text.indexOf(endMarker, start + startMarker.length);
      if (end >= 0) return `${text.slice(start + startMarker.length, end).trim()}\n`;
    }
  }
  throw new Error("direct-drive guide content is missing.");
}

export function resetDriveGuideCache() {
  cached = "";
}
