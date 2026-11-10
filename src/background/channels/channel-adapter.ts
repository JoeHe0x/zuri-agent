/**
 * What the runtime needs from a chat platform. A new channel is one adapter file that exports a `ChannelAdapter`,
 * plus one entry in the service worker's adapter list; the runtime, store and settings page need no change.
 */
export interface ChannelMessage {
  messageId: string;
  /** The platform's reply handle, when replies can use native streaming. */
  reqId?: string;
  senderId: string;
  /** Opaque to the runtime: whatever `ChannelSocket.send` needs to address the chat (a direct chat, a group, a thread). */
  conversationId: string;
  direct: boolean;
  text: string;
  /** Platform attachment references; `ChannelAdapter.loadImage` / `loadFile` fetch them. */
  images?: any[];
  files?: any[];
  /** False for types the bot cannot read; the runtime answers with a short notice. */
  supported: boolean;
}
export interface LoadedFile { base64: string; name: string; mimeType: string; size: number }
export interface LoadedImage { dataUrl: string; type: string; name: string }
/** Something to send back to the chat: an image or a file. */
export interface ChannelMedia { type: "image" | "file"; filename: string; data: Uint8Array }
/** One streamed reply bubble: the texts added so far are shown together and grow as more arrive. */
export interface ChannelStream {
  add(text: string): void;
  /** Closes the bubble and returns the texts it could not show, for the caller to send as plain messages. */
  end(): Promise<string[]>;
}
export type ChannelSocketState = "connected" | "disconnected" | "replaced";
export interface ChannelSocket {
  start(): Promise<void>;
  /** Sends are queued per conversation under the platform's rate limit; `control` messages (approval prompts) may use reserved quota. */
  send(conversationId: string, text: string, options?: { control?: boolean }): Promise<void>;
  sendMedia?(conversationId: string, media: ChannelMedia): Promise<void>;
  /** Shows a web image by URL, for when it cannot be downloaded and uploaded. */
  sendImageLink?(conversationId: string, url: string): Promise<void>;
  stream?(reqId: string, prefix?: string): ChannelStream;
  stop(): void;
}
export interface ChannelSocketOptions {
  /** The saved values of the adapter's `fields`. */
  fields: Record<string, string>;
  /** Small values the connection must survive a restart with (a polling cursor, reply tokens). Strings only. */
  state: { read(): Promise<Record<string, string>>; write(patch: Record<string, string>): Promise<void> };
  onMessage(message: ChannelMessage): void;
  onState(state: ChannelSocketState, error?: string): void;
}
/** A setting the user fills in; the settings page renders one input per field. */
export interface ChannelField {
  key: string;
  /** Stored but never sent back to the page; an empty value on save keeps the stored one. */
  secret?: boolean;
  /** Not needed to connect. */
  optional?: boolean;
  /** Filled in by the adapter's login, never typed: stored like a secret and not shown as an input. */
  managed?: boolean;
}
export type ChannelLoginStatus = "wait" | "scanned" | "expired" | "done";
export interface ChannelLoginStep {
  status: ChannelLoginStatus;
  /** The ticket to poll next, when it changed (a redirect). */
  ticket?: string;
  /** With `done`: the values for the adapter's managed fields, and the person who logged in, who becomes the first allowed sender. */
  fields?: Record<string, string>;
  owner?: string;
}
/** Sign-in by scanning a QR code with the platform's app, for platforms with no bot token to paste. */
export interface ChannelLogin {
  /** `qr` is the text to encode as a QR code; `ticket` identifies this attempt in `poll`. */
  start(): Promise<{ ticket: string; qr: string }>;
  /** Resolves within about half a minute, with `wait` when nothing changed yet. */
  poll(ticket: string): Promise<ChannelLoginStep>;
}
export interface ChannelAdapter {
  /** Stable key for storage, session keys and settings copy. */
  id: string;
  /** The platform's name as people say it in chat. */
  label: string;
  fields: ChannelField[];
  login?: ChannelLogin;
  createSocket(options: ChannelSocketOptions): ChannelSocket;
  loadImage?(image: any): Promise<LoadedImage>;
  loadFile?(file: any): Promise<LoadedFile>;
  /** Fetches an image or file the agent produced, so it can be sent back to the chat. */
  fetchMedia?(url: string, name?: string): Promise<ChannelMedia>;
}
/** True when every required field has a value (managed fields are required once logged in). */
export const isConfigured = (fields: ChannelField[], values: Record<string, string>) => fields.every(field => field.optional || values[field.key]);
