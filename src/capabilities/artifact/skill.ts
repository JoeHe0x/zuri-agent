import { t } from "./i18n.js";

const resource = (path: string, key: "themeResearch" | "themeDashboard" | "themeComparison" | "themeKit" | "themeKitExtra" | "themeCharts" | "themeAudit" | "themeConsole" | "themeInstrument") => ({
  path, type: "reference", get title() { return t(key).split("\n", 1)[0].replace(/^#\s*/, ""); }, get content() { return t(key); },
});

/** Content-only Skill. Themes are resources so only the one in use enters context. */
export default {
  name: "zuri-artifact",
  order: 5,
  get displayName() { return t("displayName"); },
  get description() { return t("description"); },
  get content() { return t("content"); },
  get resources() { return [resource("references/components.md", "themeKit"), resource("references/components-extra.md", "themeKitExtra"), resource("references/charts.md", "themeCharts"), resource("references/audit-and-compare.md", "themeAudit"), resource("references/themes/instrument.md", "themeInstrument"), resource("references/themes/console-charts.md", "themeConsole"), resource("references/themes/research.md", "themeResearch"), resource("references/themes/dashboard.md", "themeDashboard"), resource("references/themes/comparison.md", "themeComparison")]; },
};
