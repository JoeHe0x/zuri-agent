import assert from "node:assert/strict";
import test from "node:test";
import { mergeBudgets } from "../benchmarks/conversation-render/tools/merge-budgets.mjs";

test("budget overrides preserve defaults and cannot alter inherited objects", () => {
  const inherited = { zuriBudgetInherited: {} };
  const target = Object.assign(Object.create(inherited), { elapsedMs: { render: 500, switch: 300 } });
  const input = JSON.parse('{"__proto__":{"zuriBudgetPollution":1},"constructor":{"prototype":{"zuriBudgetPollution":2}},"elapsedMs":{"render":100,"__proto__":{"zuriBudgetPollution":3}},"zuriBudgetInherited":{"value":4}}');
  try {
    mergeBudgets(target, input);
    assert.deepEqual(target.elapsedMs, { render: 100, switch: 300 });
    assert.equal({}.zuriBudgetPollution, undefined);
    assert.equal(Object.hasOwn(target, "constructor"), false);
    assert.deepEqual(inherited.zuriBudgetInherited, {});
    assert.deepEqual(target.zuriBudgetInherited, { value: 4 });
  } finally {
    delete Object.prototype.zuriBudgetPollution;
  }
});
