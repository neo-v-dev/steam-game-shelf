// scripts/lib.mjs のユニットテスト。Node 20 標準の node:test + node:assert のみを使用する(依存追加なし)。
// 実行: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeCatalog,
  buildPublicData,
  parseJsonc,
  fetchAppInfo,
  fetchOwnedGames,
  normalizeStreamUrl,
} from '../scripts/lib.mjs';

// ---- fetchOwnedGames ----

test('fetchOwnedGames: 送信URLに skip_unvetted_apps=false が含まれる(U1)', async () => {
  let requestedUrl = null;
  const fetchImpl = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => ({ response: { games: [] } }),
    };
  };
  await fetchOwnedGames('key', '7656119', fetchImpl);
  assert.ok(requestedUrl, 'fetch が呼ばれること');
  const params = new URL(requestedUrl).searchParams;
  assert.equal(params.get('skip_unvetted_apps'), 'false');
});

// ---- mergeCatalog ----

test('mergeCatalog: 既存ゲームの visible/played/show_playtime/name_ja/image/stream_url を引き継ぐ', () => {
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
        image: 'https://example.com/header.jpg',
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
  assert.equal(g.image, 'https://example.com/header.jpg');
  assert.equal(g.stream_url, 'https://example.com/stream');
  assert.equal(newGames.length, 0);
});

test('mergeCatalog: prev に image キーが無ければ引き継がない(U2)', () => {
  const fetched = [{ appid: 1, name: 'Game A', playtime_forever: 120 }];
  const prev = { games: [{ appid: 1, name: 'Game A' }] };
  const { games } = mergeCatalog(fetched, prev);
  assert.ok(!('image' in games[0]), 'image キーが無い prev からは image キーを作らない');
});

test('mergeCatalog: prev の image が null(取得試行済みだが無し)でもキーごと引き継ぐ(U2)', () => {
  const fetched = [{ appid: 1, name: 'Game A', playtime_forever: 120 }];
  const prev = { games: [{ appid: 1, name: 'Game A', image: null }] };
  const { games } = mergeCatalog(fetched, prev);
  assert.ok('image' in games[0], 'image キー自体は維持する');
  assert.equal(games[0].image, null);
});

test('mergeCatalog: 新規ゲームは defaultVisibility を適用し、played/show_playtime は自動判定・既定値になる', () => {
  const fetched = [{ appid: 2, name: 'Game B', playtime_forever: 0 }];
  const { games, newGames } = mergeCatalog(fetched, null, true);
  assert.equal(games.length, 1);
  assert.equal(games[0].visible, true);
  assert.equal(games[0].played, false); // playtime 0 -> 自動判定でfalse
  assert.equal(games[0].show_playtime, true);
  assert.ok(!('name_ja' in games[0]));
  assert.ok(!('image' in games[0]));
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

// ---- normalizeStreamUrl(REQ-031, U1) ----

test('normalizeStreamUrl U1: 許可されるURL(YouTube/Twitchとそのサブドメイン、スキーム補完含む)', () => {
  assert.equal(
    normalizeStreamUrl('https://www.youtube.com/watch?v=x'),
    'https://www.youtube.com/watch?v=x'
  );
  assert.equal(normalizeStreamUrl('https://youtu.be/x'), 'https://youtu.be/x');
  assert.equal(normalizeStreamUrl('https://www.twitch.tv/x'), 'https://www.twitch.tv/x');
  assert.equal(normalizeStreamUrl('https://clips.twitch.tv/x'), 'https://clips.twitch.tv/x');
  // スキーム無しは https:// を補って許可(U1)
  assert.equal(normalizeStreamUrl('youtube.com/@ch'), 'https://youtube.com/@ch');
});

test('normalizeStreamUrl U1: 拒否されるURL(許可外ドメイン・危険スキーム・なりすましホスト・明示的http・空文字)', () => {
  assert.equal(normalizeStreamUrl('https://evil.com/x'), null);
  assert.equal(normalizeStreamUrl('javascript:alert(1)'), null);
  // youtube.com のサブドメインに見えるが実際は evil.com のサブドメイン(なりすまし)
  assert.equal(normalizeStreamUrl('https://youtube.com.evil.com/x'), null);
  // 明示的に http: を指定した場合は https:// への補完対象にせず、そのまま拒否する
  assert.equal(normalizeStreamUrl('http://www.youtube.com/x'), null);
  assert.equal(normalizeStreamUrl(''), null);
  assert.equal(normalizeStreamUrl('   '), null);
});

// ---- buildPublicData ----

test('buildPublicData: 選択的出力(name_ja同名除外・stream_url空除外・show_playtime falseのみ出力・image選択的出力)', () => {
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
        image: null, // 取得試行済みだが無し→出力しない(U3)
      },
      {
        appid: 2,
        name: 'B',
        name_ja: 'ビー',
        playtime_forever: 20,
        visible: true,
        played: true,
        show_playtime: false,
        // REQ-031: 許可ドメイン(Twitch)である必要があるため example.com から差し替え
        stream_url: 'https://www.twitch.tv/y',
        image: 'https://example.com/header.jpg', // truthy→出力(U3)
      },
      {
        appid: 3,
        name: 'C',
        playtime_forever: 0,
        visible: false, // 非表示ゲームは公開データに一切含めない
        played: false,
        show_playtime: true,
      },
      {
        appid: 4,
        name: 'D',
        playtime_forever: 0,
        visible: true,
        played: false,
        show_playtime: true,
        // image キー自体が無いケース(U3)
      },
    ],
  };
  const settings = { published: true, site_title: 'T' };
  const out = buildPublicData(catalog, settings, '2026-01-02T00:00:00Z');

  assert.equal(out.games.length, 3); // appid 3 は非表示のため除外
  assert.ok(!out.games.some((g) => g.appid === 3));

  const a = out.games.find((g) => g.appid === 1);
  assert.ok(!('name_ja' in a), 'name_ja が原題と同じ場合は出力しない');
  assert.ok(!('played' in a), 'played が false の場合は出力しない');
  assert.ok(!('stream_url' in a), 'stream_url が空の場合は出力しない');
  assert.ok(!('show_playtime' in a), 'show_playtime が既定値(true)の場合は出力しない');
  assert.ok(!('visible' in a), 'visible は公開データに含めない');
  assert.ok(!('image' in a), 'image が null の場合は出力しない(U3)');

  const b = out.games.find((g) => g.appid === 2);
  assert.equal(b.name_ja, 'ビー');
  assert.equal(b.played, true);
  assert.equal(b.stream_url, 'https://www.twitch.tv/y');
  assert.equal(b.show_playtime, false);
  assert.equal(b.image, 'https://example.com/header.jpg', 'image が truthy の場合は出力する(U3)');

  const d = out.games.find((g) => g.appid === 4);
  assert.ok(!('image' in d), 'image キーが無い場合も出力しない(U3)');
});

test('buildPublicData U2: 許可外 stream_url は stream_url キーなしで出力し、excluded に積む(REQ-031)', () => {
  const catalog = {
    games: [
      { appid: 1, name: 'Bad', playtime_forever: 0, visible: true, stream_url: 'https://evil.com/x' },
      { appid: 2, name: 'Good', playtime_forever: 0, visible: true, stream_url: 'https://youtu.be/y' },
    ],
  };
  const excluded = [];
  const out = buildPublicData(catalog, { published: true }, 'now', excluded);
  const bad = out.games.find((g) => g.appid === 1);
  const good = out.games.find((g) => g.appid === 2);
  assert.ok(!('stream_url' in bad), '許可外の stream_url はキーごと出力しない');
  assert.equal(good.stream_url, 'https://youtu.be/y');
  assert.deepEqual(
    excluded.filter((e) => e.field === 'stream_url'),
    [{ appid: 1, name: 'Bad', field: 'stream_url' }]
  );
});

test('buildPublicData U2: 許可外 channel_url は site.channel_url が空文字になり、excluded に積む(REQ-031)', () => {
  const excluded = [];
  const out = buildPublicData(
    { games: [] },
    { published: true, channel_url: 'https://evil.com/chan' },
    'now',
    excluded
  );
  assert.equal(out.site.channel_url, '');
  assert.deepEqual(
    excluded.filter((e) => e.field === 'channel_url'),
    [{ field: 'channel_url' }]
  );
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
  // channel_url は REQ-031 の許可ドメイン(YouTube/Twitch)である必要があるため、
  // このテストの本来の関心(site.* の組み立て)を保ったまま許可URLに差し替えている。
  const out = buildPublicData(
    { games: [] },
    { published: false, site_title: 'My Shelf', default_lang: 'en', channel_url: 'https://www.twitch.tv/x' },
    '2026-01-01T00:00:00Z'
  );
  assert.equal(out.published, false);
  assert.equal(out.site.title, 'My Shelf');
  assert.equal(out.site.default_lang, 'en');
  assert.equal(out.site.channel_url, 'https://www.twitch.tv/x');
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

// ---- fetchAppInfo(REQ-025, U1) ----

test('fetchAppInfo: 成功時は name と header_image から {name, image} を抽出する(U1)', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      '1': {
        success: true,
        data: { name: '日本語名', header_image: 'https://example.com/header_japanese.jpg' },
      },
    }),
  });
  const info = await fetchAppInfo(1, 'japanese', fetchImpl);
  assert.deepEqual(info, { name: '日本語名', image: 'https://example.com/header_japanese.jpg' });
});

test('fetchAppInfo: success:false のときは {name: null, image: null} を返す(U1)', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ '1': { success: false } }),
  });
  const info = await fetchAppInfo(1, 'japanese', fetchImpl);
  assert.deepEqual(info, { name: null, image: null });
});

test('fetchAppInfo: 429 は rateLimited フラグ付きの例外を投げる(既存挙動維持, U1)', async () => {
  const fetchImpl = async () => ({ status: 429, ok: false });
  await assert.rejects(
    () => fetchAppInfo(1, 'japanese', fetchImpl),
    (err) => err.rateLimited === true
  );
});

// ---- ソート回帰(REQ-022, U3) ----
// app.js / admin.js の displayName + localeCompare('ja') をそのまま再現する(実装変更なし、design.md指定)。
// displayName: 日本語表示時は name_ja(邦題)があればそれを、なければ name(原題)を使う。
function displayNameJa(g) {
  return g.name_ja ? g.name_ja : g.name;
}
function sortByDisplayNameJa(games) {
  return [...games].sort((a, b) => displayNameJa(a).localeCompare(displayNameJa(b), 'ja'));
}

test('ソート回帰: 邦題優先(name_ja があればそちらで比較に使う)', () => {
  // 'Beta' という原題どうしの2本だが、一方だけ邦題 'あ' を持つ。原題だけで比較すれば Alpha<Beta の順だが、
  // 邦題優先なら 'あ' が比較対象になり、Zoo(原題のみ, 'Z')より後ろに来るはず(ja 照合で確認)。
  const games = [
    { name: 'Zoo' },
    { name: 'Beta', name_ja: 'あ' }, // 邦題があるので比較には 'あ' が使われるべき
  ];
  const sorted = sortByDisplayNameJa(games);
  assert.deepEqual(
    sorted.map((g) => g.name),
    ['Zoo', 'Beta'],
    '邦題 "あ" が比較に使われ、ja 照合で "Zoo" より後ろになる(原題 "Beta" を使うなら Beta が先頭のはず)'
  );
});

test('ソート回帰: 日本語照合(Intl.Collator/localeCompare "ja")を用いる(U3データセット)', () => {
  // work package (docs/packages/req-019-024-feedback-and-fixes.md) の U3 記載データセット。
  const games = [
    { name: 'Zebra' },
    { name: 'Apple', name_ja: 'あっぷる' },
    { name: 'Kanji', name_ja: '漢字' },
  ];
  const sorted = sortByDisplayNameJa(games).map((g) => displayNameJa(g));

  // 実測(このNode環境, ICU78.3, full-icu)では 'Zebra'.localeCompare('あっぷる','ja') === -1 であり、
  // ラテン文字はひらがな/漢字より前に並ぶ(Intl.Collator('ja').resolvedOptions().collation は 'default')。
  // これは複数のロケール変種(ja / ja-JP / ja-u-co-unihan / ja-u-co-phonebk / ja-u-kr-jpan-latn 等)でも
  // 再現し、Node固有の挙動ではない(ブラウザ同様ICU/CLDRの標準実装)。
  // 一方、work package の受け入れ基準 U3 は「'あっぷる' が 'Zebra' より前に来ること」を要求しており、
  // 実装変更なし(displayName + localeCompare('ja'))という REQ-022 の前提のもとでは両立しない。
  // → 詳細は報告書の「発見した注意点・罠」「暫定判断」を参照。ここでは実測される真の挙動を固定する。
  assert.deepEqual(sorted, ['Zebra', 'あっぷる', '漢字']);
});
