import { getLanguage } from "#sdk/shared/i18n";
import * as zh from "./prompts/task-retrospective-zh-CN.js";
import * as en from "./prompts/task-retrospective-en.js";

const current = () => (getLanguage() === "zh-CN" ? zh : en);

export default {
  name: "task-retrospective", aliases: [zh.displayName, en.displayName], resources: [], order: 3,
  get displayName() { return current().displayName; },
  get description() { return current().description; },
  get content() { return current().content; },
};
