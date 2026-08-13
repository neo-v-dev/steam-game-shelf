# Steam Game Shelf 🎮

[日本語の README はこちら → ../README.md](../README.md)

A template that fetches your owned games from Steam and publishes them as a website on GitHub Pages. Designed for streamers who want to share their game library with viewers.

- **Free**: Runs entirely on GitHub's free tier (Actions + Pages). No server needed.
- **Auto update**: The list refreshes daily; manual refresh is one click.
- **Admin page**: Edit visibility, played tags, and the publish state with checkboxes in your browser.
- **Hide games**: Exclude any game from the site.
- **Played tags**: Auto-detected from playtime, editable per game; shown as badges and usable as a filter.
- **Japanese / English**: Viewers can switch languages on the site.
- **Japanese titles**: Localized (Japanese) game names are fetched automatically and shown in Japanese mode; search matches both names.

## Requirements

- A GitHub account
- A Steam account with **"Game details" privacy set to Public**
- A Steam Web API key (free)

## Setup

1. **Create your repository** — Click **"Use this template" → "Create a new repository"** (choose Public; GitHub Pages on the free plan requires a public repository).
2. **Get your credentials**
   - API key: https://steamcommunity.com/dev/apikey (any domain, e.g. `localhost`)
   - SteamID64: the 17-digit number in your profile URL, or look it up at https://steamid.io
   - In Steam: Edit Profile → Privacy Settings → set **Game details** to **Public**
3. **Add secrets** — In your repo: **Settings → Secrets and variables → Actions**, add `STEAM_API_KEY` and `STEAM_ID`.
4. **Enable Pages** — **Settings → Pages → Source: GitHub Actions**.
5. **First fetch** — **Actions tab → "Update game list" → "Run workflow"**. This commits your full library to `data/catalog.json`. The site stays in "not published" mode for now.
6. **Hide games** — Open `https://<username>.github.io/<repo>/admin.html` and toggle games with checkboxes (see "Admin page" below). Alternatively, edit `data/catalog.json` on GitHub and set `"visible": false`.
7. **Publish** — Check "Publish the site" on the admin page and save, or set `"published": true` in `config/settings.jsonc`. Your site goes live at `https://<username>.github.io/<repo>/`.

From then on the list updates daily. Newly purchased games follow the `default_visibility` setting.

## Admin page

`https://<username>.github.io/<repo>/admin.html` lets you edit per-game visibility, played tags, and the publish state without touching JSON. Saving commits via the GitHub API, and the site updates in a minute or two.

Saving requires a fine-grained personal access token (GitHub Settings → Developer settings → Fine-grained tokens): limit it to your repository only, with the **Contents: Read and write** permission. The token is stored only in your browser's localStorage and is sent only to api.github.com. Anyone can open the page, but nobody can save without your token. Try the UI with `admin.html?demo=1`.

## Played tags

Each game can carry a "Played" tag. It defaults to on when playtime is over zero, and manual changes are preserved across daily updates. The site shows it as a badge and offers a played/not-played filter.

## Settings

See the comments in `config/settings.jsonc`: `published`, `site_title`, `site_description`, `default_lang` (`ja`/`en`), `show_playtime`, `show_last_played`, `default_visibility`, `fetch_japanese_names`.

Note on Japanese titles: the Steam store API is heavily rate-limited, so localized names are fetched up to 150 per run and cached in `data/catalog.json`. Large libraries fill in over a few runs (daily auto-updates or manual runs).

## ⚠️ About hiding games

Hiding removes a game from **this site only** — it is not true secrecy. The Steam API requires your "Game details" to be public, so anyone can see your library on your Steam profile. Also, since the repository is public, `data/catalog.json` (including hidden flags) is viewable. Treat this as curation, not privacy.

## Local development

```bash
STEAM_API_KEY=xxx STEAM_ID=7656... node scripts/update.mjs
node scripts/build.mjs
npx serve site   # or: python3 -m http.server -d site 8000
```

Requires Node.js 20+. No dependencies.

## License

MIT
