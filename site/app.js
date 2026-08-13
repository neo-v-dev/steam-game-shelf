// games.json を読み込んで一覧を描画する。ビルド工程なしの素の JS。

const I18N = {
  ja: {
    search_placeholder: 'ゲーム名で検索…',
    sort_name: '名前順',
    sort_playtime: 'プレイ時間順',
    sort_last_played: '最近プレイした順',
    sort_developer: '開発元順',
    sort_publisher: '販売元順',
    filter_all: 'すべて',
    filter_played: 'プレイ済み',
    filter_unplayed: '未プレイ',
    badge_played: 'プレイ済み',
    watch_stream: '配信を見る',
    channel: '配信チャンネル',
    stats_games: (n) => `${n} 本`,
    stats_hours: (h) => `総プレイ ${h.toLocaleString('ja-JP')} 時間`,
    playtime: (h) => `${h.toLocaleString('ja-JP')} 時間`,
    playtime_none: '未プレイ',
    last_played: (d) => `最終プレイ: ${d}`,
    developer: (d) => `開発元: ${d}`,
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
    sort_developer: 'Developer',
    sort_publisher: 'Publisher',
    filter_all: 'All',
    filter_played: 'Played',
    filter_unplayed: 'Not played',
    badge_played: 'Played',
    watch_stream: 'Watch stream',
    channel: 'Channel',
    stats_games: (n) => `${n} games`,
    stats_hours: (h) => `${h.toLocaleString('en-US')} hours total`,
    playtime: (h) => `${h.toLocaleString('en-US')} hrs`,
    playtime_none: 'Not played',
    last_played: (d) => `Last played: ${d}`,
    developer: (d) => `Developer: ${d}`,
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
  filter: 'all',
};

const $ = (id) => document.getElementById(id);
const t = () => I18N[state.lang];

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

// 日本語表示時は邦題(あれば)、英語表示時は原題を返す
function displayName(g) {
  return state.lang === 'ja' && g.name_ja ? g.name_ja : g.name;
}

function formatDate(epochSeconds) {
  const locale = state.lang === 'ja' ? 'ja-JP' : 'en-US';
  return new Date(epochSeconds * 1000).toLocaleDateString(locale);
}

// developer/publisher などの任意項目で並べる比較関数(REQ-035)。値が無いゲームは常に末尾。
function compareByField(field, locale) {
  return (a, b) => {
    const av = a[field] || '';
    const bv = b[field] || '';
    if (!av && !bv) return 0;
    if (!av) return 1;
    if (!bv) return -1;
    return av.localeCompare(bv, locale);
  };
}

function sortedFilteredGames() {
  const q = state.query.trim().toLowerCase();
  let games = state.data.games.filter(
    (g) =>
      g.name.toLowerCase().includes(q) ||
      (g.name_ja && g.name_ja.toLowerCase().includes(q))
  );
  if (state.filter === 'played') games = games.filter((g) => g.played);
  if (state.filter === 'unplayed') games = games.filter((g) => !g.played);
  const locale = state.lang === 'ja' ? 'ja' : 'en';
  switch (state.sort) {
    case 'playtime':
      games.sort((a, b) => b.playtime_forever - a.playtime_forever);
      break;
    case 'last_played':
      games.sort((a, b) => b.rtime_last_played - a.rtime_last_played);
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

function render() {
  const { data } = state;
  const tr = t();

  document.documentElement.lang = state.lang;
  $('lang-toggle').textContent = tr.lang_button;

  if (!data) return;

  $('site-title').textContent = data.site.title;
  document.title = data.site.title;
  $('site-description').textContent = data.site.description;

  // ヘッダーのチャンネルリンク
  const channel = $('channel-link');
  if (data.site.channel_url) {
    channel.href = data.site.channel_url;
    $('channel-link-label').textContent = tr.channel;
    channel.hidden = false;
  } else {
    channel.hidden = true;
  }

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
  // 非表示にした項目はソート選択肢からも外す(REQ-029)。
  // 名前順しか残らない場合はソート自体が無意味なのでセレクトごと隠す(REQ-030)
  const sortOptions = [['name', tr.sort_name]];
  if (data.site.show_playtime !== false) sortOptions.push(['playtime', tr.sort_playtime]);
  if (data.site.show_last_played !== false) sortOptions.push(['last_played', tr.sort_last_played]);
  // 開発元/販売元ソートは show_developer OFF なら選択肢から除外する(REQ-029 と同作法、REQ-035)
  if (data.site.show_developer !== false) {
    sortOptions.push(['developer', tr.sort_developer]);
    sortOptions.push(['publisher', tr.sort_publisher]);
  }
  if (!sortOptions.some(([v]) => v === state.sort)) state.sort = 'name';
  $('sort').hidden = sortOptions.length === 1;
  $('sort').innerHTML = sortOptions
    .map(([v, label]) => `<option value="${v}">${label}</option>`)
    .join('');
  $('sort').value = state.sort;
  // プレイ済みタグの全体表示がOFFのときは、絞り込みも意味を持たない(タグ情報が漏れるため)ので隠す
  if (data.site.show_played === false) {
    state.filter = 'all';
    $('filter').hidden = true;
  } else {
    $('filter').hidden = false;
    const filterOptions = [
      ['all', tr.filter_all],
      ['played', tr.filter_played],
      ['unplayed', tr.filter_unplayed],
    ];
    $('filter').innerHTML = filterOptions
      .map(([v, label]) => `<option value="${v}">${label}</option>`)
      .join('');
    $('filter').value = state.filter;
  }

  // グリッド
  const games = sortedFilteredGames();
  const grid = $('grid');
  grid.innerHTML = '';
  for (const g of games) {
    // ストアリンクは全面オーバーレイの <a>、配信リンクはその上に重ねる別の <a>。
    // (<a> の入れ子は不正なため、カード自体は <div> にする)
    const card = document.createElement('div');
    card.className = 'card';

    const overlay = document.createElement('a');
    overlay.className = 'card-overlay';
    overlay.href = `https://store.steampowered.com/app/${g.appid}/`;
    overlay.target = '_blank';
    overlay.rel = 'noopener';
    overlay.setAttribute('aria-label', displayName(g));
    card.appendChild(overlay);

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

    if (data.site.show_played !== false && g.played) {
      const badge = document.createElement('span');
      badge.className = 'card-badge';
      badge.textContent = t().badge_played;
      card.appendChild(badge);
    }

    const body = document.createElement('div');
    body.className = 'card-body';

    const name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = displayName(g);
    body.appendChild(name);

    if (g.stream_url) {
      body.classList.add('has-video');
      const video = document.createElement('a');
      video.className = 'video-link';
      video.href = g.stream_url;
      video.target = '_blank';
      video.rel = 'noopener';
      video.title = tr.watch_stream;
      video.setAttribute('aria-label', tr.watch_stream);
      video.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2.2 14.5v-9l7 4.5-7 4.5z"/></svg>';
      body.appendChild(video);
    }

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    if (data.site.show_playtime && g.show_playtime !== false) {
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
    if (data.site.show_developer !== false && g.developer) {
      const span = document.createElement('span');
      span.textContent = t().developer(g.developer);
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
  $('filter').addEventListener('change', (e) => {
    state.filter = e.target.value;
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
