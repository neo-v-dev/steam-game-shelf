// games.json を読み込んで一覧を描画する。ビルド工程なしの素の JS。
// DOM/class は design-deliverable/css(納品コンポーネントシート)の構造に合わせている(REQ-039)。

const I18N = {
  ja: {
    search_placeholder: 'ゲーム名で検索…',
    aria_search: 'ゲーム名で検索',
    aria_filter: '絞り込み',
    aria_sort: '並び替え',
    sort_name: '名前順',
    sort_playtime: 'プレイ時間順',
    sort_last_played: '最近プレイした順',
    sort_developer: '開発元順',
    sort_publisher: '販売元順',
    sort_release_date: '発売日順',
    filter_all: 'すべて',
    filter_played: 'プレイ済み',
    filter_unplayed: '未プレイ',
    badge_played: 'プレイ済み',
    watch_stream: '配信を見る',
    stream_link_label: (name) => `${name} の配信を見る`,
    store_link_label: (name) => `${name} を Steam ストアで開く`,
    channel: '配信チャンネル',
    stats_games_unit: '本',
    stats_hours_prefix: '総プレイ ',
    stats_hours_unit: '時間',
    playtime: (h) => `${h.toLocaleString('ja-JP')} 時間`,
    playtime_none: '未プレイ',
    last_played: (d) => `最終プレイ: ${d}`,
    developer: (d) => `開発元: ${d}`,
    release_date: (d) => `発売日: ${d}`,
    updated: (d) => `最終更新: ${d}`,
    notice_unpublished_title: '準備中',
    notice_unpublished_text:
      'このサイトはまだ準備中です。(管理者向け: config/settings.jsonc の "published" を true にすると公開されます)',
    notice_load_error_title: '読み込みエラー',
    notice_load_error_text: 'データの読み込みに失敗しました。',
    no_games: '表示できるゲームがありません。',
    no_match: '該当するゲームがありません。',
    lang_button: 'English',
  },
  en: {
    search_placeholder: 'Search by title…',
    aria_search: 'Search by title',
    aria_filter: 'Filter',
    aria_sort: 'Sort',
    sort_name: 'Name',
    sort_playtime: 'Playtime',
    sort_last_played: 'Recently played',
    sort_developer: 'Developer',
    sort_publisher: 'Publisher',
    sort_release_date: 'Release date',
    filter_all: 'All',
    filter_played: 'Played',
    filter_unplayed: 'Not played',
    badge_played: 'Played',
    watch_stream: 'Watch stream',
    stream_link_label: (name) => `Watch stream for ${name}`,
    store_link_label: (name) => `Open ${name} on the Steam store`,
    channel: 'Channel',
    stats_games_unit: ' games',
    stats_hours_prefix: 'Total ',
    stats_hours_unit: 'h',
    playtime: (h) => `${h.toLocaleString('en-US')} hrs`,
    playtime_none: 'Not played',
    last_played: (d) => `Last played: ${d}`,
    developer: (d) => `Developer: ${d}`,
    release_date: (d) => `Released: ${d}`,
    updated: (d) => `Last updated: ${d}`,
    notice_unpublished_title: 'Coming soon',
    notice_unpublished_text:
      'This site is not published yet. (For the owner: set "published" to true in config/settings.jsonc)',
    notice_load_error_title: 'Load error',
    notice_load_error_text: 'Failed to load data.',
    no_games: 'No games to display.',
    no_match: 'No games match your search.',
    lang_button: '日本語',
  },
};

const state = {
  lang: 'ja',
  data: null,
  loadError: false,
  query: '',
  sort: 'name',
  // developer/publisher ソート時の同値タイブレークに使う二次ソート(REQ-037)。
  // ソート変更時、新しい値が developer/publisher 以外ならここも追従して更新する。
  sortSecondary: 'name',
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
      return (a, b) => b.rtime_last_played - a.rtime_last_played;
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

// #notice を title+text 分割の構造で表示する(REQ-039 確定事項6)。
// unpublished/load_error のいずれも同じ構造を使う。
function showNotice(title, text) {
  $('notice-title').textContent = title;
  $('notice-text').textContent = text;
  $('notice').hidden = false;
}

function buildCard(g, tr) {
  const card = document.createElement('li');
  card.className = 'game-card';

  const link = document.createElement('a');
  link.className = 'card-link';
  link.href = `https://store.steampowered.com/app/${g.appid}/`;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = tr.store_link_label(displayName(g));
  card.appendChild(link);

  const thumb = document.createElement('span');
  thumb.className = 'card-thumb';

  const img = document.createElement('img');
  img.className = 'card-thumb-img';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.width = 460;
  img.height = 215;
  img.alt = '';
  const imgCandidates = imageCandidateUrls(g);
  let imgIndex = 0;
  img.src = imgCandidates[imgIndex];
  img.onerror = () => {
    imgIndex += 1;
    if (imgIndex < imgCandidates.length) {
      img.src = imgCandidates[imgIndex];
    } else {
      img.remove();
      const placeholder = document.createElement('span');
      placeholder.className = 'card-thumb-placeholder';
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.textContent = '🎮';
      thumb.insertBefore(placeholder, thumb.firstChild);
    }
  };
  thumb.appendChild(img);

  if (g.showPlayed) {
    const badge = document.createElement('span');
    badge.className = 'played-badge';
    badge.textContent = tr.badge_played;
    thumb.appendChild(badge);
  }
  card.appendChild(thumb);

  const body = document.createElement('span');
  body.className = 'card-body';

  const titleRow = document.createElement('span');
  titleRow.className = 'card-title-row';

  const name = document.createElement('span');
  name.className = 'card-title';
  name.textContent = displayName(g);
  titleRow.appendChild(name);

  if (g.stream_url) {
    const video = document.createElement('a');
    video.className = 'stream-link';
    video.href = g.stream_url;
    video.target = '_blank';
    video.rel = 'noopener';
    video.title = tr.watch_stream;
    video.setAttribute('aria-label', tr.stream_link_label(displayName(g)));
    video.textContent = '▶';
    titleRow.appendChild(video);
  }
  body.appendChild(titleRow);

  const meta = document.createElement('span');
  meta.className = 'card-meta';
  if (g.showPlaytime) {
    const hours = g.playtime_forever / 60;
    const span = document.createElement('span');
    if (g.playtime_forever > 0) {
      span.className = 'meta-row';
      span.textContent = tr.playtime(Math.round(hours * 10) / 10);
    } else {
      span.className = 'meta-row meta-row-unplayed';
      span.textContent = tr.playtime_none;
    }
    meta.appendChild(span);
  }
  if (g.showLastPlayed) {
    const span = document.createElement('span');
    span.className = 'meta-row';
    span.textContent = tr.last_played(formatDate(g.rtime_last_played));
    meta.appendChild(span);
  }
  // 発売日は表示スイッチが無く、データがあれば常時表示する(REQ-036)
  if (g.release_date) {
    const span = document.createElement('span');
    span.className = 'meta-row';
    span.textContent = tr.release_date(g.release_ts ? formatDate(g.release_ts) : g.release_date);
    meta.appendChild(span);
  }
  if (g.showDeveloper) {
    const span = document.createElement('span');
    span.className = 'meta-row';
    span.textContent = tr.developer(g.developer);
    meta.appendChild(span);
  }
  body.appendChild(meta);
  card.appendChild(body);
  return card;
}

function render() {
  const { data } = state;
  const tr = t();

  document.documentElement.lang = state.lang;
  $('lang-toggle').textContent = tr.lang_button;

  if (state.loadError) {
    showNotice(tr.notice_load_error_title, tr.notice_load_error_text);
    return;
  }

  if (!data) return;

  $('site-title').textContent = data.site.title;
  document.title = data.site.title;
  $('site-description').textContent = data.site.description;

  // ヘッダーのチャンネルリンク(▶はテキスト表現・REQ-039 確定事項7)
  const channel = $('channel-link');
  if (data.site.channel_url) {
    channel.href = data.site.channel_url;
    channel.textContent = `▶ ${tr.channel}`;
    channel.hidden = false;
  } else {
    channel.hidden = true;
  }

  if (!data.published) {
    showNotice(tr.notice_unpublished_title, tr.notice_unpublished_text);
    $('controls').hidden = true;
    $('grid').innerHTML = '';
    $('stats').innerHTML = '';
    $('empty-message').hidden = true;
    return;
  }
  $('notice').hidden = true;
  $('controls').hidden = false;

  // 統計(値・単位分割・REQ-039 確定事項6)
  const totalHours = Math.round(
    data.games.reduce((sum, g) => sum + g.playtime_forever, 0) / 60
  );
  const statsHtml = [];
  statsHtml.push(
    `<li class="stat-chip"><span class="stat-chip-value">${data.games.length}</span>${tr.stats_games_unit}</li>`
  );
  if (data.site.show_playtime) {
    statsHtml.push(
      `<li class="stat-chip">${tr.stats_hours_prefix}<span class="stat-chip-value">${totalHours.toLocaleString(
        state.lang === 'ja' ? 'ja-JP' : 'en-US'
      )}</span>${tr.stats_hours_unit}</li>`
    );
  }
  $('stats').innerHTML = statsHtml.join('');

  // コントロール
  $('search').placeholder = tr.search_placeholder;
  $('search').setAttribute('aria-label', tr.aria_search);
  $('filter').setAttribute('aria-label', tr.aria_filter);
  $('sort').setAttribute('aria-label', tr.aria_sort);

  // 非表示にした項目はソート選択肢からも外す(REQ-029)。
  // 名前順しか残らない場合はソート自体が無意味なのでセレクトごと隠す(REQ-030)
  const sortOptions = [['name', tr.sort_name]];
  if (data.site.show_playtime !== false) sortOptions.push(['playtime', tr.sort_playtime]);
  if (data.site.show_last_played !== false) sortOptions.push(['last_played', tr.sort_last_played]);
  // 発売日は表示にスイッチが無いため、ソート選択肢も除外対象にしない(REQ-036)
  sortOptions.push(['release_date', tr.sort_release_date]);
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
    // 表示スイッチはゲームオブジェクト自体を汚さず、カード生成時に一時プロパティとして渡す
    const withSwitches = {
      ...g,
      showPlayed: data.site.show_played !== false && g.played,
      showPlaytime: data.site.show_playtime && g.show_playtime !== false,
      showLastPlayed: data.site.show_last_played && g.rtime_last_played > 0,
      showDeveloper: data.site.show_developer !== false && !!g.developer,
    };
    grid.appendChild(buildCard(withSwitches, tr));
  }

  const emptyWrap = $('empty-message');
  const emptyIcon = $('empty-icon');
  const emptyText = $('empty-text');
  if (games.length === 0) {
    const noGamesAtAll = data.games.length === 0;
    emptyIcon.textContent = noGamesAtAll ? '🗄' : '🔍';
    emptyText.textContent = noGamesAtAll ? tr.no_games : tr.no_match;
    emptyWrap.hidden = false;
  } else {
    emptyWrap.hidden = true;
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
    const value = e.target.value;
    // developer/publisher 以外への変更時は二次ソートも追従させる(REQ-037)
    if (value !== 'developer' && value !== 'publisher') state.sortSecondary = value;
    state.sort = value;
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
    state.loadError = true;
    render();
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
