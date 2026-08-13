// 管理ページ(admin.js)のロジックのうち、DOM に依存しない純粋な関数群。
// ユニットテストではこのファイルをモック fetch と共に直接検証する
// (admin.js 本体は import すると DOM 初期化が走ってしまうため対象にしない)。

// ---- settings.jsonc の読み書き(コメント保持) ----

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

// 既存キーは値だけ置換し、無いキーは先頭に挿入する(コメントはそのまま残る)
export function setJsoncValue(text, key, value) {
  const encoded = JSON.stringify(value);
  const re = new RegExp(`("${key}"\\s*:\\s*)(?:"(?:[^"\\\\]|\\\\.)*"|true|false|null|[\\d.eE+-]+)`);
  // 置換関数形式を使う(REQ-033)。第2引数を文字列テンプレートで渡すと、値の中に
  // "$&"/"$'" 等の特殊パターンが含まれる場合に置換結果が壊れるため
  // (新規キー挿入側も同じ理由で関数形式にしている)。
  if (re.test(text)) return text.replace(re, (m, p1) => p1 + encoded);
  return text.replace(/\{/, (m) => `${m}\n  "${key}": ${encoded},`);
}

// ---- 配信/チャンネルURLの検証(REQ-031) ----

/**
 * 配信/チャンネルURLを検証・正規化する。
 * trim → スキーム無しなら https:// を前置 → URLパース(失敗はnull)
 * → https 以外は null → hostname が youtube.com/youtu.be/twitch.tv/nicovideo.jp/nico.ms と完全一致、
 * または .youtube.com/.twitch.tv/.nicovideo.jp で終わる場合のみ正規化済みURL文字列を返す。それ以外は null。
 * (scripts/lib.mjs の同名関数と同一ロジック。用途がブラウザ側/Node側で分かれるため複製している)
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

// ---- base64 (GitHub Contents API) ----

export function decodeContent(base64) {
  const bytes = Uint8Array.from(atob(base64.replace(/\n/g, '')), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeContent(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ---- トークン検証(方式C: リポジトリ取得 + 空blob書き込みプローブ) ----

/**
 * トークンが対象リポジトリへの書き込み権限を持つか検証する。
 * 1. GET /repos/{owner}/{repo}
 *    - 401 → トークンが無効
 *    - 404 → リポジトリ名の誤り、またはトークンの対象外
 *    - 403 → x-ratelimit-remaining が '0' ならレート制限、それ以外は権限不足
 * 2. 通過(200)後、POST /repos/{owner}/{repo}/git/blobs(空 blob)で書き込みプローブ
 *    - 403 / 404 → 書き込み権限なし
 *    - 201 → 検証OK
 *    (blob は到達不能オブジェクトのためコミット・履歴に現れず、いずれ GC 対象になる)
 * `GET /repos` の permissions はユーザー権限を反映するだけで、fine-grained PAT の
 * Contents: Read-only を検出できない疑いが強いため、書き込みプローブで確定させる。
 */
export async function verifyToken(fetchImpl, owner, repo, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
  };

  const repoRes = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (repoRes.status === 401) return { ok: false, reason: 'invalid_token' };
  if (repoRes.status === 404) return { ok: false, reason: 'not_found' };
  if (repoRes.status === 403) {
    const remaining = repoRes.headers.get('x-ratelimit-remaining');
    return { ok: false, reason: remaining === '0' ? 'rate_limit' : 'no_write' };
  }
  if (!repoRes.ok) return { ok: false, reason: 'no_write' };

  const blobRes = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: '', encoding: 'utf-8' }),
  });
  if (blobRes.status === 201) return { ok: true };
  return { ok: false, reason: 'no_write' };
}

// ---- Actions ページへのリンク(REQ-019: catalog未取得時の導線) ----

/** リポジトリの「Update game list」ワークフロー実行ページのURLを組み立てる。 */
export function actionsUrl(owner, repo) {
  return `https://github.com/${owner}/${repo}/actions/workflows/update.yml`;
}
