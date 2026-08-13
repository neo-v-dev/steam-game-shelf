// 表示設定の管理ページ。
// GitHub API 経由で data/catalog.json(表示/プレイ済み/時間表示/配信URL)と
// config/settings.jsonc(サイト名・初期言語・プレイ時間表示・チャンネルURL・公開状態)を編集し、
// そのままコミットする。トークンはこのブラウザの localStorage にのみ保存され、
// api.github.com 以外には一切送信されない。
// ?demo=1 を付けるとサンプルデータで操作感を試せる(保存は無効)。

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
    settings_title: 'サイト設定',
    label_site_title: 'サイト名',
    label_default_lang: '初期表示言語',
    label_show_playtime: 'プレイ時間を表示(サイト全体)',
    help_show_playtime:
      'OFFにするとサイト全体でプレイ時間が非表示になります。ゲームごとの「時間表示」設定は保持され、ONに戻すと元どおり反映されます。',
    label_channel_url: 'チャンネルURL(ページ上部にリンク表示)',
    editor_title: 'ゲームの表示設定',
    view_list: 'リスト',
    view_cards: 'カード',
    search_placeholder: 'ゲーム名で絞り込み…',
    bulk_visible: '表示:',
    bulk_played: 'プレイ済み:',
    all_on: '全てON',
    all_off: '全てOFF',
    counts: (visible, total) => `${total} 本中 ${visible} 本を表示 / ${total - visible} 本を非表示`,
    tag_played: 'プレイ済み',
    tag_show_playtime: '時間表示',
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
    err_auth: '認証に失敗しました。トークンと権限(Contents: Read and write)を確認してください。',
    err_no_catalog:
      'data/catalog.json が見つかりません。先に GitHub の Actions タブから「Update game list」を実行して、ゲームリストを取得してください。',
    err_load: (msg) => `読み込みに失敗しました: ${msg}`,
    err_save: (msg) => `保存に失敗しました: ${msg}`,
    err_conflict:
      '保存中に他の更新(自動更新など)と競合しました。もう一度「読み込む」からやり直してください。',
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
    settings_title: 'Site settings',
    label_site_title: 'Site title',
    label_default_lang: 'Default language',
    label_show_playtime: 'Show playtime (site-wide)',
    help_show_playtime:
      'Turning this off hides playtime across the whole site. Per-game "Playtime" settings are preserved and take effect again when turned back on.',
    label_channel_url: 'Channel URL (shown at the top of the page)',
    editor_title: 'Game visibility',
    view_list: 'List',
    view_cards: 'Cards',
    search_placeholder: 'Filter by title…',
    bulk_visible: 'Visible:',
    bulk_played: 'Played:',
    all_on: 'All on',
    all_off: 'All off',
    counts: (visible, total) => `${visible} of ${total} shown / ${total - visible} hidden`,
    tag_played: 'Played',
    tag_show_playtime: 'Playtime',
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
    err_auth: 'Authentication failed. Check the token and its Contents: Read and write permission.',
    err_no_catalog:
      'data/catalog.json not found. Run the "Update game list" workflow from the Actions tab first.',
    err_load: (msg) => `Failed to load: ${msg}`,
    err_save: (msg) => `Failed to save: ${msg}`,
    err_conflict:
      'Your save conflicted with another update (e.g. the daily refresh). Please load again and retry.',
    hours: (h) => `${h} hrs`,
  },
};

const DEMO = new URLSearchParams(location.search).has('demo');

const state = {
  lang: 'ja',
  view: 'list',         // 'list' | 'cards'
  games: [],            // catalog の games(visible / played / show_playtime / stream_url を編集する)
  catalogRaw: null,     // fetched_at 等を保持するための元オブジェクト
  catalogSha: null,
  settingsText: null,   // settings.jsonc の原文(コメント保持のため)
  settings: {},         // パース済みの設定値
  settingsSha: null,
  published: false,
  query: '',
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

function decodeContent(base64) {
  const bytes = Uint8Array.from(atob(base64.replace(/\n/g, '')), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeContent(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
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

// ---- settings.jsonc の読み書き(コメント保持) ----

function parseJsonc(text) {
  const stripped = text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  return JSON.parse(stripped);
}

// 既存キーは値だけ置換し、無いキーは先頭に挿入する(コメントはそのまま残る)
function setJsoncValue(text, key, value) {
  const encoded = JSON.stringify(value);
  const re = new RegExp(`("${key}"\\s*:\\s*)(?:"(?:[^"\\\\]|\\\\.)*"|true|false|null|[\\d.eE+-]+)`);
  if (re.test(text)) return text.replace(re, `$1${encoded}`);
  return text.replace(/\{/, `{\n  "${key}": ${encoded},`);
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
  $('set-channel-url').value = s.channel_url ?? '';
  $('published-toggle').checked = state.published;
}

async function load() {
  setStatus('');
  if (DEMO) {
    loadDemo();
    return;
  }
  if (!repoParts()) return setStatus(t().err_no_repo, true);
  if (!$('token-input').value.trim()) return setStatus(t().err_no_token, true);

  $('load-button').disabled = true;
  $('load-button').textContent = t().loading;
  try {
    const catalog = await getFile('data/catalog.json');
    if (!catalog) throw new Error(t().err_no_catalog);
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
  } catch (err) {
    console.error(err);
    setStatus(t().err_load(err.message), true);
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
  const channel = $('set-channel-url').value.trim();
  if (channel !== (s.channel_url ?? '')) changes.channel_url = channel;
  if ($('published-toggle').checked !== (s.published === true))
    changes.published = $('published-toggle').checked;
  return changes;
}

async function save() {
  if (DEMO) {
    setStatus(t().demo_notice);
    return;
  }
  $('save-button').disabled = true;
  $('save-button').textContent = t().saving;
  setStatus('');
  try {
    // 空の配信URLはキーごと削除してカタログを汚さない
    for (const g of state.games) {
      if (typeof g.stream_url === 'string') g.stream_url = g.stream_url.trim();
      if (!g.stream_url) delete g.stream_url;
    }
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
    { appid: 570, name: 'Dota 2', playtime_forever: 12345, visible: true, played: true, show_playtime: true },
    { appid: 730, name: 'Counter-Strike 2', playtime_forever: 3456, visible: true, played: true, show_playtime: false },
    { appid: 1245620, name: 'ELDEN RING', playtime_forever: 9021, visible: true, played: true, show_playtime: true, stream_url: 'https://www.youtube.com/watch?v=demo' },
    { appid: 1086940, name: "Baldur's Gate 3", name_ja: 'バルダーズ・ゲート3', playtime_forever: 6000, visible: true, played: false, show_playtime: true },
    { appid: 413150, name: 'Stardew Valley', name_ja: 'スターデューバレー', playtime_forever: 200, visible: false, played: false, show_playtime: true },
    { appid: 1145360, name: 'Hades', name_ja: 'ハデス', playtime_forever: 4100, visible: true, played: true, show_playtime: true },
  ];
  state.settings = {
    site_title: 'Demo Game Shelf',
    default_lang: 'ja',
    show_playtime: true,
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

function headerImageUrl(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

function filteredGames() {
  const q = state.query.trim().toLowerCase();
  return state.games.filter(
    (g) =>
      g.name.toLowerCase().includes(q) ||
      (g.name_ja && g.name_ja.toLowerCase().includes(q))
  );
}

function setStatus(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

function makeChip(label, isOn, onToggle) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'tag-chip' + (isOn() ? ' on' : '');
  chip.textContent = label;
  chip.addEventListener('click', (e) => {
    // 行全体が label / カード全体がクリック対象のため、伝播を止める
    e.preventDefault();
    e.stopPropagation();
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

    row.appendChild(makeChip(t().tag_played, () => g.played, () => (g.played = !g.played)));
    row.appendChild(
      makeChip(
        t().tag_show_playtime,
        () => g.show_playtime !== false,
        () => (g.show_playtime = g.show_playtime === false)
      )
    );
    row.appendChild(makeStreamInput(g));

    const meta = document.createElement('span');
    meta.className = 'admin-row-meta';
    meta.textContent =
      (g.playtime_forever > 0 ? t().hours(Math.round(g.playtime_forever / 6) / 10) + ' · ' : '') +
      g.appid;
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
    img.src = headerImageUrl(g.appid);
    img.onerror = () => {
      img.remove();
      card.classList.add('no-image');
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

    const chips = document.createElement('div');
    chips.className = 'admin-card-chips';
    chips.appendChild(makeChip(t().tag_played, () => g.played, () => (g.played = !g.played)));
    chips.appendChild(
      makeChip(
        t().tag_show_playtime,
        () => g.show_playtime !== false,
        () => (g.show_playtime = g.show_playtime === false)
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
  $('counts').textContent = t().counts(visible, state.games.length);
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
  $('label-show-playtime').textContent = tr.label_show_playtime;
  $('help-show-playtime').textContent = tr.help_show_playtime;
  $('label-channel-url').textContent = tr.label_channel_url;
  $('editor-title').textContent = tr.editor_title;
  $('view-list').textContent = tr.view_list;
  $('view-cards').textContent = tr.view_cards;
  $('admin-search').placeholder = tr.search_placeholder;
  $('bulk-visible-label').textContent = tr.bulk_visible;
  $('bulk-played-label').textContent = tr.bulk_played;
  $('visible-all-on').textContent = tr.all_on;
  $('visible-all-off').textContent = tr.all_off;
  $('played-all-on').textContent = tr.all_on;
  $('played-all-off').textContent = tr.all_off;
  $('label-published').textContent = tr.label_published;
  $('save-button').textContent = tr.save;
  $('back-link').textContent = tr.back;
  if (state.loaded) {
    renderCounts();
    renderGames();
  }
}

function setBulk(field, value) {
  for (const g of filteredGames()) g[field] = value;
  renderCounts();
  renderGames();
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
  $('visible-all-on').addEventListener('click', () => setBulk('visible', true));
  $('visible-all-off').addEventListener('click', () => setBulk('visible', false));
  $('played-all-on').addEventListener('click', () => setBulk('played', true));
  $('played-all-off').addEventListener('click', () => setBulk('played', false));
  $('admin-search').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderGames();
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
}

init();
