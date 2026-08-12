// games.json を読み込んで一覧を描画する。ビルド工程なしの素の JS。

const I18N = {
  ja: {
    search_placeholder: 'ゲーム名で検索…',
    sort_name: '名前順',
    sort_playtime: 'プレイ時間順',
    sort_last_played: '最近プレイした順',
    stats_games: (n) => `${n} 本`,
    stats_hours: (h) => `総プレイ ${h.toLocaleString('ja-JP')} 時間`,
    playtime: (h) => `${h.toLocaleString('ja-JP')} 時間`,
    playtime_none: '未プレイ',
    last_played: (d) => `最終プレイ: ${d}`,
    updated: (d) => `最終更新: ${d}`,
    unpublished:
      'このサイトはまだ準備中です。(管理者向け: config/settings.jsonc の "published" を true にすると公開されます)',
    no_games: '表示できるゲームがありません。',
    no_match: '該当するゲームがありません。',
    lang_button: 'English',
    load_error: 'データの読み込みに失敗しました。',
  },
  en: {
    search_placeholder: 'Search by title…',
    sort_name: 'Name',
    sort_playtime: 'Playtime',
    sort_last_played: 'Recently played',
    stats_games: (n) => `${n} games`,
    stats_hours: (h) => `${h.toLocaleString('en-US')} hours total`,
    playtime: (h) => `${h.toLocaleString('en-US')} hrs`,
    playtime_none: 'Not played',
    last_played: (d) => `Last played: ${d}`,
    updated: (d) => `Last updated: ${d}`,
    unpublished:
      'This site is not published yet. (For the owner: set "published" to true in config/settings.jsonc)',
    no_games: 'No games to display.',
    no_match: 'No games match your search.',
    lang_button: '日本語',
    load_error: 'Failed to load data.',
  },
};

const state = {
  lang: 'ja',
  data: null,
  query: '',
  sort: 'name',
};

const $ = (id) => document.getElementById(id);
const t = () => I18N[state.lang];

function headerImageUrl(appid) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

function formatDate(epochSeconds) {
  const locale = state.lang === 'ja' ? 'ja-JP' : 'en-US';
  return new Date(epochSeconds * 1000).toLocaleDateString(locale);
}

function sortedFilteredGames() {
  const q = state.query.trim().toLowerCase();
  let games = state.data.games.filter((g) =>
    g.name.toLowerCase().includes(q)
  );
  const locale = state.lang === 'ja' ? 'ja' : 'en';
  switch (state.sort) {
    case 'playtime':
      games.sort((a, b) => b.playtime_forever - a.playtime_forever);
      break;
    case 'last_played':
      games.sort((a, b) => b.rtime_last_played - a.rtime_last_played);
      break;
    default:
      games.sort((a, b) => a.name.localeCompare(b.name, locale));
  }
  return games;
}

function render() {
  const { data } = state;
  const tr = t();

  document.documentElement.lang = state.lang;
  $('lang-toggle').textContent = tr.lang_button;

  if (!data) return;

  $('site-title').textContent = data.site.title;
  document.title = data.site.title;
  $('site-description').textContent = data.site.description;

  if (!data.published) {
    $('notice').textContent = tr.unpublished;
    $('notice').hidden = false;
    $('controls').hidden = true;
    $('grid').innerHTML = '';
    $('stats').innerHTML = '';
    $('empty-message').hidden = true;
    return;
  }
  $('notice').hidden = true;
  $('controls').hidden = false;

  // 統計
  const totalHours = Math.round(
    data.games.reduce((sum, g) => sum + g.playtime_forever, 0) / 60
  );
  const stats = [tr.stats_games(data.games.length)];
  if (data.site.show_playtime) stats.push(tr.stats_hours(totalHours));
  $('stats').innerHTML = stats
    .map((s) => `<span class="stat">${s}</span>`)
    .join('');

  // コントロール
  $('search').placeholder = tr.search_placeholder;
  const sortOptions = [
    ['name', tr.sort_name],
    ['playtime', tr.sort_playtime],
    ['last_played', tr.sort_last_played],
  ];
  $('sort').innerHTML = sortOptions
    .map(([v, label]) => `<option value="${v}">${label}</option>`)
    .join('');
  $('sort').value = state.sort;

  // グリッド
  const games = sortedFilteredGames();
  const grid = $('grid');
  grid.innerHTML = '';
  for (const g of games) {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = `https://store.steampowered.com/app/${g.appid}/`;
    card.target = '_blank';
    card.rel = 'noopener';

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

    const body = document.createElement('div');
    body.className = 'card-body';

    const name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = g.name;
    body.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    if (data.site.show_playtime) {
      const hours = g.playtime_forever / 60;
      const span = document.createElement('span');
      span.textContent =
        g.playtime_forever > 0
          ? t().playtime(Math.round(hours * 10) / 10)
          : t().playtime_none;
      meta.appendChild(span);
    }
    if (data.site.show_last_played && g.rtime_last_played > 0) {
      const span = document.createElement('span');
      span.textContent = t().last_played(formatDate(g.rtime_last_played));
      meta.appendChild(span);
    }
    body.appendChild(meta);
    card.appendChild(body);
    grid.appendChild(card);
  }

  const empty = $('empty-message');
  if (games.length === 0) {
    empty.textContent = data.games.length === 0 ? tr.no_games : tr.no_match;
    empty.hidden = false;
  } else {
    empty.hidden = true;
  }

  // フッター
  const updated = data.fetched_at || data.generated_at;
  $('updated-at').textContent = updated
    ? tr.updated(new Date(updated).toLocaleString(state.lang === 'ja' ? 'ja-JP' : 'en-US'))
    : '';
}

function setLang(lang) {
  state.lang = lang;
  try {
    localStorage.setItem('lang', lang);
  } catch {}
  render();
}

async function main() {
  $('lang-toggle').addEventListener('click', () =>
    setLang(state.lang === 'ja' ? 'en' : 'ja')
  );
  $('search').addEventListener('input', (e) => {
    state.query = e.target.value;
    render();
  });
  $('sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
  });

  try {
    const res = await fetch('data/games.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (err) {
    console.error(err);
    $('notice').textContent = t().load_error;
    $('notice').hidden = false;
    return;
  }

  let saved = null;
  try {
    saved = localStorage.getItem('lang');
  } catch {}
  state.lang = saved === 'en' || saved === 'ja' ? saved : state.data.site.default_lang;

  render();
}

main();
