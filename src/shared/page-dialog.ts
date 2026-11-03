import { defineMessages } from "./i18n/definition.js";
import { createTranslator } from "./i18n/index.js";

export const pageDialogMessages = defineMessages("page-dialog", {
  title: { "zh-CN": "页面请求确认", en: "The page asks for confirmation" },
});

export const pageDialogT = createTranslator(pageDialogMessages);
