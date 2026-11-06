import { createTranslator } from "#sdk/shared/i18n";
import messages from "./messages.js";

export const t = createTranslator(messages);
export type MessageKey = Parameters<typeof t>[0];
/** A channel's optional copy (a field hint) exists only for some fields. */
export const hasMessage = (key: string): key is MessageKey => key in messages.messages;
