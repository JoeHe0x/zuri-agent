// Dynamic import: a platform's SDK needs no install until its channel is enabled.
export const adapters = {
  wecom: () => import("./wecom.mjs"),
};
