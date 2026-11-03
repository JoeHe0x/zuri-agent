/** Storage record written by Background's release check and read by the Side Panel. */
export const UPDATE_NOTICE_KEY = "updateNotice";
export const RELEASES_API_URL = "https://api.github.com/repos/JoeHe0x/zuri-agent/releases/latest";

export interface UpdateNotice { version: 1; latest: string; url: string; checkedAt: number }

/** True when `latest` is a strictly higher dotted-numeric version than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.replace(/^v/i, "").split(".").map(Number), b = current.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

export const UPDATE_CHECK_TTL_MS = 6 * 60 * 60 * 1000;

/** Returns the cached release, refreshing it from GitHub at most once per TTL; failures keep the cached value. */
export async function loadUpdateNotice(signal?: AbortSignal): Promise<UpdateNotice | undefined> {
  const stored = (await chrome.storage.local.get(UPDATE_NOTICE_KEY))[UPDATE_NOTICE_KEY] as UpdateNotice | undefined;
  if (stored && Date.now() - stored.checkedAt < UPDATE_CHECK_TTL_MS) return stored;
  try {
    const response = await fetch(RELEASES_API_URL, { signal });
    if (!response.ok) return stored;
    const release = await response.json();
    const latest = String(release?.tag_name || "").replace(/^v/i, "");
    if (!latest) return stored;
    const zip = (release.assets || []).find((a: { name?: string }) => /\.zip$/i.test(a.name || ""));
    const notice: UpdateNotice = { version: 1, latest, url: zip?.browser_download_url || release.html_url || "", checkedAt: Date.now() };
    await chrome.storage.local.set({ [UPDATE_NOTICE_KEY]: notice });
    return notice;
  } catch { return stored; }
}
