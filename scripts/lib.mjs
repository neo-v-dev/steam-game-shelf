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
    // 既定でオンにされる「未審査アプリの除外」をOFFにする(取得漏れ是正, REQ-020)
    skip_unvetted_apps: 'false',
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
        // ゲーム単位のプレイ時間表示(全体設定 show_playtime とは独立に保持)
        show_playtime:
          prev && 'show_playtime' in prev ? prev.show_playtime : true,
      };
      // name_ja はキーの有無で「取得試行済みか」を判定するため、null もそのまま引き継ぐ
      if (prev && 'name_ja' in prev) merged.name_ja = prev.name_ja;
      // image(ヘッダー画像URL)も同様にキーの有無で取得試行済みかを判定する(REQ-025)
      if (prev && 'image' in prev) merged.image = prev.image;
      // developer/publisher も同様にキーの有無で取得試行済みかを判定する(REQ-035)
      if (prev && 'developer' in prev) merged.developer = prev.developer;
      if (prev && 'publisher' in prev) merged.publisher = prev.publisher;
      // 配信リンク(管理ページで設定)も維持する
      if (prev?.stream_url) merged.stream_url = prev.stream_url;
      return merged;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const newGames = games.filter((g) => !prevByAppId.has(g.appid));
  return { games, newGames };
}

/**
 * ストア API からローカライズされたゲーム名・ヘッダー画像URL・開発元/販売元を取得する(REQ-025, REQ-035)。
 * 新しめのタイトルは新CDN(shared.akamai.steamstatic.com)のハッシュ付きURLが正式パスとなり、
 * appid から推測できないため、appdetails の header_image を正として使う。
 * developer/publisher はそれぞれ developers/publishers 配列の先頭社を採用し、無ければ null。
 * 見つからない場合は { name: null, image: null, developer: null, publisher: null }
 * (=取得試行済みとしてキャッシュしてよい)。
 * レート制限(429)時は err.rateLimited = true の例外を投げる。
 */
export async function fetchAppInfo(appid, lang = 'japanese', fetchImpl = fetch) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=${lang}&filters=basic,developers,publishers`;
  const res = await fetchImpl(url);
  if (res.status === 429 || res.status === 403) {
    const err = new Error(`appdetails rate limited (HTTP ${res.status})`);
    err.rateLimited = true;
    throw err;
  }
  if (!res.ok) throw new Error(`appdetails error: HTTP ${res.status}`);
  const data = await res.json();
  const entry = data?.[String(appid)];
  if (!entry?.success) return { name: null, image: null, developer: null, publisher: null };
  return {
    name: entry.data?.name ?? null,
    image: entry.data?.header_image ?? null,
    developer: entry.data?.developers?.[0] ?? null,
    publisher: entry.data?.publishers?.[0] ?? null,
  };
}

// ---- 配信/チャンネルURLの検証(REQ-031) ----

/**
 * 配信/チャンネルURLを検証・正規化する。
 * trim → スキーム無しなら https:// を前置 → URLパース(失敗はnull)
 * → https 以外は null → hostname が youtube.com/youtu.be/twitch.tv/nicovideo.jp/nico.ms と完全一致、
 * または .youtube.com/.twitch.tv/.nicovideo.jp で終わる場合のみ正規化済みURL文字列を返す。それ以外は null。
 * (site/admin-core.mjs の同名関数と同一ロジック。用途がブラウザ側/Node側で分かれるため複製している)
 */
export function normalizeStreamUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const tryParse = (s) => {
    try {
      return new URL(s);
    } catch {
      return null;
    }
  };

  // 既にスキームがあればそのまま解釈する(javascript: 等の危険なスキームを
  // https:// 前置で誤って通してしまわないため)。無ければ https:// を補う。
  const url = tryParse(trimmed) ?? tryParse(`https://${trimmed}`);
  if (!url) return null;
  if (url.protocol !== 'https:') return null;

  const host = url.hostname;
  const allowed =
    host === 'youtube.com' ||
    host === 'youtu.be' ||
    host === 'twitch.tv' ||
    host === 'nicovideo.jp' ||
    host === 'nico.ms' ||
    host.endsWith('.youtube.com') ||
    host.endsWith('.twitch.tv') ||
    host.endsWith('.nicovideo.jp');
  if (!allowed) return null;

  return url.toString();
}

/**
 * カタログと設定から、サイトが読み込む公開用データを組み立てる。
 * 非表示ゲームはここで完全に除外する(公開リポジトリ・公開サイトには一切含めない)。
 * stream_url / channel_url は normalizeStreamUrl で検証し、許可外は出力しない(REQ-031)。
 * excluded に配列を渡すと、除外したゲームの appid/name/field を積む
 * (呼び出し側の scripts/build.mjs が警告ログを出すために使う)。
 */
export function buildPublicData(catalog, settings, generatedAt, excluded = []) {
  const visibleGames = (catalog?.games ?? [])
    .filter((g) => g.visible)
    .map(({ visible, name_ja, played, stream_url, show_playtime, image, developer, publisher, ...g }) => {
      // デフォルトと異なる値のみ公開データに含める(サイズ削減)
      if (name_ja && name_ja !== g.name) g.name_ja = name_ja;
      if (played) g.played = true;
      if (stream_url) {
        const normalized = normalizeStreamUrl(stream_url);
        if (normalized) {
          g.stream_url = normalized;
        } else {
          excluded.push({ appid: g.appid, name: g.name, field: 'stream_url' });
        }
      }
      if (show_playtime === false) g.show_playtime = false;
      // image は取得できた場合(truthy)のみ出力する(null=取得試行済みだが無し、は出力しない, REQ-025)
      if (image) g.image = image;
      // developer/publisher も同様に取得できた場合のみ出力する(REQ-035)
      if (developer) g.developer = developer;
      if (publisher) g.publisher = publisher;
      return g;
    });

  const channelUrl = normalizeStreamUrl(settings.channel_url);
  if (settings.channel_url && !channelUrl) {
    excluded.push({ field: 'channel_url' });
  }

  return {
    generated_at: generatedAt,
    fetched_at: catalog?.fetched_at ?? null,
    published: settings.published === true,
    site: {
      title: settings.site_title || 'My Game Shelf',
      description: settings.site_description || '',
      default_lang: settings.default_lang === 'en' ? 'en' : 'ja',
      show_playtime: settings.show_playtime !== false,
      show_played: settings.show_played !== false,
      show_last_played: settings.show_last_played !== false,
      show_developer: settings.show_developer !== false,
      channel_url: channelUrl || '',
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
