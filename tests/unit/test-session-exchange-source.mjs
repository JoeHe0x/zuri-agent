import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedSessionExchangeLocation, SESSION_EXCHANGE_HTTPS_ALLOWLIST } from '../../src/shared/session/session-exchange-source.js';
import { isAllowedSessionExportSource } from '../../src/background/services/session-exchange-bridge.js';

test('local exported chats can be imported without a hosted service', () => {
  for (const value of ['file:///tmp/conversation.html', 'http://localhost:8765/', 'http://127.0.0.1:4173/', 'http://[::1]:8765/']) {
    assert.equal(isAllowedSessionExchangeLocation(new URL(value)), true, value);
    assert.equal(isAllowedSessionExportSource(value), true, value);
  }
});
test('external origins, suffix impersonation and unsupported protocols cannot import chats', () => {
  for (const value of ['https://untrusted.invalid/', 'http://localhost.evil.test/', 'https://notlocalhost/', 'data:text/html,content', 'chrome://settings/', 'chrome-extension://id/export']) {
    assert.equal(isAllowedSessionExchangeLocation(new URL(value)), false, value);
    assert.equal(isAllowedSessionExportSource(value), false, value);
  }
  assert.equal(isAllowedSessionExportSource('bad url'), false);
});
test('official GitHub Pages can import only under the project path', () => {
  assert.deepEqual(SESSION_EXCHANGE_HTTPS_ALLOWLIST, [
    { hostname: 'joehe0x.github.io', pathnamePrefix: '/zuri-agent/' },
  ]);
  for (const value of [
    'https://joehe0x.github.io/zuri-agent/examples/travel/',
    'https://joehe0x.github.io/zuri-agent/',
    'https://ALIBABA.GITHUB.IO/zuri-agent/examples/travel/?lang=zh-CN#top',
  ]) {
    assert.equal(isAllowedSessionExchangeLocation(new URL(value)), true, value);
    assert.equal(isAllowedSessionExportSource(value), true, value);
  }
  for (const value of [
    'https://joehe0x.github.io/other-repo/',
    'https://joehe0x.github.io/zuri-agent-evil/',
    'http://joehe0x.github.io/zuri-agent/',
    'https://evil.joehe0x.github.io.example.com/zuri-agent/',
    'https://x.joehe0x.github.io/zuri-agent/',
    'https://joehe0x.github.io/zuri-agent',
    'https://joehe0x.github.io/zuri-agent/../other-repo/',
    'https://joehe0x.github.io.evil.com/zuri-agent/',
    'https://joehe0x.github.io/ZURI-browser-agent/',
  ]) {
    assert.equal(isAllowedSessionExchangeLocation(new URL(value)), false, value);
    assert.equal(isAllowedSessionExportSource(value), false, value);
  }
  assert.equal(isAllowedSessionExchangeLocation({
    protocol: 'https:',
    hostname: 'joehe0x.github.io',
  }), false);
});
