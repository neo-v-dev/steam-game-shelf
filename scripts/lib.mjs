// 共通ロジック。GitHub Actions からもローカルからも、将来のホスト版(Cloudflare Workers 等)からも
// そのまま使えるよう、Node 固有の API(fs 等)には依存しない純粋な関数のみを置く。

const API_BASE = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/';

/**
 * Steam Web API から所有ゲーム一覧を取得する。
 * プロフィールの「ゲームの詳細」が公開設定でない場合、games は返らない。
 */
export async function fetchOwnedGames(apiKey, steamId, fetchImpl = fetch) {
  const params = new URLSearchParams({
    key: apiKey,
    steamid: steamId,
    include_appinfo: '1',
    include_played_free_games: '1',
    format: 'json',
  });
  const res = await fetchImpl(`${API_BASE}?${params}`);
  if (!res.ok) {
    throw new Error(`Steam API error: HTTP ${res.status}`);
  }
  const data = await res.json();
  const games = data?.response?.games;
  if (!Array.isArray(games)) {
    throw new Error(
      'Steam API がゲーム一覧を返しませんでした。以下を確認してください:\n' +
        '  - STEAM_ID が SteamID64(17桁の数字)であること\n' +
        '  - Steam のプライバシー設定で「ゲームの詳細」が「公開」になっていること'
    );
  }
  return games;
}

/**
 * 取得結果を既存カタログとマージする。
 * 既存ゲームの visible フラグと name_ja キャッシュは維持し、新規ゲームには defaultVisibility を適用する。
 */
export function mergeCatalog(fetchedGames, prevCatalog, defaultVisibility = true) {
  const prevByAppId = new Map(
    (prevCatalog?.games ?? []).map((g) => [g.appid, g])
  );
  const games = fetchedGames
    .map((g) => {
      const prev = prevByAppId.get(g.appid);
      const merged = {
        appid: g.appid,
        name: g.name ?? `App ${g.appid}`,
        playtime_forever: g.playtime_forever ?? 0,
        rtime_last_played: g.rtime_last_played ?? 0,
        visible: prev?.visible ?? defaultVisibility,
        // プレイ済みタグ: 手動設定があれば維持、なければプレイ時間から自動判定
        played:
          prev && 'played' in prev ? prev.played : (g.playtime_forever ?? 0) > 0,
      };
      // name_ja はキーの有無で「取得試行済みか」を判定するため、null もそのまま引き継ぐ
      if (prev && 'name_ja' in prev) merged.name_ja = prev.name_ja;
      return merged;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const newGames = games.filter((g) => !prevByAppId.has(g.appid));
  return { games, newGames };
}

/**
 * ストア API からローカライズされたゲーム名を取得する。
 * 見つからない・ローカライズ名が無い場合は null(=取得試行済みとしてキャッシュしてよい)。
 * レート制限(429)時は err.rateLimited = true の例外を投げる。
 */
export async function fetchLocalizedName(appid, lang = 'japanese', fetchImpl = fetch) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=${lang}&filters=basic`;
  const res = await fetchImpl(url);
  if (res.status === 429 || res.status === 403) {
    const err = new Error(`appdetails rate limited (HTTP ${res.status})`);
    err.rateLimited = true;
    throw err;
  }
  if (!res.ok) throw new Error(`appdetails error: HTTP ${res.status}`);
  const data = await res.json();
  const entry = data?.[String(appid)];
  if (!entry?.success || !entry.data?.name) return null;
  return entry.data.name;
}

/**
 * カタログと設定から、サイトが読み込む公開用データを組み立てる。
 * 非表示ゲームはここで完全に除外する(公開リポジトリ・公開サイトには一切含めない)。
 */
export function buildPublicData(catalog, settings, generatedAt) {
  const visibleGames = (catalog?.games ?? [])
    .filter((g) => g.visible)
    .map(({ visible, name_ja, played, ...g }) => {
      // 日本語名は原題と異なる場合のみ、プレイ済みタグは true の場合のみ含める(サイズ削減)
      if (name_ja && name_ja !== g.name) g.name_ja = name_ja;
      if (played) g.played = true;
      return g;
    });
  return {
    generated_at: generatedAt,
    fetched_at: catalog?.fetched_at ?? null,
    published: settings.published === true,
    site: {
      title: settings.site_title || 'My Game Shelf',
      description: settings.site_description || '',
      default_lang: settings.default_lang === 'en' ? 'en' : 'ja',
      show_playtime: settings.show_playtime !== false,
      show_last_played: settings.show_last_played !== false,
    },
    games: visibleGames,
  };
}

/**
 * 行頭コメント(// ...)付き JSON をパースする。
 * 文字列内の "//"(URL 等)を壊さないよう、行全体がコメントの行のみを除去する。
 */
export function parseJsonc(text) {
  const stripped = text
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  return JSON.parse(stripped);
}
