// site/admin-core.mjs のユニットテスト。モック fetch で verifyToken を直接検証する
// (admin.js 本体は DOM 初期化が走るため import しない)。
// 実行: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyToken, setJsoncValue, parseJsonc } from '../site/admin-core.mjs';

// 呼び出し順にレスポンスを返す簡易モック fetch
function fakeFetch(responses) {
  let i = 0;
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    if (i >= responses.length) throw new Error('unexpected extra fetch call: ' + url);
    return responses[i++];
  };
  impl.calls = calls;
  return impl;
}

function res(status, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => lower[k.toLowerCase()] ?? null },
  };
}

// ---- verifyToken (T1〜T5) ----

test('verifyToken T1: repo GET 401 -> invalid_token', async () => {
  const fetchImpl = fakeFetch([res(401)]);
  const r = await verifyToken(fetchImpl, 'owner', 'repo', 'tok');
  assert.deepEqual(r, { ok: false, reason: 'invalid_token' });
});

test('verifyToken T2: repo GET 404 -> not_found', async () => {
  const fetchImpl = fakeFetch([res(404)]);
  const r = await verifyToken(fetchImpl, 'owner', 'repo', 'tok');
  assert.deepEqual(r, { ok: false, reason: 'not_found' });
});

test('verifyToken T3: repo GET 403 + x-ratelimit-remaining:0 -> rate_limit', async () => {
  const fetchImpl = fakeFetch([res(403, { 'x-ratelimit-remaining': '0' })]);
  const r = await verifyToken(fetchImpl, 'owner', 'repo', 'tok');
  assert.deepEqual(r, { ok: false, reason: 'rate_limit' });
});

test('verifyToken T3b: repo GET 403 + 残量あり -> no_write', async () => {
  const fetchImpl = fakeFetch([res(403, { 'x-ratelimit-remaining': '42' })]);
  const r = await verifyToken(fetchImpl, 'owner', 'repo', 'tok');
  assert.deepEqual(r, { ok: false, reason: 'no_write' });
});

test('verifyToken T4: repo GET 200 + blob POST 403 -> no_write', async () => {
  const fetchImpl = fakeFetch([res(200), res(403)]);
  const r = await verifyToken(fetchImpl, 'owner', 'repo', 'tok');
  assert.deepEqual(r, { ok: false, reason: 'no_write' });
  assert.equal(fetchImpl.calls.length, 2);
  assert.match(fetchImpl.calls[1].url, /\/git\/blobs$/);
  assert.equal(fetchImpl.calls[1].options.method, 'POST');
});

test('verifyToken T4b: repo GET 200 + blob POST 404 -> no_write', async () => {
  const fetchImpl = fakeFetch([res(200), res(404)]);
  const r = await verifyToken(fetchImpl, 'owner', 'repo', 'tok');
  assert.deepEqual(r, { ok: false, reason: 'no_write' });
});

test('verifyToken T5: repo GET 200 + blob POST 201 -> ok', async () => {
  const fetchImpl = fakeFetch([res(200), res(201)]);
  const r = await verifyToken(fetchImpl, 'owner', 'repo', 'tok');
  assert.deepEqual(r, { ok: true });
});

test('verifyToken: blob プローブの body は空blob(content:"", encoding:"utf-8")', async () => {
  const fetchImpl = fakeFetch([res(200), res(201)]);
  await verifyToken(fetchImpl, 'owner', 'repo', 'tok');
  const body = JSON.parse(fetchImpl.calls[1].options.body);
  assert.deepEqual(body, { content: '', encoding: 'utf-8' });
});

// ---- setJsoncValue (T7) ----

test('setJsoncValue T7a: 既存キーの値を置換し、コメント行を保持する', () => {
  const text = [
    '{',
    '  // 公開設定',
    '  "published": false,',
    '  "site_title": "Foo"',
    '}',
    '',
  ].join('\n');
  const out = setJsoncValue(text, 'published', true);
  assert.match(out, /"published":\s*true/);
  assert.match(out, /\/\/ 公開設定/);
  assert.equal(parseJsonc(out).published, true);
  assert.equal(parseJsonc(out).site_title, 'Foo');
});

test('setJsoncValue T7b: 存在しないキーは先頭に挿入する', () => {
  const text = '{\n  "published": false\n}\n';
  const out = setJsoncValue(text, 'show_played', true);
  const parsed = parseJsonc(out);
  assert.equal(parsed.show_played, true);
  assert.equal(parsed.published, false);
});

test('setJsoncValue T7c: 文字列値の中の "//"(URL)を壊さない', () => {
  const text = '{\n  "channel_url": "https://example.com/old"\n}\n';
  const out = setJsoncValue(text, 'channel_url', 'https://example.com/new');
  assert.equal(parseJsonc(out).channel_url, 'https://example.com/new');
  // 置換対象以外の "//" を含む値があっても壊れないことも確認する
  const text2 = '{\n  "a": "https://example.com/x",\n  "b": 1\n}\n';
  const out2 = setJsoncValue(text2, 'b', 2);
  assert.equal(parseJsonc(out2).a, 'https://example.com/x');
  assert.equal(parseJsonc(out2).b, 2);
});
