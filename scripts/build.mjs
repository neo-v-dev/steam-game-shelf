// data/catalog.json と config/settings.jsonc から、サイトが読む site/data/games.json を生成する。
// 非表示ゲームはこの時点で除外され、公開されるデータには含まれない。
// 使い方: node scripts/build.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPublicData, parseJsonc } from './lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(root, 'data', 'catalog.json');
const settingsPath = join(root, 'config', 'settings.jsonc');
const outPath = join(root, 'site', 'data', 'games.json');

const settings = parseJsonc(readFileSync(settingsPath, 'utf8'));
const catalog = existsSync(catalogPath)
  ? JSON.parse(readFileSync(catalogPath, 'utf8'))
  : null;

// 許可外の stream_url / channel_url は buildPublicData 内で出力から除外される。
// ここでは除外があれば警告ログを出す(REQ-031)。
const excluded = [];
const data = buildPublicData(catalog, settings, new Date().toISOString(), excluded);
for (const e of excluded) {
  const target =
    e.field === 'channel_url'
      ? 'サイト設定の channel_url'
      : `appid=${e.appid}${e.name ? `(${e.name})` : ''} の stream_url`;
  console.warn(
    `警告: ${target} が許可外のURL(YouTube/Twitch/niconicoのみ許可)のため、公開データから除外しました。`
  );
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');

console.log(
  `生成: ${outPath} (公開 ${data.games.length} 本 / published: ${data.published})`
);
if (!data.published) {
  console.log(
    '注意: settings.jsonc の "published" が false のため、サイトには準備中画面が表示されます。'
  );
}
