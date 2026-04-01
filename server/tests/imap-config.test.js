const { test } = require('node:test');
const assert = require('node:assert');

const { envBool } = require('../services/imapSyncService');

test('envBool falls back to the default when env is unset', () => {
  delete process.env.IMAP_TLS_REJECT_UNAUTHORIZED;
  assert.equal(envBool('IMAP_TLS_REJECT_UNAUTHORIZED', true), true);
  assert.equal(envBool('IMAP_TLS_REJECT_UNAUTHORIZED', false), false);
});

test('envBool treats falsey strings as false', () => {
  process.env.IMAP_TLS_REJECT_UNAUTHORIZED = 'false';
  assert.equal(envBool('IMAP_TLS_REJECT_UNAUTHORIZED', true), false);

  process.env.IMAP_TLS_REJECT_UNAUTHORIZED = '0';
  assert.equal(envBool('IMAP_TLS_REJECT_UNAUTHORIZED', true), false);
});

test('envBool treats other values as true', () => {
  process.env.IMAP_TLS_REJECT_UNAUTHORIZED = 'true';
  assert.equal(envBool('IMAP_TLS_REJECT_UNAUTHORIZED', false), true);

  process.env.IMAP_TLS_REJECT_UNAUTHORIZED = 'yes';
  assert.equal(envBool('IMAP_TLS_REJECT_UNAUTHORIZED', false), true);
});
