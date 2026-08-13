// scripts/update-readme-links.mjs のユニットテスト。
// 実行: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSiteUrl,
  replaceLinkSection,
  removeDemoSection,
} from '../scripts/update-readme-links.mjs';

// ---- buildSiteUrl ----

test('buildSiteUrl: 通常のリポジトリ名 → https://<owner>.github.io/<repo>/ (U1)', () => {
  assert.equal(buildSiteUrl('foo/bar'), 'https://foo.github.io/bar/');
});

test('buildSiteUrl: リポジトリ名が <owner>.github.io → https://<owner>.github.io/ (U1)', () => {
  assert.equal(buildSiteUrl('foo/foo.github.io'), 'https://foo.github.io/');
});

// ---- replaceLinkSection ----

const SAMPLE_JA = [
  '# Steam Game Shelf',
  '',
  '**デモを見る**: [公開ページ](https://example.com/)',
  '',
  '<!-- MY_LINKS_START -->',
  '初回の Update game list 実行後、ここにあなたのサイトへのリンクが自動で入ります(この区間は自動管理です)',
  '<!-- MY_LINKS_END -->',
  '',
  '## 必要なもの',
].join('\n');

const SAMPLE_EN = [
  '# Steam Game Shelf',
  '',
  '**See it live**: [public page](https://example.com/)',
  '',
  '<!-- MY_LINKS_START -->',
  'After the first run, links will appear here.',
  '<!-- MY_LINKS_END -->',
  '',
  '## Requirements',
].join('\n');

test('replaceLinkSection: マーカー区間が置換され、区間外は不変(U2, ja)', () => {
  const url = 'https://foo.github.io/bar/';
  const result = replaceLinkSection(SAMPLE_JA, url, 'ja');
  assert.ok(result.includes(MARKER_LINE(url, 'ja')), '本文にURLを含む文言が挿入されること');
  // 区間外(マーカー行より前・より後)は変更されない
  assert.ok(result.startsWith('# Steam Game Shelf\n\n**デモを見る**'));
  assert.ok(result.endsWith('## 必要なもの'));
  assert.ok(result.includes('<!-- MY_LINKS_START -->'));
  assert.ok(result.includes('<!-- MY_LINKS_END -->'));
});

test('replaceLinkSection: マーカー区間が置換され、区間外は不変(U2, en)', () => {
  const url = 'https://foo.github.io/bar/';
  const result = replaceLinkSection(SAMPLE_EN, url, 'en');
  assert.ok(result.includes(MARKER_LINE(url, 'en')));
  assert.ok(result.startsWith('# Steam Game Shelf\n\n**See it live**'));
  assert.ok(result.endsWith('## Requirements'));
});

test('replaceLinkSection: マーカーが無い場合は null を返す(U2)', () => {
  const noMarker = '# Steam Game Shelf\n\n本文のみ、マーカー無し。\n';
  assert.equal(replaceLinkSection(noMarker, 'https://foo.github.io/bar/', 'ja'), null);
});

test('replaceLinkSection: 開始マーカーのみ・終了マーカーのみの壊れたケースも null(U2)', () => {
  const onlyStart = '# Title\n<!-- MY_LINKS_START -->\n本文\n';
  const onlyEnd = '# Title\n本文\n<!-- MY_LINKS_END -->\n';
  assert.equal(replaceLinkSection(onlyStart, 'https://foo.github.io/bar/', 'ja'), null);
  assert.equal(replaceLinkSection(onlyEnd, 'https://foo.github.io/bar/', 'ja'), null);
});

test('replaceLinkSection: 冪等性 — 置換結果にもう一度適用しても同一文字列(U3)', () => {
  const url = 'https://foo.github.io/bar/';
  const once = replaceLinkSection(SAMPLE_JA, url, 'ja');
  const twice = replaceLinkSection(once, url, 'ja');
  assert.equal(twice, once);
});

test('replaceLinkSection: 冪等性(en)(U3)', () => {
  const url = 'https://foo.github.io/bar/';
  const once = replaceLinkSection(SAMPLE_EN, url, 'en');
  const twice = replaceLinkSection(once, url, 'en');
  assert.equal(twice, once);
});

// ---- removeDemoSection ----

const SAMPLE_WITH_DEMO = [
  '# Steam Game Shelf',
  '',
  '<!-- DEMO_LINK_START -->',
  '**デモを見る**: [公開ページ](https://example.com/)',
  '<!-- DEMO_LINK_END -->',
  '',
  '## 必要なもの',
].join('\n');

test('removeDemoSection: マーカー区間(マーカー含む)が削除され、区間外は不変(U1)', () => {
  const result = removeDemoSection(SAMPLE_WITH_DEMO);
  assert.ok(!result.includes('DEMO_LINK_START'));
  assert.ok(!result.includes('DEMO_LINK_END'));
  assert.ok(!result.includes('デモを見る'));
  // 区間外(マーカーより前・より後)は変更されない
  assert.ok(result.startsWith('# Steam Game Shelf\n\n'));
  assert.ok(result.endsWith('\n\n## 必要なもの'));
});

test('removeDemoSection: 冪等 — 削除後に再適用しても同一文字列(U2)', () => {
  const once = removeDemoSection(SAMPLE_WITH_DEMO);
  const twice = removeDemoSection(once);
  assert.equal(twice, once);
});

test('removeDemoSection: マーカーが無い文字列は無変更(U2)', () => {
  const noMarker = '# Steam Game Shelf\n\n本文のみ、マーカー無し。\n';
  assert.equal(removeDemoSection(noMarker), noMarker);
});

test('removeDemoSection: 開始マーカーのみ・終了マーカーのみの壊れたケースも無変更', () => {
  const onlyStart = '# Title\n<!-- DEMO_LINK_START -->\n本文\n';
  const onlyEnd = '# Title\n本文\n<!-- DEMO_LINK_END -->\n';
  assert.equal(removeDemoSection(onlyStart), onlyStart);
  assert.equal(removeDemoSection(onlyEnd), onlyEnd);
});

// テスト内で期待する挿入文言の断片を作るヘルパー(実装の正確な文言はソース側で管理する)
function MARKER_LINE(url, lang) {
  return lang === 'en' ? `**Your site**: ${url}` : `**あなたのサイト**: ${url}`;
}
