import { defineMessages } from "#sdk/shared/i18n-definition";

/** Package-owned interface text. Identifiers and user content remain untranslated. */
export default defineMessages("provider-anthropic", {
  allProviders: { "zh-CN": "所有服务商", en: "All providers" },
  signInWithYourClaudeAccountToUseClaude: { "zh-CN": "使用 Claude Pro/Max 账号登录后即可调用 Claude 模型。授权后最后一页可能提示无法访问 localhost，属正常现象，扩展会自动完成登录。", en: "Sign in with your Claude Pro or Max account to use Claude models. The last page may show a connection error for localhost; the extension completes sign-in automatically." },
  theLoginSessionExpiredStartClaudeLoginAgain: { "zh-CN": "登录会话已失效，请重新开始 Claude 登录。", en: "Your sign-in session has expired. Sign in to Claude again." },
  signInToClaudeInSettingsFirst: { "zh-CN": "请先在设置中完成 Claude 登录。", en: "Sign in to Claude in Settings first." },
  claudeSignInFailed: { "zh-CN": "Claude 登录失败：{reason}", en: "Claude sign-in failed: {reason}" },
  loginCanceledStartAgain: { "zh-CN": "登录已取消，请重新开始。", en: "Sign-in canceled. Start again." },
});
