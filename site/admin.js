// 表示設定の管理ページ。
// GitHub API 経由で data/catalog.json(表示/プレイ済み/時間表示/配信URL)と
// config/settings.jsonc(サイト名・初期言語・プレイ時間表示・チャンネルURL・公開状態)を編集し、
// そのままコミットする。トークンはこのブラウザの localStorage にのみ保存され、
// api.github.com 以外には一切送信されない。
// 読み込み時にトークンの有効性と書き込み権限を検証してから catalog を取得する(admin-core.mjs)。
// ?demo=1 を付けるとサンプルデータで操作感を試せる(保存は無効)。

import {
  parseJsonc,
  setJsoncValue,
  encodeContent,
  decodeContent,
  verifyToken,
  actionsUrl,
  normalizeStreamUrl,
} from './admin-core.mjs';

const I18N = {
  ja: {
    subtitle: 'ゲームごとの表示設定とサイト設定を編集できます',
    setup_title: '接続',
    setup_help:
      'このページはあなた(リポジトリの所有者)専用です。編集にはアクセストークンが必要なので、第三者は閲覧できても保存はできません。',
    label_repo: 'リポジトリ (owner/repository)',
    label_token: 'アクセストークン',
    token_help:
      'GitHub の Settings → Developer settings → Fine-grained personal access tokens で作成。対象をこのリポジトリのみに限定し、権限は Contents: Read and write だけを付与してください。トークンはこのブラウザ内にのみ保存されます。',
    load: '読み込む',
    loading: '読み込み中…',
    loading_verify: 'トークンを検証しています…',
    loading_fetch: 'データを読み込んでいます…',
    open_actions: 'Actions を開く',
    settings_title: 'サイト設定',
    label_site_title: 'サイト名',
    label_default_lang: '初期表示言語',
    group_display_items: 'カードの表示項目',
    help_display_items:
      'それぞれOFFにすると、カードだけでなく上部の統計や絞り込みにも反映されます(プレイ時間: 統計の合計時間表示。プレイ済み: 「プレイ済み/未プレイ」絞り込み)。ゲームごとの値は保持され、ONに戻すと元どおり反映されます。',
    label_show_playtime: 'プレイ時間を表示(サイト全体)',
    label_show_played: 'プレイ済みタグを表示(サイト全体)',
    label_show_last_played: '最終プレイ日を表示(サイト全体)',
    label_show_developer: '開発元を表示(サイト全体)',
    label_channel_url: 'チャンネルURL(ページ上部にリンク表示)',
    editor_title: 'ゲームの表示設定',
    view_list: 'リスト',
    view_cards: 'カード',
    search_placeholder: 'ゲーム名で絞り込み…',
    sort_name: '名前順',
    sort_playtime: 'プレイ時間順',
    sort_last_played: '最近プレイした順',
    sort_developer: '開発元順',
    sort_publisher: '販売元順',
    sort_release_date: '発売日順',
    counts: (visible, total) => `${total} 本中 ${visible} 本を表示 / ${total - visible} 本を非表示`,
    counts_cards_hint: 'カードをクリックで表示/非表示を切り替え',
    tag_played: 'プレイ済み',
    tag_show_playtime: '時間表示',
    playtime: (h) => `${h.toLocaleString('ja-JP')} 時間`,
    playtime_none: '未プレイ',
    last_played: (d) => `最終プレイ: ${d}`,
    developer: (d) => `開発元: ${d}`,
    release_date: (d) => `発売日: ${d}`,
    stream_placeholder: '配信/動画URL(任意)',
    hidden_label: '非表示',
    label_published: 'サイトを公開する',
    save: '保存してサイトに反映',
    saving: '保存中…',
    saved: '保存しました。1〜2分ほどでサイトに反映されます。',
    demo_notice: 'デモモードです。操作は試せますが保存はされません。',
    back: '← サイトに戻る',
    err_no_repo: 'リポジトリを owner/repository の形式で入力してください。',
    err_no_token: 'アクセストークンを入力してください。',
    err_auth: 'トークンが無効か権限が不足しています。トークンと権限(Contents: Read and write)を確認してください。',
    err_token_invalid:
      'アクセストークンが無効です。コピーが途中で切れていないか確認し、貼り直してください。',
    err_no_write:
      'このトークンには書き込み権限がありません。Fine-grained PAT の Contents 権限を「Read and write」に設定してください。',
    err_rate_limit: 'GitHub API のレート制限に達しました。しばらく待ってから再度お試しください。',
    err_repo_not_found:
      'リポジトリが見つかりません。「owner/repository」の綴りと、トークンの対象リポジトリ設定を確認してください。',
    err_no_catalog:
      'data/catalog.json が見つかりません。先に GitHub の Actions タブから「Update game list」を実行して、ゲームリストを取得してください。',
    err_load: (msg) => `読み込みに失敗しました: ${msg}`,
    err_save: (msg) => `保存に失敗しました: ${msg}`,
    err_conflict:
      '保存中に他の更新(自動更新など)と競合しました。もう一度「読み込む」からやり直してください。',
    // REQ-031: 許可外URL(stream_url / channel_url)を保存しようとしたときのエラー
    channel_url_name: 'チャンネルURL',
    err_bad_url: (targets) => `YouTube / Twitch / niconico のURLのみ設定できます: ${targets.join('、')}`,
    hours: (h) => `${h} 時間`,
  },
  en: {
    subtitle: 'Manage per-game display settings and site settings',
    setup_title: 'Connect',
    setup_help:
      'This page is for you (the repository owner). Saving requires an access token, so visitors can view this page but cannot change anything.',
    label_repo: 'Repository (owner/repository)',
    label_token: 'Access token',
    token_help:
      'Create one at GitHub Settings → Developer settings → Fine-grained personal access tokens. Limit it to this repository only, with the Contents: Read and write permission. The token is stored only in this browser.',
    load: 'Load',
    loading: 'Loading…',
    loading_verify: 'Verifying token…',
    loading_fetch: 'Loading data…',
    open_actions: 'Open Actions',
    settings_title: 'Site settings',
    label_site_title: 'Site title',
    label_default_lang: 'Default language',
    group_display_items: 'Card display items',
    help_display_items:
      'Turning either of these off affects more than the cards — it also changes the stats bar and the played/not-played filter at the top (playtime: the total-hours stat; played: the played/not-played filter). Per-game values are preserved and take effect again when turned back on.',
    label_show_playtime: 'Show playtime (site-wide)',
    label_show_played: 'Show played tag (site-wide)',
    label_show_last_played: 'Show last played date (site-wide)',
    label_show_developer: 'Show developer (site-wide)',
    label_channel_url: 'Channel URL (shown at the top of the page)',
    editor_title: 'Game visibility',
    view_list: 'List',
    view_cards: 'Cards',
    search_placeholder: 'Filter by title…',
    sort_name: 'Name',
    sort_playtime: 'Playtime',
    sort_last_played: 'Recently played',
    sort_developer: 'Developer',
    sort_publisher: 'Publisher',
    sort_release_date: 'Release date',
    counts: (visible, total) => `${visible} of ${total} shown / ${total - visible} hidden`,
    counts_cards_hint: 'Click a card to toggle visibility.',
    tag_played: 'Played',
    tag_show_playtime: 'Playtime',
    playtime: (h) => `${h.toLocaleString('en-US')} hrs`,
    playtime_none: 'Not played',
    last_played: (d) => `Last played: ${d}`,
    developer: (d) => `Developer: ${d}`,
    release_date: (d) => `Released: ${d}`,
    stream_placeholder: 'Stream/video URL (optional)',
    hidden_label: 'Hidden',
    label_published: 'Publish the site',
    save: 'Save & update site',
    saving: 'Saving…',
    saved: 'Saved. The site will update in a minute or two.',
    demo_notice: 'Demo mode: you can try the UI but nothing is saved.',
    back: '← Back to site',
    err_no_repo: 'Enter the repository as owner/repository.',
    err_no_token: 'Enter your access token.',
    err_auth: 'The token is invalid or lacks permission. Check the token and its Contents: Read and write permission.',
    err_token_invalid:
      "The access token is invalid. Check that it wasn't cut off when copying, and paste it again.",
    err_no_write:
      'This token does not have write access. Set the Contents permission to "Read and write" on your fine-grained PAT.',
    err_rate_limit: 'GitHub API rate limit reached. Please wait and try again.',
    err_repo_not_found:
      'Repository not found. Check the "owner/repository" spelling and that the token is scoped to this repository.',
    err_no_catalog:
      'data/catalog.json not found. Run the "Update game list" workflow from the Actions tab first.',
    err_load: (msg) => `Failed to load: ${msg}`,
    err_save: (msg) => `Failed to save: ${msg}`,
    err_conflict:
      'Your save conflicted with another update (e.g. the daily refresh). Please load again and retry.',
    // REQ-031: shown when trying to save a stream_url / channel_url outside the allowed domains
    channel_url_name: 'channel URL',
    err_bad_url: (targets) => `Only YouTube / Twitch / niconico URLs are allowed: ${targets.join(', ')}`,
    hours: (h) => `${h} hrs`,
  },
};

const DEMO = new URLSearchParams(location.search).has('demo');

const state = {
  lang: 'ja',
  view: 'cards',         // 'list' | 'cards'(初期値はカード。REQ-013)
  games: [],            // catalog の games(visible / played / show_playtime / stream_url を編集する)
  catalogRaw: null,     // fetched_at 等を保持するための元オブジェクト
  catalogSha: null,
  settingsText: null,   // settings.jsonc の原文(コメント保持のため)
  settings: {},         // パース済みの設定値
  settingsSha: null,
  published: false,
  query: '',
  sort: 'name',         // 'name' | 'playtime' | 'last_played' | 'release_date' | 'developer' | 'publisher'(REQ-023、初期は名前順)
  // developer/publisher ソート時の同値タイブレークに使う二次ソート(REQ-037)。
  // ソート変更時、新しい値が developer/publisher 以外ならここも追従して更新する。
  sortSecondary: 'name',
  loaded: false,
};

const $ = (id) => document.getElementById(id);
const t = () => I18N[state.lang];

// ---- GitHub API ----

function repoParts() {
  const v = $('repo-input').value.trim();
  const m = v.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

async function api(path, options = {}) {
  const { owner, repo } = repoParts();
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${$('token-input').value.trim()}`,
      ...(options.headers ?? {}),
    },
  });
  return res;
}

async function getFile(path) {
  const res = await api(`contents/${path}`);
  if (res.status === 401 || res.status === 403) throw new Error(t().err_auth);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { text: decodeContent(data.content), sha: data.sha };
}

async function putFile(path, text, sha, message) {
  const res = await api(`contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: encodeContent(text), sha }),
  });
  if (res.status === 409 || res.status === 422) throw new Error(t().err_conflict);
  if (res.status === 401 || res.status === 403) throw new Error(t().err_auth);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).content.sha;
}

// ---- 読み込み / 保存 ----

function detectRepo() {
  // xxx.github.io/repo/ の形式なら owner/repo を自動推定する
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
  const seg = location.pathname.split('/').filter(Boolean);
  if (m && seg.length > 0) return `${m[1]}/${seg[0]}`;
  return '';
}

function applySettingsToInputs() {
  const s = state.settings;
  $('set-site-title').value = s.site_title ?? '';
  $('set-default-lang').value = s.default_lang === 'en' ? 'en' : 'ja';
  $('set-show-playtime').checked = s.show_playtime !== false;
  $('set-show-played').checked = s.show_played !== false;
  $('set-show-last-played').checked = s.show_last_played !== false;
  $('set-show-developer').checked = s.show_developer !== false;
  $('set-channel-url').value = s.channel_url ?? '';
  $('published-toggle').checked = state.published;
}

async function load() {
  // load() フロー中のメッセージは全て setup-status 側に出す(REQ-019。保存系は既存 #status のまま)
  setSetupStatus('');
  if (DEMO) {
    loadDemo();
    return;
  }
  if (!repoParts()) return setSetupStatus(t().err_no_repo, true);
  if (!$('token-input').value.trim()) return setSetupStatus(t().err_no_token, true);

  $('load-button').disabled = true;
  $('load-button').textContent = t().loading;
  try {
    // catalog を取得する前にトークンの有効性と書き込み権限を検証する(REQ-016)。
    // 保存時まで発覚しない現状UIの是正のため、ここで通らなければ中断する。
    const { owner, repo } = repoParts();
    const token = $('token-input').value.trim();
    setSetupStatus(t().loading_verify);
    const verify = await verifyToken(fetch, owner, repo, token);
    if (!verify.ok) {
      const messages = {
        invalid_token: t().err_token_invalid,
        not_found: t().err_repo_not_found,
        rate_limit: t().err_rate_limit,
        no_write: t().err_no_write,
      };
      setSetupStatus(messages[verify.reason] ?? t().err_auth, true);
      return;
    }

    setSetupStatus(t().loading_fetch);
    const catalog = await getFile('data/catalog.json');
    if (!catalog) {
      // Update game list が未実行のケース: Actions への導線を添える(REQ-019)
      setSetupStatus(t().err_no_catalog, true, actionsUrl(owner, repo));
      return;
    }
    const settings = await getFile('config/settings.jsonc');

    state.catalogRaw = JSON.parse(catalog.text);
    state.games = state.catalogRaw.games ?? [];
    state.catalogSha = catalog.sha;
    state.settingsText = settings?.text ?? null;
    state.settingsSha = settings?.sha ?? null;
    state.settings = state.settingsText ? parseJsonc(state.settingsText) : {};
    state.published = state.settings.published === true;
    state.loaded = true;

    try {
      localStorage.setItem('admin_repo', $('repo-input').value.trim());
      localStorage.setItem('admin_token', $('token-input').value.trim());
    } catch {}

    $('settings-card').hidden = state.settingsText === null;
    $('editor').hidden = false;
    applySettingsToInputs();
    render();
    setSetupStatus('');
  } catch (err) {
    console.error(err);
    setSetupStatus(t().err_load(err.message), true);
  } finally {
    $('load-button').disabled = false;
    $('load-button').textContent = t().load;
  }
}

function collectSettingsChanges() {
  // 入力欄の現在値と読み込み時の値を比べ、変更のあったキーだけ返す
  const changes = {};
  const s = state.settings;
  const title = $('set-site-title').value.trim();
  if (title && title !== (s.site_title ?? '')) changes.site_title = title;
  const lang = $('set-default-lang').value;
  if (lang !== (s.default_lang === 'en' ? 'en' : 'ja')) changes.default_lang = lang;
  const showPlaytime = $('set-show-playtime').checked;
  if (showPlaytime !== (s.show_playtime !== false)) changes.show_playtime = showPlaytime;
  const showPlayed = $('set-show-played').checked;
  if (showPlayed !== (s.show_played !== false)) changes.show_played = showPlayed;
  const showLastPlayed = $('set-show-last-played').checked;
  if (showLastPlayed !== (s.show_last_played !== false)) changes.show_last_played = showLastPlayed;
  const showDeveloper = $('set-show-developer').checked;
  if (showDeveloper !== (s.show_developer !== false)) changes.show_developer = showDeveloper;
  const channel = $('set-channel-url').value.trim();
  if (channel !== (s.channel_url ?? '')) changes.channel_url = channel;
  if ($('published-toggle').checked !== (s.published === true))
    changes.published = $('published-toggle').checked;
  return changes;
}

async function save() {
  setStatus('');
  // 保存前にURL検証(REQ-031)。デモモードでもここまでは実行し、
  // 検証メッセージの動作を試せるようにする(実際の保存はDEMO分岐でスキップされる)。
  const badTargets = [];
  for (const g of state.games) {
    // 空の配信URLはキーごと削除してカタログを汚さない
    if (typeof g.stream_url === 'string') g.stream_url = g.stream_url.trim();
    if (!g.stream_url) {
      delete g.stream_url;
      continue;
    }
    const normalized = normalizeStreamUrl(g.stream_url);
    if (normalized) {
      g.stream_url = normalized;
    } else {
      badTargets.push(displayName(g));
    }
  }
  const channelInput = $('set-channel-url').value.trim();
  if (channelInput) {
    const normalizedChannel = normalizeStreamUrl(channelInput);
    if (normalizedChannel) {
      $('set-channel-url').value = normalizedChannel;
    } else {
      badTargets.push(t().channel_url_name);
    }
  }
  if (badTargets.length > 0) {
    setStatus(t().err_bad_url(badTargets), true);
    return;
  }
  // 正規化結果(https補完済み)を表示にも反映する
  if (state.loaded) renderGames();

  if (DEMO) {
    setStatus(t().demo_notice);
    return;
  }
  $('save-button').disabled = true;
  $('save-button').textContent = t().saving;
  try {
    const catalogText =
      JSON.stringify({ ...state.catalogRaw, games: state.games }, null, 2) + '\n';
    state.catalogSha = await putFile(
      'data/catalog.json',
      catalogText,
      state.catalogSha,
      'Update game display settings (admin page)'
    );

    if (state.settingsText !== null) {
      const changes = collectSettingsChanges();
      if (Object.keys(changes).length > 0) {
        let newText = state.settingsText;
        for (const [key, value] of Object.entries(changes)) {
          newText = setJsoncValue(newText, key, value);
        }
        state.settingsSha = await putFile(
          'config/settings.jsonc',
          newText,
          state.settingsSha,
          'Update site settings (admin page)'
        );
        state.settingsText = newText;
        state.settings = parseJsonc(newText);
        state.published = state.settings.published === true;
      }
    }
    setStatus(t().saved);
  } catch (err) {
    console.error(err);
    setStatus(t().err_save(err.message), true);
  } finally {
    $('save-button').disabled = false;
    $('save-button').textContent = t().save;
  }
}

function loadDemo() {
  state.catalogRaw = { fetched_at: new Date().toISOString() };
  state.games = [
    { appid: 570, name: 'Dota 2', playtime_forever: 12345, rtime_last_played: 1753574400, visible: true, played: true, show_playtime: true, developer: 'Valve', publisher: 'Valve', release_date: '2013年7月10日', release_ts: 1373414400 },
    { appid: 730, name: 'Counter-Strike 2', playtime_forever: 3456, rtime_last_played: 1753488000, visible: true, played: true, show_playtime: false, developer: 'Valve', publisher: 'Valve', release_date: '2023年9月27日', release_ts: 1695772800 },
    { appid: 1245620, name: 'ELDEN RING', playtime_forever: 9021, rtime_last_played: 1752969600, visible: true, played: true, show_playtime: true, stream_url: 'https://www.youtube.com/watch?v=demo', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/header.jpg?t=1784684281', developer: 'FromSoftware, Inc.', publisher: 'Bandai Namco Entertainment', release_date: '2022年2月24日', release_ts: 1645660800 },
    { appid: 1086940, name: "Baldur's Gate 3", name_ja: 'バルダーズ・ゲート3', playtime_forever: 6000, rtime_last_played: 1751328000, visible: true, played: false, show_playtime: true, developer: 'Larian Studios', publisher: 'Larian Studios', release_date: '2023年8月4日', release_ts: 1691107200 },
    { appid: 413150, name: 'Stardew Valley', name_ja: 'スターデューバレー', playtime_forever: 200, rtime_last_played: 1748736000, visible: false, played: false, show_playtime: true, developer: 'ConcernedApe', publisher: 'ConcernedApe', release_date: '2016年2月26日', release_ts: 1456444800 },
    { appid: 1145360, name: 'Hades', name_ja: 'ハデス', playtime_forever: 4100, rtime_last_played: 1752278400, visible: true, played: true, show_playtime: true, developer: 'Supergiant Games', publisher: 'Supergiant Games', release_date: '2020年9月17日', release_ts: 1600300800 },
    // REQ-037検証用: developer/publisher が同じ Valve のゲームを複数(発売日順で並びが変わることを確認するため)
    { appid: 620, name: 'Portal 2', playtime_forever: 0, rtime_last_played: 0, visible: true, played: false, show_playtime: true, developer: 'Valve', publisher: 'Valve', release_date: '2011年4月19日', release_ts: 1303171200 },
    { appid: 220, name: 'Half-Life 2', playtime_forever: 890, rtime_last_played: 1745020800, visible: true, played: true, show_playtime: true, developer: 'Valve', publisher: 'Valve', release_date: '2004年11月16日', release_ts: 1100563200 },
    // 画像フォールバック確認用(存在しない appid): header/header_japanese/capsule すべて404→プレースホルダー(REQ-021)
    { appid: 99999999, name: 'Unknown Game (no artwork)', playtime_forever: 0, rtime_last_played: 0, visible: true, played: false, show_playtime: true },
  ];
  state.settings = {
    site_title: 'Demo Game Shelf',
    default_lang: 'ja',
    show_playtime: true,
    show_played: true,
    show_last_played: true,
    show_developer: true,
    channel_url: 'https://www.youtube.com/@demo',
    published: true,
  };
  state.settingsText = '';
  state.published = true;
  state.loaded = true;
  $('settings-card').hidden = false;
  $('editor').hidden = false;
  applySettingsToInputs();
  render();
  setStatus(t().demo_notice);
}

// ---- 描画 ----

function displayName(g) {
  return state.lang === 'ja' && g.name_ja ? g.name_ja : g.name;
}

// サムネイル候補チェーン(REQ-021)。ja: header_japanese→header→capsule_616x353 / en: header→capsule_616x353
function headerImageUrls(appid) {
  const base = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}`;
  const files =
    state.lang === 'ja'
      ? ['header_japanese.jpg', 'header.jpg', 'capsule_616x353.jpg']
      : ['header.jpg', 'capsule_616x353.jpg'];
  return files.map((f) => `${base}/${f}`);
}

// 画像候補チェーン(REQ-025)。新CDN(ハッシュ付きURL)の g.image をキャッシュ済みなら先頭に挿入する。
// ja: [g.image, ...従来チェーン] / en: [g.image の 'header_japanese'→'header' 置換(変化時のみ), g.image, ...従来チェーン]
// g.image が無いゲームは従来どおり。
function imageCandidateUrls(g) {
  const fallback = headerImageUrls(g.appid);
  if (!g.image) return fallback;
  if (state.lang !== 'ja') {
    const replaced = g.image.replace('header_japanese', 'header');
    const enCandidates = replaced !== g.image ? [replaced, g.image] : [g.image];
    return [...enCandidates, ...fallback];
  }
  return [g.image, ...fallback];
}

function formatLastPlayed(epochSeconds) {
  // 公開ページと違い、テスト・実装ともに扱いやすい固定書式(YYYY/M/D)を使う
  const d = new Date(epochSeconds * 1000);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// 発売日の表示整形(REQ-036)。release_ts があれば閲覧者(操作者)ロケールで整形、無ければ原文字列。
function formatReleaseDate(g) {
  if (g.release_ts) {
    const locale = state.lang === 'ja' ? 'ja-JP' : 'en-US';
    return new Date(g.release_ts * 1000).toLocaleDateString(locale);
  }
  return g.release_date;
}

// 発売日順の比較関数(REQ-036)。release_ts 降順、値なしは末尾。
function compareByReleaseTs(a, b) {
  const av = a.release_ts;
  const bv = b.release_ts;
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return bv - av;
}

// state.sortSecondary に対応する比較関数を返す(REQ-037)。
// developer/publisher は二次ソートの値になり得ない(sortSecondary 更新時に除外されるため)。
// 未設定・想定外の値の場合は名前順にフォールバックする。
function secondaryCompare(locale) {
  switch (state.sortSecondary) {
    case 'playtime':
      return (a, b) => b.playtime_forever - a.playtime_forever;
    case 'last_played':
      return (a, b) => (b.rtime_last_played ?? 0) - (a.rtime_last_played ?? 0);
    case 'release_date':
      return compareByReleaseTs;
    default:
      return (a, b) => displayName(a).localeCompare(displayName(b), locale);
  }
}

// developer/publisher などの任意項目で並べる比較関数(REQ-035)。値が無いゲームは常に末尾。
// 同値(開発元/販売元が同じ、または両方値なし)の場合は sortSecondary の比較関数で決着させる(REQ-037)。
function compareByField(field, locale) {
  const secondary = secondaryCompare(locale);
  return (a, b) => {
    const av = a[field] || '';
    const bv = b[field] || '';
    if (!av && !bv) return secondary(a, b);
    if (!av) return 1;
    if (!bv) return -1;
    const primary = av.localeCompare(bv, locale);
    return primary !== 0 ? primary : secondary(a, b);
  };
}

function filteredGames() {
  const q = state.query.trim().toLowerCase();
  const games = state.games.filter(
    (g) =>
      g.name.toLowerCase().includes(q) ||
      (g.name_ja && g.name_ja.toLowerCase().includes(q))
  );
  // ソート(REQ-023: 公開ページと同ロジック。名前=displayName+ja/en照合、プレイ時間・最終プレイは降順)
  const locale = state.lang === 'ja' ? 'ja' : 'en';
  switch (state.sort) {
    case 'playtime':
      games.sort((a, b) => b.playtime_forever - a.playtime_forever);
      break;
    case 'last_played':
      games.sort((a, b) => (b.rtime_last_played ?? 0) - (a.rtime_last_played ?? 0));
      break;
    case 'release_date':
      games.sort(compareByReleaseTs);
      break;
    case 'developer':
      games.sort(compareByField('developer', locale));
      break;
    case 'publisher':
      games.sort(compareByField('publisher', locale));
      break;
    default:
      games.sort((a, b) => displayName(a).localeCompare(displayName(b), locale));
  }
  return games;
}

function setStatus(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

// 接続セクション(#setup)専用のステータス表示(REQ-019)。
// actionsHref を渡すと「Actions を開く」リンクボタンを表示する(catalog 未取得時)。
function setSetupStatus(msg, isError = false, actionsHref = null) {
  const el = $('setup-status');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  const link = $('setup-actions-link');
  if (actionsHref) {
    link.href = actionsHref;
    link.textContent = t().open_actions;
    link.hidden = false;
  } else {
    link.hidden = true;
  }
}

function makeChip(label, isOn, onToggle, isEnabled) {
  // isEnabled が false を返す間は操作不可(サイト設定の全体スイッチOFF, REQ-018)
  const enabled = () => !isEnabled || isEnabled();
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'tag-chip' + (isOn() ? ' on' : '') + (enabled() ? '' : ' locked');
  chip.textContent = label;
  chip.addEventListener('click', (e) => {
    // 行全体が label / カード全体がクリック対象のため、伝播を止める
    e.preventDefault();
    e.stopPropagation();
    if (!enabled()) return;
    onToggle();
    chip.classList.toggle('on', isOn());
  });
  return chip;
}

function makeStreamInput(g) {
  const input = document.createElement('input');
  input.type = 'url';
  input.className = 'stream-input' + (g.stream_url ? ' filled' : '');
  input.placeholder = t().stream_placeholder;
  input.value = g.stream_url ?? '';
  input.spellcheck = false;
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('input', () => {
    g.stream_url = input.value;
    input.classList.toggle('filled', !!input.value.trim());
  });
  return input;
}

function renderList() {
  const list = $('game-list');
  list.innerHTML = '';
  for (const g of filteredGames()) {
    const row = document.createElement('label');
    row.className = 'admin-row' + (g.visible ? '' : ' hidden-game');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = g.visible;
    checkbox.addEventListener('change', () => {
      g.visible = checkbox.checked;
      row.classList.toggle('hidden-game', !g.visible);
      renderCounts();
    });
    row.appendChild(checkbox);

    const name = document.createElement('span');
    name.className = 'admin-row-name';
    name.textContent = displayName(g);
    row.appendChild(name);

    row.appendChild(
      makeChip(
        t().tag_played,
        () => g.played,
        () => (g.played = !g.played),
        () => $('set-show-played').checked
      )
    );
    row.appendChild(
      makeChip(
        t().tag_show_playtime,
        () => g.show_playtime !== false,
        () => (g.show_playtime = g.show_playtime === false),
        () => $('set-show-playtime').checked
      )
    );
    row.appendChild(makeStreamInput(g));

    const meta = document.createElement('span');
    meta.className = 'admin-row-meta';
    // 最終プレイ日を追加(REQ-024。rtime_last_played=0 は省略)
    const metaParts = [];
    if (g.playtime_forever > 0) metaParts.push(t().hours(Math.round(g.playtime_forever / 6) / 10));
    if (g.rtime_last_played > 0) metaParts.push(t().last_played(formatLastPlayed(g.rtime_last_played)));
    if (g.release_date) metaParts.push(t().release_date(formatReleaseDate(g)));
    if (g.developer) metaParts.push(t().developer(g.developer));
    metaParts.push(g.appid);
    meta.textContent = metaParts.join(' · ');
    row.appendChild(meta);

    list.appendChild(row);
  }
}

function renderCards() {
  const grid = $('game-cards');
  grid.innerHTML = '';
  for (const g of filteredGames()) {
    const card = document.createElement('div');
    card.className = 'card' + (g.visible ? '' : ' off');

    const img = document.createElement('img');
    img.className = 'card-image';
    img.loading = 'lazy';
    img.alt = g.name;
    const imgCandidates = imageCandidateUrls(g);
    let imgIndex = 0;
    img.src = imgCandidates[imgIndex];
    img.onerror = () => {
      imgIndex += 1;
      if (imgIndex < imgCandidates.length) {
        img.src = imgCandidates[imgIndex];
      } else {
        img.remove();
        card.classList.add('no-image');
      }
    };
    card.appendChild(img);

    const hiddenLabel = document.createElement('span');
    hiddenLabel.className = 'card-hidden-label';
    hiddenLabel.textContent = t().hidden_label;
    hiddenLabel.hidden = g.visible;
    card.appendChild(hiddenLabel);

    const body = document.createElement('div');
    body.className = 'card-body';

    const name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = displayName(g);
    body.appendChild(name);

    // プレイ時間+最終プレイ日(REQ-024。未プレイは「未プレイ」、rtime_last_played=0 は省略)
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    const playtimeSpan = document.createElement('span');
    playtimeSpan.textContent =
      g.playtime_forever > 0
        ? t().playtime(Math.round((g.playtime_forever / 60) * 10) / 10)
        : t().playtime_none;
    meta.appendChild(playtimeSpan);
    if (g.rtime_last_played > 0) {
      const lastPlayedSpan = document.createElement('span');
      lastPlayedSpan.textContent = t().last_played(formatLastPlayed(g.rtime_last_played));
      meta.appendChild(lastPlayedSpan);
    }
    if (g.release_date) {
      const releaseDateSpan = document.createElement('span');
      releaseDateSpan.textContent = t().release_date(formatReleaseDate(g));
      meta.appendChild(releaseDateSpan);
    }
    if (g.developer) {
      const developerSpan = document.createElement('span');
      developerSpan.textContent = t().developer(g.developer);
      meta.appendChild(developerSpan);
    }
    body.appendChild(meta);

    const chips = document.createElement('div');
    chips.className = 'admin-card-chips';
    chips.appendChild(
      makeChip(
        t().tag_played,
        () => g.played,
        () => (g.played = !g.played),
        () => $('set-show-played').checked
      )
    );
    chips.appendChild(
      makeChip(
        t().tag_show_playtime,
        () => g.show_playtime !== false,
        () => (g.show_playtime = g.show_playtime === false),
        () => $('set-show-playtime').checked
      )
    );
    body.appendChild(chips);

    const stream = document.createElement('div');
    stream.className = 'admin-card-stream';
    stream.appendChild(makeStreamInput(g));
    body.appendChild(stream);

    card.appendChild(body);

    // カードのクリック(チップ・入力欄以外)で表示/非表示を切り替える
    card.addEventListener('click', () => {
      g.visible = !g.visible;
      card.classList.toggle('off', !g.visible);
      hiddenLabel.hidden = g.visible;
      renderCounts();
    });

    grid.appendChild(card);
  }
}

function renderCounts() {
  const visible = state.games.filter((g) => g.visible).length;
  let text = t().counts(visible, state.games.length);
  // カード表示のときだけ操作説明を添える(REQ-014)
  if (state.view === 'cards') text += ' ' + t().counts_cards_hint;
  $('counts').textContent = text;
}

function renderGames() {
  $('game-list').hidden = state.view !== 'list';
  $('game-cards').hidden = state.view !== 'cards';
  $('view-list').classList.toggle('active', state.view === 'list');
  $('view-cards').classList.toggle('active', state.view === 'cards');
  if (state.view === 'list') renderList();
  else renderCards();
}

function render() {
  const tr = t();
  document.documentElement.lang = state.lang;
  $('lang-toggle').textContent = state.lang === 'ja' ? 'English' : '日本語';
  $('admin-subtitle').textContent = tr.subtitle;
  $('setup-title').textContent = tr.setup_title;
  $('setup-help').textContent = tr.setup_help;
  $('label-repo').textContent = tr.label_repo;
  $('label-token').textContent = tr.label_token;
  $('token-help').textContent = tr.token_help;
  $('load-button').textContent = tr.load;
  $('settings-title').textContent = tr.settings_title;
  $('label-site-title').textContent = tr.label_site_title;
  $('label-default-lang').textContent = tr.label_default_lang;
  $('group-display-items').textContent = tr.group_display_items;
  $('help-display-items').textContent = tr.help_display_items;
  $('label-show-playtime').textContent = tr.label_show_playtime;
  $('label-show-played').textContent = tr.label_show_played;
  $('label-show-last-played').textContent = tr.label_show_last_played;
  $('label-show-developer').textContent = tr.label_show_developer;
  $('label-channel-url').textContent = tr.label_channel_url;
  $('editor-title').textContent = tr.editor_title;
  $('view-list').textContent = tr.view_list;
  $('view-cards').textContent = tr.view_cards;
  $('admin-search').placeholder = tr.search_placeholder;
  const sortOptions = [
    ['name', tr.sort_name],
    ['playtime', tr.sort_playtime],
    ['last_played', tr.sort_last_played],
    ['release_date', tr.sort_release_date],
    ['developer', tr.sort_developer],
    ['publisher', tr.sort_publisher],
  ];
  $('admin-sort').innerHTML = sortOptions
    .map(([v, label]) => `<option value="${v}">${label}</option>`)
    .join('');
  $('admin-sort').value = state.sort;
  $('label-published').textContent = tr.label_published;
  $('save-button').textContent = tr.save;
  $('back-link').textContent = tr.back;
  if (state.loaded) {
    renderCounts();
    renderGames();
  }
}

// ---- 初期化 ----

function init() {
  let savedLang = null;
  let savedView = null;
  try {
    savedLang = localStorage.getItem('lang');
    savedView = localStorage.getItem('admin_view');
  } catch {}
  if (savedLang === 'en' || savedLang === 'ja') state.lang = savedLang;
  if (savedView === 'cards' || savedView === 'list') state.view = savedView;

  try {
    $('repo-input').value = localStorage.getItem('admin_repo') || detectRepo();
    $('token-input').value = localStorage.getItem('admin_token') || '';
  } catch {
    $('repo-input').value = detectRepo();
  }

  $('lang-toggle').addEventListener('click', () => {
    state.lang = state.lang === 'ja' ? 'en' : 'ja';
    try {
      localStorage.setItem('lang', state.lang);
    } catch {}
    render();
  });
  $('load-button').addEventListener('click', load);
  $('save-button').addEventListener('click', save);
  $('view-list').addEventListener('click', () => setView('list'));
  $('view-cards').addEventListener('click', () => setView('cards'));
  $('admin-search').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderGames();
  });
  $('admin-sort').addEventListener('change', (e) => {
    const value = e.target.value;
    // developer/publisher 以外への変更時は二次ソートも追従させる(REQ-037)
    if (value !== 'developer' && value !== 'publisher') state.sortSecondary = value;
    state.sort = value;
    renderGames();
  });
  // 全体スイッチ変更時、対応するチップのロック状態を即時反映(REQ-018)
  $('set-show-playtime').addEventListener('change', () => {
    if (state.loaded) renderGames();
  });
  $('set-show-played').addEventListener('change', () => {
    if (state.loaded) renderGames();
  });

  render();
  if (DEMO) loadDemo();
}

function setView(view) {
  state.view = view;
  try {
    localStorage.setItem('admin_view', view);
  } catch {}
  renderGames();
  renderCounts();
}

init();
