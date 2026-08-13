# Steam Game Shelf 🎮

[日本語の README はこちら → ../README.md](../README.md)

A template that fetches your owned games from Steam and publishes them as a website on GitHub Pages. Designed for streamers who want to share their game library with viewers.

**See it live**: [public page](https://neo-v-dev.github.io/steam-game-shelf/) / [admin page (UI only, saving disabled)](https://neo-v-dev.github.io/steam-game-shelf/admin.html?demo=1) — a permanent demo with sample data.

- **Free**: Runs entirely on GitHub's free tier (Actions + Pages). No server needed.
- **Auto update**: The list refreshes daily; manual refresh is one click.
- **Admin page**: Edit visibility, played tags, per-game playtime display, stream links, and site settings in your browser, with a thumbnail-card view (default) and a list view. Includes search, sort (name / playtime / recently played), and per-game playtime + last-played info.
- **Stream links**: A channel link at the top of the page, plus per-game stream/video links (▶ icon on cards).
- **Hide games**: Exclude any game from the site.
- **Played tags**: Auto-detected from playtime, editable per game; shown as badges and usable as a filter (can also be hidden site-wide).
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

`https://<username>.github.io/<repo>/admin.html` lets you edit, without touching JSON: per-game visibility (with search), sort (name / playtime / recently played, applied to both the list and card views), played tags, per-game playtime display, per-game playtime and last-played info, per-game stream/video URLs, site settings (site title, default language, "Card display items" — site-wide switches for playtime display and the played tag, channel URL), and the publish state. The default view is the thumbnail card view that mirrors the public page (click a card to toggle visibility); you can switch to a list view, and your choice is remembered. Each "Card display items" switch preserves per-game settings when off, and also affects more than the cards themselves — it changes the top stats bar and/or the played/not-played filter on the public page too. Saving commits via the GitHub API, and the site updates in a minute or two.

Saving requires a fine-grained personal access token (GitHub Settings → Developer settings → Fine-grained tokens): limit it to your repository only, with the **Contents: Read and write** permission. When you click "Load", progress and any errors are shown directly under the button (verifying the token → loading data). The token is verified against the target repository first — if it's invalid, scoped to the wrong repository, or lacks write access, loading is blocked with an error right away (instead of only failing later when you try to save). If you haven't run "Update game list" yet, you'll see a "data/catalog.json not found" error with an "Open Actions" button that takes you straight to the workflow run page. The token is stored only in your browser's localStorage and is sent only to api.github.com. Anyone can open the page, but nobody can save without your token. Try the UI with `admin.html?demo=1` (saving is disabled in demo mode).

## Played tags

Each game can carry a "Played" tag. It defaults to on when playtime is over zero, and manual changes are preserved across daily updates. The site shows it as a badge and offers a played/not-played filter.

## Settings

See the comments in `config/settings.jsonc`: `published`, `site_title`, `site_description`, `default_lang` (`ja`/`en`), `show_playtime`, `show_played` (also hides the played/not-played filter when off), `show_last_played`, `channel_url`, `default_visibility`, `fetch_japanese_names`.

Note on Japanese titles: the Steam store API is heavily rate-limited, so localized names are fetched up to 150 per run and cached in `data/catalog.json`. Large libraries fill in over a few runs (daily auto-updates or manual runs).

Sorting uses Japanese collation (`localeCompare('ja')`) on the localized title when available, otherwise the original title. **Games whose localized title hasn't been fetched yet sort by their (usually English) original title until it arrives.** Also, **kanji titles do not sort in reading order** (there's no furigana/reading data to sort by) — this is a technical limitation with no planned fix.

### About game images

Some newer titles don't have artwork at the guessable CDN path, so the store API's official header image URL is fetched alongside the localized name and cached in `data/catalog.json` (falling back to the guessed URL chain when it can't be fetched).

## Games that can't be fetched

Due to how the Steam Web API (`GetOwnedGames`) works, the following are not returned:

- **Unplayed free games**: free games with no recorded playtime may be missing from the API response.
- **Family Shared games**: games shared from another account's library (not owned directly) are excluded.

This is a known Steam API limitation and cannot be worked around by this tool.

## ⚠️ About hiding games

Hiding removes a game from **this site only** — it is not true secrecy. The Steam API requires your "Game details" to be public, so anyone can see your library on your Steam profile. Also, since the repository is public, `data/catalog.json` (including hidden flags) is viewable. Treat this as curation, not privacy.

## Local development

```bash
STEAM_API_KEY=xxx STEAM_ID=7656... node scripts/update.mjs
node scripts/build.mjs
npx serve site   # or: python3 -m http.server -d site 8000

# Tests (no dependencies; uses node:test only)
node --test
```

Requires Node.js 20+. No dependencies.

## License

MIT
