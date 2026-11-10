/** Tools outside the default set are sent to the model only after `enable_tools` loads their group. */
export const TOOL_GROUPS = ["sessions", "media", "network", "browser"] as const;
export type ToolGroup = typeof TOOL_GROUPS[number];

// Loaded groups persist beside loaded Skill names, so they use a prefix a Skill name cannot have.
const PREFIX = "tool-group:";

export const toolGroupLoadName = (group: ToolGroup) => `${PREFIX}${group}`;

export function isToolGroup(value: unknown): value is ToolGroup {
  return TOOL_GROUPS.includes(value as ToolGroup);
}

export function loadedToolGroups(names: unknown): Set<ToolGroup> {
  const loaded = new Set<ToolGroup>();
  for (const name of names instanceof Set || Array.isArray(names) ? names : []) {
    const group = String(name || "").trim().toLowerCase();
    if (group.startsWith(PREFIX) && isToolGroup(group.slice(PREFIX.length))) loaded.add(group.slice(PREFIX.length) as ToolGroup);
  }
  return loaded;
}
