// 表示設定の管理ページ。
// GitHub API 経由で data/catalog.json の visible フラグと settings.jsonc の published を編集し、
// そのままコミットする。トークンはこのブラウザの localStorage にのみ保存され、
// api.github.com 以外には一切送信されない。
// ?demo=1 を付けるとサンプルデータで操作感を試せる(保存は無効)。

const I18N = {
  ja: {
    subtitle: 'ゲームごとの表示/非表示とサイトの公開状態を編集できます',
    setup_title: '接続',
    setup_help:
      'このページはあなた(リポジトリの所有者)専用です。編集にはアクセストークンが必要なので、第三者は閲覧できても保存はできません。',
    label_repo: 'リポジトリ (owner/repository)',
    label_token: 'アクセストークン',
    token_help:
      'GitHub の Settings → Developer settings → Fine-grained personal access tokens で作成。対象をこのリポジトリのみに限定し、権限は Contents: Read and write だけを付与してください。トークンはこのブラウザ内にのみ保存されます。',
    load: '読み込む',
    loading: '読み込み中…',
    editor_title: 'ゲームの表示設定',
    search_placeholder: 'ゲーム名で絞り込み…',
    show_all: '表示中の一覧を全て表示にする',
    hide_all: '表示中の一覧を全て非表示にする',
    counts: (visible, total) => `${total} 本中 ${visible} 本を表示 / ${total - visible} 本を非表示`,
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
    tag_played: 'プレイ済み',
  },
  en: {
    subtitle: 'Manage per-game visibility and the publish state of your site',
    setup_title: 'Connect',
    setup_help:
      'This page is for you (the repository owner). Saving requires an access token, so visitors can view this page but cannot change anything.',
    label_repo: 'Repository (owner/repository)',
    label_token: 'Access token',
    token_help:
      'Create one at GitHub Settings → Developer settings → Fine-grained personal access tokens. Limit it to this repository only, with the Contents: Read and write permission. The token is stored only in this browser.',
    load: 'Load',
    loading: 'Loading…',
    editor_title: 'Game visibility',
    search_placeholder: 'Filter by title…',
    show_all: 'Show all listed',
    hide_all: 'Hide all listed',
    counts: (visible, total) => `${visible} of ${total} shown / ${total - visible} hidden`,
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
    tag_played: 'Played',
  },
};

const DEMO = new URLSearchParams(location.search).has('demo');

const state = {
  lang: 'ja',
  games: [],            // catalog の games(visible を編集する)
  catalogRaw: null,     // fetched_at 等を保持するための元オブジェクト
  catalogSha: null,
  settingsText: null,
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
  const res = await api(`contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`);
  if (res.status === 401 || res.status === 403) throw new Error(t().err_auth);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { text: decodeContent(data.content), sha: data.sha };
}

async function putFile(path, text, sha, message) {
  const res = await api(`contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, {
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
    state.published = /"published"\s*:\s*true/.test(state.settingsText ?? '');
    state.loaded = true;

    try {
      localStorage.setItem('admin_repo', $('repo-input').value.trim());
      localStorage.setItem('admin_token', $('token-input').value.trim());
    } catch {}

    $('editor').hidden = false;
    render();
  } catch (err) {
    console.error(err);
    setStatus(t().err_load(err.message), true);
  } finally {
    $('load-button').disabled = false;
    $('load-button').textContent = t().load;
  }
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
    const catalogText =
      JSON.stringify({ ...state.catalogRaw, games: state.games }, null, 2) + '\n';
    state.catalogSha = await putFile(
      'data/catalog.json',
      catalogText,
      state.catalogSha,
      'Update visibility settings (admin page)'
    );

    if (state.settingsText !== null) {
      const currentPublished = /"published"\s*:\s*true/.test(state.settingsText);
      if (currentPublished !== state.published) {
        const newText = state.settingsText.replace(
          /"published"(\s*):(\s*)(true|false)/,
          `"published"$1:$2${state.published}`
        );
        state.settingsSha = await putFile(
          'config/settings.jsonc',
          newText,
          state.settingsSha,
          `Set published to ${state.published} (admin page)`
        );
        state.settingsText = newText;
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
    { appid: 570, name: 'Dota 2', playtime_forever: 12345, visible: true, played: true },
    { appid: 730, name: 'Counter-Strike 2', playtime_forever: 3456, visible: true, played: true },
    { appid: 1245620, name: 'ELDEN RING', playtime_forever: 9021, visible: true, played: true },
    { appid: 1086940, name: "Baldur's Gate 3", name_ja: 'バルダーズ・ゲート3', playtime_forever: 6000, visible: true, played: false },
    { appid: 413150, name: 'Stardew Valley', name_ja: 'スターデューバレー', playtime_forever: 200, visible: false, played: false },
    { appid: 1145360, name: 'Hades', name_ja: 'ハデス', playtime_forever: 4100, visible: true, played: true },
  ];
  state.published = true;
  state.loaded = true;
  $('editor').hidden = false;
  render();
  setStatus(t().demo_notice);
}

// ---- 描画 ----

function displayName(g) {
  return state.lang === 'ja' && g.name_ja ? g.name_ja : g.name;
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

    const playedChip = document.createElement('button');
    playedChip.type = 'button';
    playedChip.className = 'tag-chip' + (g.played ? ' on' : '');
    playedChip.textContent = t().tag_played;
    playedChip.addEventListener('click', (e) => {
      // 行全体が label のため、visible チェックボックスへの伝播を止める
      e.preventDefault();
      e.stopPropagation();
      g.played = !g.played;
      playedChip.classList.toggle('on', g.played);
    });
    row.appendChild(playedChip);

    const meta = document.createElement('span');
    meta.className = 'admin-row-meta';
    meta.textContent =
      (g.playtime_forever > 0 ? t().hours(Math.round(g.playtime_forever / 6) / 10) + ' · ' : '') +
      g.appid;
    row.appendChild(meta);

    list.appendChild(row);
  }
}

function renderCounts() {
  const visible = state.games.filter((g) => g.visible).length;
  $('counts').textContent = t().counts(visible, state.games.length);
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
  $('editor-title').textContent = tr.editor_title;
  $('admin-search').placeholder = tr.search_placeholder;
  $('show-all').textContent = tr.show_all;
  $('hide-all').textContent = tr.hide_all;
  $('label-published').textContent = tr.label_published;
  $('save-button').textContent = tr.save;
  $('back-link').textContent = tr.back;
  $('published-toggle').checked = state.published;
  if (state.loaded) {
    renderCounts();
    renderList();
  }
}

function setBulk(visible) {
  for (const g of filteredGames()) g.visible = visible;
  renderCounts();
  renderList();
}

// ---- 初期化 ----

function init() {
  let savedLang = null;
  try {
    savedLang = localStorage.getItem('lang');
  } catch {}
  if (savedLang === 'en' || savedLang === 'ja') state.lang = savedLang;

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
  $('show-all').addEventListener('click', () => setBulk(true));
  $('hide-all').addEventListener('click', () => setBulk(false));
  $('admin-search').addEventListener('input', (e) => {
    state.query = e.target.value;
    renderList();
  });
  $('published-toggle').addEventListener('change', (e) => {
    state.published = e.target.checked;
  });

  render();
  if (DEMO) loadDemo();
}

init();
