export const CHANNELS_STORAGE_KEY = "_zuri_channels";
const MAX_PENDING = 20;
const MAX_CONVERSATIONS = 500;
const MAX_SEEN = 200;

export interface PendingSender { senderId: string; text: string; direct: boolean; at: number }
/** One channel's saved state; every channel has its own allowlist, so sender IDs from two platforms never meet. */
export interface ChannelRecord {
  config: { enabled: boolean; autoAllowAll: boolean; progress: boolean; /** Offer follow-up questions after a reply. */ suggest: boolean; /** The adapter's `fields`, by key. */ fields: Record<string, string> };
  /** Sender IDs that may start tasks. */
  allowed: string[];
  pending: PendingSender[];
  /** Connection state the adapter asks to keep (a polling cursor), by key. */
  state: Record<string, string>;
  /** Recent message IDs, so a push repeated after a worker restart is not run twice. */
  seen: string[];
  /** `<conversation key>` -> Session ID. The Background Session store owns the task itself. */
  conversations: Record<string, { sessionId: string; updatedAt: number; /** Where to reach the conversation. */ to?: string; /** When the idle reminder went out. */ notifiedAt?: number }>;
}
interface Root { schemaVersion: 2; channels: Record<string, ChannelRecord> }

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** Normalize one channel's record at the boundary. `legacy` is the version-1 file, where WeCom's fields sat in `wecom`. */
export function normalizeRecord(raw: unknown, legacy = false): ChannelRecord {
  const stored = object(raw);
  const config = object(legacy ? stored.wecom : stored.config);
  const fields: Record<string, string> = {};
  // Version 1 kept the fields beside the flags; the flags are booleans, so only the text values are fields.
  for (const [key, value] of Object.entries(legacy ? config : object(config.fields))) if (typeof value === "string") fields[key] = value;
  const conversations: ChannelRecord["conversations"] = {};
  for (const [key, value] of Object.entries(object(stored.conversations))) {
    const entry = object(value);
    if (typeof entry.sessionId === "string" && entry.sessionId) {
      conversations[key] = { sessionId: entry.sessionId, updatedAt: Number(entry.updatedAt) || 0,
        ...(typeof entry.to === "string" && entry.to ? { to: entry.to } : {}), ...(Number(entry.notifiedAt) > 0 ? { notifiedAt: Number(entry.notifiedAt) } : {}) };
    }
  }
  return {
    config: { enabled: config.enabled === true, autoAllowAll: config.autoAllowAll === true, progress: config.progress === true, suggest: config.suggest === true, fields },
    allowed: strings(stored.allowed),
    pending: (Array.isArray(stored.pending) ? stored.pending : []).map(object).filter(item => typeof item.senderId === "string")
      .map(item => ({ senderId: String(item.senderId), text: String(item.text || ""), direct: item.direct !== false, at: Number(item.at) || 0 })),
    state: Object.fromEntries(Object.entries(object(stored.state)).filter(([, value]) => typeof value === "string")) as Record<string, string>,
    seen: strings(stored.seen),
    conversations,
  };
}

/** Version 1 was WeCom's record alone; version 2 holds one record per channel. An unknown version starts empty rather than guessing. */
export function normalizeRoot(raw: unknown): Root {
  const stored = object(raw);
  if (stored.schemaVersion === 1) return { schemaVersion: 2, channels: { wecom: normalizeRecord(stored, true) } };
  const channels: Root["channels"] = {};
  if (stored.schemaVersion === 2) for (const [id, record] of Object.entries(object(stored.channels))) channels[id] = normalizeRecord(record);
  return { schemaVersion: 2, channels };
}

export interface ChannelStorage { get(key: string): Promise<Record<string, unknown>>; set(values: Record<string, unknown>): Promise<void> }

/** Single Background owner: writes are serialized across channels, so concurrent updates never lose each other. */
export function createChannelStorage(storage: ChannelStorage) {
  let writes: Promise<unknown> = Promise.resolve();
  const readRoot = async () => normalizeRoot((await storage.get(CHANNELS_STORAGE_KEY))[CHANNELS_STORAGE_KEY]);
  /** The store of one channel. */
  return (channelId: string) => ({
    async read() { return (await readRoot()).channels[channelId] ?? normalizeRecord({}); },
    update(change: (record: ChannelRecord) => void): Promise<ChannelRecord> {
      const result = writes.then(async () => {
        const root = await readRoot();
        const record = root.channels[channelId] ??= normalizeRecord({});
        change(record);
        record.pending = record.pending.slice(-MAX_PENDING);
        record.seen = record.seen.slice(-MAX_SEEN);
        const keys = Object.keys(record.conversations);
        if (keys.length > MAX_CONVERSATIONS) {
          for (const key of keys.sort((a, b) => record.conversations[a].updatedAt - record.conversations[b].updatedAt).slice(0, keys.length - MAX_CONVERSATIONS)) delete record.conversations[key];
        }
        await storage.set({ [CHANNELS_STORAGE_KEY]: root });
        return record;
      });
      writes = result.catch(() => {});
      return result;
    },
  });
}
export type ChannelStore = ReturnType<ReturnType<typeof createChannelStorage>>;
