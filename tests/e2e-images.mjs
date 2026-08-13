// REQ-025 の実データ受け入れ検証スクリプト(手動実行専用)。
// ファイル名に「.test.」を含まないため node --test には拾われない。
//
// カタログJSON(ローカルパス or URL)を引数に取り、各ゲームについて次の順で
// 画像URLを解決できるか HEAD リクエストで検証する:
//   1. catalog にキャッシュされた image (g.image)
//   2. (1が無い/確認できない場合) appdetails API から取得した header_image
//      ストア API のレート制限順守のため 1.5 秒間隔。429 は 60 秒待って再開する。
//   3. (2も無い場合) 旧来の推測チェーン(header_japanese.jpg → header.jpg → capsule_616x353.jpg)
//
// 結果を「解決 N/M」として出力し、未解決の appid 一覧を表示する。
// 終了コード: 全解決なら 0、1件でも未解決があれば 1。
//
// 使い方: node tests/e2e-images.mjs <catalogのパスまたはURL>

import { readFileSync } from 'node:fs';
import { fetchAppInfo } from '../scripts/lib.mjs';

const WAIT_MS = 1500;
const RATE_LIMIT_WAIT_MS = 60000;

function guessChain(appid) {
  const base = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}`;
  return [
    `${base}/header_japanese.jpg`,
    `${base}/header.jpg`,
    `${base}/capsule_616x353.jpg`,
  ];
}

async function headOk(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

async function loadCatalog(arg) {
  if (/^https?:\/\//.test(arg)) {
    const res = await fetch(arg);
    if (!res.ok) throw new Error(`カタログ取得失敗: HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(readFileSync(arg, 'utf8'));
}

// appdetails を 1.5 秒間隔・429は60秒待機で呼び出す。
async function fetchAppInfoWithRateLimit(appid) {
  for (;;) {
    try {
      const info = await fetchAppInfo(appid, 'japanese');
      await new Promise((r) => setTimeout(r, WAIT_MS));
      return info;
    } catch (err) {
      if (err.rateLimited) {
        console.warn(`  429: 60秒待機して再開します (appid ${appid})`);
        await new Promise((r) => setTimeout(r, RATE_LIMIT_WAIT_MS));
        continue;
      }
      console.warn(`  appdetails 失敗 appid ${appid}: ${err.message}`);
      await new Promise((r) => setTimeout(r, WAIT_MS));
      return { name: null, image: null };
    }
  }
}

async function resolveGame(g) {
  // 1. catalog にキャッシュされた image
  if (g.image && (await headOk(g.image))) {
    return { url: g.image, source: 'cache' };
  }

  // 2. appdetails から取得
  const info = await fetchAppInfoWithRateLimit(g.appid);
  if (info?.image && (await headOk(info.image))) {
    return { url: info.image, source: 'appdetails' };
  }

  // 3. 旧来の推測チェーン
  for (const candidate of guessChain(g.appid)) {
    if (await headOk(candidate)) {
      return { url: candidate, source: 'guess' };
    }
  }

  return { url: null, source: null };
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('使い方: node tests/e2e-images.mjs <catalogのパスまたはURL>');
    process.exit(1);
  }

  const catalog = await loadCatalog(arg);
  const games = catalog.games ?? [];
  console.log(`対象: ${games.length} 件`);

  const unresolved = [];
  let resolved = 0;

  for (const g of games) {
    const { url, source } = await resolveGame(g);
    if (url) {
      resolved++;
      console.log(`  ${g.appid} ${g.name ?? ''}: 解決(${source})`);
    } else {
      unresolved.push(g.appid);
      console.log(`  ${g.appid} ${g.name ?? ''}: 未解決`);
    }
  }

  console.log(`\n解決 ${resolved}/${games.length}`);
  if (unresolved.length > 0) {
    console.log(`未解決 appid: ${unresolved.join(', ')}`);
  }
  process.exit(resolved === games.length ? 0 : 1);
}

main();
