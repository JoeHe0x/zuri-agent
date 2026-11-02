import { getLanguage } from "#sdk/shared/i18n";
import * as zh from "./prompts/find-skills-zh-CN.js";
import * as en from "./prompts/find-skills-en.js";

const current = () => (getLanguage() === "zh-CN" ? zh : en);

export default {
  name: "find-skills", aliases: [zh.displayName, en.displayName], resources: [], order: 2,
  get displayName() { return current().displayName; },
  get description() { return current().description; },
  get content() { return current().content; },
};
