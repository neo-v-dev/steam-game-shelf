// scripts/lib.mjs のユニットテスト。Node 20 標準の node:test + node:assert のみを使用する(依存追加なし)。
// 実行: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCatalog, buildPublicData, parseJsonc, fetchLocalizedName } from '../scripts/lib.mjs';

// ---- mergeCatalog ----

test('mergeCatalog: 既存ゲームの visible/played/show_playtime/name_ja/stream_url を引き継ぐ', () => {
  const fetched = [{ appid: 1, name: 'Game A', playtime_forever: 120 }];
  const prev = {
    games: [
      {
        appid: 1,
        name: 'Game A',
        visible: false,
        played: false, // プレイ時間>0だが手動でOFFにされている想定
        show_playtime: false,
        name_ja: 'ゲームA',
        stream_url: 'https://example.com/stream',
      },
    ],
  };
  const { games, newGames } = mergeCatalog(fetched, prev);
  assert.equal(games.length, 1);
  const g = games[0];
  assert.equal(g.visible, false);
  assert.equal(g.played, false);
  assert.equal(g.show_playtime, false);
  assert.equal(g.name_ja, 'ゲームA');
  assert.equal(g.stream_url, 'https://example.com/stream');
  assert.equal(newGames.length, 0);
});

test('mergeCatalog: 新規ゲームは defaultVisibility を適用し、played/show_playtime は自動判定・既定値になる', () => {
  const fetched = [{ appid: 2, name: 'Game B', playtime_forever: 0 }];
  const { games, newGames } = mergeCatalog(fetched, null, true);
  assert.equal(games.length, 1);
  assert.equal(games[0].visible, true);
  assert.equal(games[0].played, false); // playtime 0 -> 自動判定でfalse
  assert.equal(games[0].show_playtime, true);
  assert.ok(!('name_ja' in games[0]));
  assert.ok(!('stream_url' in games[0]));
  assert.equal(newGames.length, 1);
  assert.equal(newGames[0].appid, 2);
});

test('mergeCatalog: defaultVisibility=false かつ プレイ時間>0 の新規ゲームは非表示・played自動ON', () => {
  const fetched = [{ appid: 3, name: 'Game C', playtime_forever: 500 }];
  const { games } = mergeCatalog(fetched, null, false);
  assert.equal(games[0].visible, false);
  assert.equal(games[0].played, true);
});

test('mergeCatalog: 名前順(ロケール "en")でソートされる', () => {
  const fetched = [
    { appid: 1, name: 'Zelda', playtime_forever: 0 },
    { appid: 2, name: 'Apex Legends', playtime_forever: 0 },
  ];
  const { games } = mergeCatalog(fetched, null);
  assert.deepEqual(games.map((g) => g.appid), [2, 1]);
});

// ---- buildPublicData ----

test('buildPublicData: 選択的出力(name_ja同名除外・stream_url空除外・show_playtime falseのみ出力)', () => {
  const catalog = {
    fetched_at: '2026-01-01T00:00:00Z',
    games: [
      {
        appid: 1,
        name: 'A',
        name_ja: 'A', // 原題と同じなので出力から除外されるべき
        playtime_forever: 10,
        visible: true,
        played: false,
        show_playtime: true,
        stream_url: '',
      },
      {
        appid: 2,
        name: 'B',
        name_ja: 'ビー',
        playtime_forever: 20,
        visible: true,
        played: true,
        show_playtime: false,
        stream_url: 'https://example.com/y',
      },
      {
        appid: 3,
        name: 'C',
        playtime_forever: 0,
        visible: false, // 非表示ゲームは公開データに一切含めない
        played: false,
        show_playtime: true,
      },
    ],
  };
  const settings = { published: true, site_title: 'T' };
  const out = buildPublicData(catalog, settings, '2026-01-02T00:00:00Z');

  assert.equal(out.games.length, 2); // appid 3 は非表示のため除外
  assert.ok(!out.games.some((g) => g.appid === 3));

  const a = out.games.find((g) => g.appid === 1);
  assert.ok(!('name_ja' in a), 'name_ja が原題と同じ場合は出力しない');
  assert.ok(!('played' in a), 'played が false の場合は出力しない');
  assert.ok(!('stream_url' in a), 'stream_url が空の場合は出力しない');
  assert.ok(!('show_playtime' in a), 'show_playtime が既定値(true)の場合は出力しない');
  assert.ok(!('visible' in a), 'visible は公開データに含めない');

  const b = out.games.find((g) => g.appid === 2);
  assert.equal(b.name_ja, 'ビー');
  assert.equal(b.played, true);
  assert.equal(b.stream_url, 'https://example.com/y');
  assert.equal(b.show_playtime, false);
});

test('buildPublicData: settings.show_played が site.show_played に反映される(T6)', () => {
  const catalog = {
    games: [{ appid: 1, name: 'A', playtime_forever: 10, visible: true, played: true }],
  };

  const outUndefined = buildPublicData(catalog, { published: true }, 'now');
  assert.equal(outUndefined.site.show_played, true, 'show_played 未定義は true 扱い');
  assert.equal(outUndefined.games[0].played, true, 'played:true は show_played に関わらず出力される');

  const outFalse = buildPublicData(catalog, { published: true, show_played: false }, 'now');
  assert.equal(outFalse.site.show_played, false);
  assert.equal(outFalse.games[0].played, true, 'show_played=false でも games の played 出力は維持される');

  const outTrue = buildPublicData(catalog, { published: true, show_played: true }, 'now');
  assert.equal(outTrue.site.show_played, true);
});

test('buildPublicData: published / site 設定を正しく組み立てる', () => {
  const out = buildPublicData(
    { games: [] },
    { published: false, site_title: 'My Shelf', default_lang: 'en', channel_url: 'https://x' },
    '2026-01-01T00:00:00Z'
  );
  assert.equal(out.published, false);
  assert.equal(out.site.title, 'My Shelf');
  assert.equal(out.site.default_lang, 'en');
  assert.equal(out.site.channel_url, 'https://x');
  assert.equal(out.generated_at, '2026-01-01T00:00:00Z');
});

// ---- parseJsonc ----

test('parseJsonc: 行頭コメントは除去し、文字列内の // は保持する', () => {
  const text = [
    '{',
    '  // これはコメント行',
    '  "url": "https://example.com/x",',
    '  "n": 1',
    '}',
    '',
  ].join('\n');
  const parsed = parseJsonc(text);
  assert.equal(parsed.url, 'https://example.com/x');
  assert.equal(parsed.n, 1);
});

// ---- fetchLocalizedName ----

test('fetchLocalizedName: 成功時はローカライズ名を返す', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ '1': { success: true, data: { name: '日本語名' } } }),
  });
  const name = await fetchLocalizedName(1, 'japanese', fetchImpl);
  assert.equal(name, '日本語名');
});

test('fetchLocalizedName: success:false のときは null を返す', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ '1': { success: false } }),
  });
  const name = await fetchLocalizedName(1, 'japanese', fetchImpl);
  assert.equal(name, null);
});

test('fetchLocalizedName: 429 は rateLimited フラグ付きの例外を投げる', async () => {
  const fetchImpl = async () => ({ status: 429, ok: false });
  await assert.rejects(
    () => fetchLocalizedName(1, 'japanese', fetchImpl),
    (err) => err.rateLimited === true
  );
});
