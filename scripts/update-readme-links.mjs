// README.md / docs/README.en.md の自サイトリンク区間(<!-- MY_LINKS_START --> 〜 <!-- MY_LINKS_END -->)を、
// 実際に公開される GitHub Pages の URL で自動更新する。
// 使い方: node scripts/update-readme-links.mjs <owner/repo>
//   (GitHub Actions では $GITHUB_REPOSITORY をそのまま渡す)
// マーカーが無いファイルは「利用者が意図的に消した」とみなしスキップする。
// 差分が無い場合は書き込みを行わない(コミット対象を無駄に汚さないため)。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MARKER_START = '<!-- MY_LINKS_START -->';
const MARKER_END = '<!-- MY_LINKS_END -->';

/**
 * owner/repo から、GitHub Pages の公開URLを組み立てる。
 * repo 名が "<owner>.github.io" の場合はユーザー/組織のルートページ扱いになる。
 */
export function buildSiteUrl(repoFullName) {
  const [owner, repo] = repoFullName.split('/');
  if (repo === `${owner}.github.io`) {
    return `https://${owner}.github.io/`;
  }
  return `https://${owner}.github.io/${repo}/`;
}

/**
 * text 内のマーカー区間( <!-- MY_LINKS_START --> 〜 <!-- MY_LINKS_END --> )の中身を、
 * publicUrl を使ったリンク文言に置き換える。区間外(マーカー自体を含む)は変更しない。
 * マーカーが見つからない場合(利用者が削除した場合など)は null を返し、呼び出し側に
 * 「変更なし」と判断させる。
 * lang: 'ja' | 'en'
 */
export function replaceLinkSection(text, publicUrl, lang) {
  const startIdx = text.indexOf(MARKER_START);
  const endIdx = text.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return null;
  }
  const contentStart = startIdx + MARKER_START.length;
  const before = text.slice(0, contentStart);
  const after = text.slice(endIdx);
  const body =
    lang === 'en'
      ? `\n**Your site**: ${publicUrl} / **Admin page**: ${publicUrl}admin.html\n`
      : `\n**あなたのサイト**: ${publicUrl} / **管理ページ**: ${publicUrl}admin.html\n`;
  return before + body + after;
}

// ---- CLI ----
// テストからは上記の pure 関数のみを import して使うため、CLI 実行部分は
// 「このファイルが直接実行された場合」だけ動くようガードする。

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const repoFullName = process.argv[2];
  if (!repoFullName || !repoFullName.includes('/')) {
    console.error('使い方: node scripts/update-readme-links.mjs <owner/repo>');
    process.exit(1);
  }

  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const publicUrl = buildSiteUrl(repoFullName);

  const targets = [
    { path: join(root, 'README.md'), lang: 'ja' },
    { path: join(root, 'docs', 'README.en.md'), lang: 'en' },
  ];

  for (const { path, lang } of targets) {
    const before = readFileSync(path, 'utf8');
    const after = replaceLinkSection(before, publicUrl, lang);
    if (after === null) {
      console.log(`スキップ(マーカー無し): ${path}`);
      continue;
    }
    if (after === before) {
      console.log(`差分なし: ${path}`);
      continue;
    }
    writeFileSync(path, after);
    console.log(`更新: ${path}`);
  }
}
