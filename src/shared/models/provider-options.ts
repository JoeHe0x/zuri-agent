import type { ProviderModelOption } from "../contracts/settings.js";

/** Preserve declared wire keys, including options saved by older releases. */
export function normalizeProviderModelOptions(config: Record<string, unknown>, options: readonly ProviderModelOption[] = []) {
  return Object.fromEntries(options.map(option => {
    const value = String(config[option.key] ?? "").trim();
    const choice = option.options.find(choice => choice.value.toLowerCase() === value.toLowerCase());
    return [option.key, choice?.value ?? option.defaultValue];
  }));
}

/** Choices and default of an option for one model; null when the option's model rules exclude it. */
export function resolveModelOption(option: ProviderModelOption, model: string) {
  if (!option.modelRules) return { options: option.options, defaultValue: option.defaultValue };
  const rule = option.modelRules.find(item => new RegExp(item.match).test(model));
  if (!rule) return null;
  const { values } = rule;
  return { options: values ? option.options.filter(choice => values.includes(choice.value)) : option.options, defaultValue: rule.defaultValue ?? option.defaultValue };
}
