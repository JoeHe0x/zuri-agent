import { getLanguage } from "#sdk/shared/i18n";
import * as zh from "./prompts/site-memory-zh-CN.js";
import * as en from "./prompts/site-memory-en.js";

const current = () => (getLanguage() === "zh-CN" ? zh : en);

export default {
  name: "site-memory", aliases: [zh.displayName, en.displayName], resources: [], order: 4,
  get displayName() { return current().displayName; },
  get description() { return current().description; },
  get content() { return current().content; },
};
