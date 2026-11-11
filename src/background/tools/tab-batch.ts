import type { ToolBatchTabPolicy } from "../../shared/contracts/tool.js";
import { independentToolPolicy, isToolOrchestration, type ToolDependencies } from "./tool-scheduler.js";
import { createdTabResultId } from "../../shared/contracts/page-observation.js";
import { getLanguage } from "../../shared/i18n/index.js";
import { ToolExecutionError } from "./arguments.js";
import { isTabAlias, tabReferenceId } from "../../shared/tab-reference.js";
import { resolveTabReference, tabReferenceError } from "./tab-reference.js";

type Fields = Record<string, unknown>;
const record = (value: unknown): Fields => value && typeof value === "object" && !Array.isArray(value) ? value as Fields : {};

export function planTabBatch<T>(items: readonly T[], describe: (item: T) => {
  args: unknown;
  policy: ToolBatchTabPolicy | null | undefined;
}, language = getLanguage(), aliases: Readonly<Record<string, number>> = {}) {
  type Entry = { index: number; item: T; originalArgs: unknown; args: Fields; policy: ToolBatchTabPolicy | null | undefined; error?: ToolExecutionError };
  const error = (reason: string, reference?: unknown) => tabReferenceError(reason, reference, language);
  const entries: Entry[] = items.map((item, index) => {
    const { args, policy } = describe(item);
    return { index, item, originalArgs: args, args: record(args), policy };
  });
  const byItem = new Map(entries.map(entry => [entry.item, entry]));
  const creators = new Map<string, Entry>(), duplicates = new Set<string>();
  const executed = new Map<Entry, { id: number; result: unknown }>(), published = new Map<Entry, number>();
  const committedCreators = new Set<Entry>();
  for (const entry of entries) {
    if (entry.policy?.kind === "script") continue;
    const alias = entry.args.tabAlias;
    if (alias == null) continue;
    if (entry.policy?.kind !== "create" || !isTabAlias(alias)) { entry.error = error("invalid_alias", alias); continue; }
    if (creators.has(alias)) duplicates.add(alias); else creators.set(alias, entry);
  }
  for (const alias of duplicates) creators.get(alias)!.error = error("duplicate_alias", alias);
  const parents = new Map<Entry, Entry>();
  const targets = new Map<Entry, number>();
  for (const entry of entries) {
    if (entry.policy?.kind === "script") continue;
    const ref = entry.args.tabRef;
    if (Object.hasOwn(entry.args, "tabRef")) {
      // Existing bindings win over an attempted duplicate open; its failure must not redirect readers.
      const producer = tabReferenceId(ref) === null && !Object.hasOwn(aliases, String(ref)) ? creators.get(String(ref)) : undefined;
      if (producer) {
        if (producer.index >= entry.index) entry.error = error("before_creation", ref);
        parents.set(entry, producer);
      } else {
        try { targets.set(entry, resolveTabReference(ref, aliases, language)); }
        catch (failure) { entry.error = failure as ToolExecutionError; }
      }
    }
    const target = targets.get(entry);
    if (target != null && (entry.args.tabId != null && entry.args.tabId !== target
      || entry.policy?.kind === "target" && entry.policy.tabId != null && entry.policy.tabId !== target)) {
      entry.error = error("conflicting_target", ref);
    }
  }
  const independent = (entry: Entry) => !entry.error && independentToolPolicy(entry.policy,
    entry.policy?.kind === "target" ? entry.args.tabRef != null || !entry.policy.implicit
      : entry.args.tabId != null || Object.hasOwn(entry.args, "tabRef"));
  const passive = (entry: Entry) => entry.policy?.kind === "observe" || entry.policy?.kind === "create" && entry.policy.passive === true;
  const edges = new Map<T, ToolDependencies<T>>(), lanes = new Map<unknown, T>();
  const executionLanes = new Map<T, string | number | object | null>();
  let barrier: T | undefined, windowAnchor: T | undefined;
  for (const entry of entries) {
    const producer = parents.get(entry);
    // A uid-targeted policy carries its registered tab; everything else uses the requested tab.
    const policyTab = entry.policy?.kind === "target" ? entry.policy.tabId : undefined;
    const lane = entry.policy?.kind === "script" ? entry : entry.policy?.kind === "create" && !entry.policy.targeted ? entry : producer || policyTab || targets.get(entry) || entry.args.tabId;
    executionLanes.set(entry.item, typeof lane === "number" || typeof lane === "string" || lane && typeof lane === "object" ? lane : null);
    const local = independent(entry);
    edges.set(entry.item, {
      execution: local && !passive(entry) && lanes.has(lane) ? [lanes.get(lane)!] : [],
      commit: !local ? items.slice(0, entry.index) : [
        ...(barrier === undefined ? [] : [barrier]),
        // An earlier numeric or uid target can select a different window. New sibling aliases share its anchor.
        ...(entry.policy?.kind === "create" && windowAnchor !== undefined ? [windowAnchor] : []),
        // Speculative observations can use a private permit; actions need published ownership.
        ...(producer && entry.policy?.kind === "target" && (!entry.policy.observation
          || producer.policy?.kind === "create" && producer.policy.targeted) ? [producer.item] : []),
      ],
    });
    if (!local) barrier = entry.item;
    else if (!passive(entry)) lanes.set(lane, entry.item);
    if ((entry.policy?.kind === "target" || entry.policy?.kind === "create" && entry.policy.targeted)
      && (policyTab != null || targets.has(entry) || entry.args.tabId != null)) windowAnchor = entry.item;
  }
  const parent = (entry: Entry) => parents.get(entry);
  const validResult = (entry: Entry, result: unknown, isError: boolean) => {
    const value = record(result), id = createdTabResultId(result) ?? value.tabRef ?? value.tabId ?? value.id;
    return entry.policy?.kind === "create" && !entry.error && !isError && !value.error
      && value.ok !== false && value.isError !== true && typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
  };
  return {
    ordered: items,
    independent: (item: T) => independent(byItem.get(item)!),
    orchestration: (item: T) => isToolOrchestration(byItem.get(item)!.policy),
    lane: (item: T) => executed.get(parents.get(byItem.get(item)!)!)?.id ?? executionLanes.get(item) ?? null,
    passive: (item: T) => passive(byItem.get(item)!),
    observation: (item: T) => {
      const policy = byItem.get(item)!.policy;
      return policy?.kind === "target" && policy.observation;
    },
    dependencies: (item: T) => edges.get(item)!,
    parallelCreate: (item: T) => {
      const entry = byItem.get(item)!;
      return entry.policy?.kind === "create" && !entry.policy.targeted && independent(entry);
    },
    executionParent: (item: T) => executed.get(parent(byItem.get(item)!)!)?.result,
    args(item: T): unknown {
      const entry = byItem.get(item)!;
      if (entry.error) throw entry.error;
      if (entry.policy?.kind === "script" || entry.args.tabRef == null) return entry.originalArgs;
      const producer = parent(entry)!;
      if (committedCreators.has(producer) && !published.has(producer)) throw error("dependency_failed", entry.args.tabRef);
      const tabId = targets.get(entry) ?? executed.get(producer)?.id;
      if (!tabId) throw error("dependency_failed", entry.args.tabRef);
      if (entry.args.tabId != null && entry.args.tabId !== tabId
        || entry.policy?.kind === "target" && entry.policy.tabId != null && entry.policy.tabId !== tabId) throw error("conflicting_target", entry.args.tabRef);
      return entry.policy?.kind === "target" || entry.policy?.kind === "create" && entry.policy.targeted ? { ...entry.args, tabId } : entry.args;
    },
    complete(item: T, result: unknown, isError: boolean) {
      const entry = byItem.get(item)!, id = validResult(entry, result, isError);
      if (id) executed.set(entry, { id, result });
    },
    settle(item: T, result: unknown, isError: boolean) {
      const entry = byItem.get(item)!;
      if (entry.policy?.kind === "create") committedCreators.add(entry);
      const id = validResult(entry, result, isError);
      if (id) published.set(entry, id);
    },
    assertDependenciesCommitted(item: T) {
      const producer = parent(byItem.get(item)!);
      if (producer && !published.has(producer)) throw error("dependency_failed", byItem.get(item)!.args.tabRef);
    },
  };
}
