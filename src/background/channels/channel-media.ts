import type { ChannelMedia } from "./channel-adapter.js";

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024, FILE_MAX_BYTES = 20 * 1024 * 1024;
export const base64 = (bytes: Uint8Array) => { let out = ""; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(out); };
export const imageType = (b: Uint8Array) => b[0] === 0x89 ? "image/png" : b[0] === 0x47 ? "image/gif" : b[0] === 0x52 ? "image/webp" : "image/jpeg";
/** Hosts often label pictures application/octet-stream, so the bytes decide too. */
export const looksLikeImage = (b: Uint8Array) => (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x47 && b[1] === 0x49) || (b[0] === 0x52 && b[8] === 0x57);

/** Fetch something the agent produced (an http(s) or data URL) so it can be sent back as an image or file. */
export async function fetchChannelMedia(url: string, name = "", fetchImpl: typeof fetch = fetch): Promise<ChannelMedia> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`download failed (${response.status})`);
  const data = new Uint8Array(await response.arrayBuffer());
  if (!data.length) throw new Error("the file is empty");
  if (data.length > FILE_MAX_BYTES) throw new Error("the file is larger than 20 MB");
  const image = ((response.headers.get("content-type") || "").startsWith("image/") || looksLikeImage(data)) && data.length <= IMAGE_MAX_BYTES;
  const fallback = url.startsWith("data:") ? "" : decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
  return { type: image ? "image" : "file", filename: name || fallback || (image ? `image.${imageType(data).slice(6)}` : "file"), data };
}

export const splitText = (text: string, size: number) =>
  Array.from({ length: Math.max(1, Math.ceil(text.length / size)) }, (_, i) => text.slice(i * size, (i + 1) * size));
