// Steam API から所有ゲームを取得し、data/catalog.json を更新する。
// 使い方: STEAM_API_KEY=xxx STEAM_ID=xxx node scripts/update.mjs
// 既存カタログの visible フラグ(非表示設定)は維持される。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchOwnedGames,
  fetchLocalizedName,
  mergeCatalog,
  parseJsonc,
} from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(root, 'data', 'catalog.json');
const settingsPath = join(root, 'config', 'settings.jsonc');

const apiKey = process.env.STEAM_API_KEY;
const steamId = process.env.STEAM_ID;
if (!apiKey || !steamId) {
  console.error('環境変数 STEAM_API_KEY と STEAM_ID を設定してください。');
  console.error('GitHub 上では リポジトリの Settings > Secrets and variables > Actions に登録します。');
  process.exit(1);
}

const settings = parseJsonc(readFileSync(settingsPath, 'utf8'));
const prevCatalog = existsSync(catalogPath)
  ? JSON.parse(readFileSync(catalogPath, 'utf8'))
  : null;

const fetched = await fetchOwnedGames(apiKey, steamId);
const { games, newGames } = mergeCatalog(
  fetched,
  prevCatalog,
  settings.default_visibility !== false
);

// 日本語ゲーム名の差分取得。
// ストア API はレート制限が厳しい(概ね 200 req/5min)ため、1回の実行で最大 150 件に抑え、
// 未取得分は次回以降の実行で少しずつ埋める。取得結果(null 含む)はカタログにキャッシュされ、
// name_ja キーが既に存在するゲームは再取得しない。
if (settings.fetch_japanese_names !== false) {
  const MAX_PER_RUN = 150;
  const WAIT_MS = 1500;
  const pending = games.filter((g) => !('name_ja' in g));
  const targets = pending.slice(0, MAX_PER_RUN);
  if (targets.length > 0) {
    console.log(
      `日本語名を取得中: ${targets.length} 件 (未取得 ${pending.length} 件)`
    );
    let fetched = 0;
    for (const g of targets) {
      try {
        g.name_ja = await fetchLocalizedName(g.appid, 'japanese');
        fetched++;
      } catch (err) {
        if (err.rateLimited) {
          console.warn(`レート制限に達したため中断します (${fetched} 件取得済み)。残りは次回実行で取得されます。`);
          break;
        }
        // 一時的なエラーはキャッシュせず、次回の実行で再試行する
        console.warn(`  appid ${g.appid} の日本語名取得に失敗: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, WAIT_MS));
    }
    console.log(`日本語名: ${fetched} 件取得 (残り ${pending.length - targets.length} 件は次回以降)`);
  }
}

mkdirSync(dirname(catalogPath), { recursive: true });
writeFileSync(
  catalogPath,
  JSON.stringify({ fetched_at: new Date().toISOString(), games }, null, 2) + '\n'
);

console.log(`取得: ${games.length} 本 (新規 ${newGames.length} 本)`);
for (const g of newGames) {
  console.log(`  [new] ${g.appid}: ${g.name} (visible: ${g.visible})`);
}
console.log(`書き込み: ${catalogPath}`);
