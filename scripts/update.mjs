// Steam API から所有ゲームを取得し、data/catalog.json を更新する。
// 使い方: STEAM_API_KEY=xxx STEAM_ID=xxx node scripts/update.mjs
// 既存カタログの visible フラグ(非表示設定)は維持される。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchOwnedGames, mergeCatalog, parseJsonc } from './lib.mjs';

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
