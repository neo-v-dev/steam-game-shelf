# Steam Game Shelf 🎮

[日本語の README はこちら → ../README.md](../README.md)

A template that fetches your owned games from Steam and publishes them as a website on GitHub Pages. Designed for streamers who want to share their game library with viewers.

<!-- DEMO_LINK_START -->
**See it live**: [public page](https://neo-v-dev.github.io/steam-game-shelf/) / [admin page (UI only, saving disabled)](https://neo-v-dev.github.io/steam-game-shelf/admin.html?demo=1) — a permanent demo with sample data.
<!-- DEMO_LINK_END -->

<!-- MY_LINKS_START -->
After the first "Update game list" run, links to your own site will be filled in here automatically (this section is auto-managed)
<!-- MY_LINKS_END -->

- **Free**: Runs entirely on GitHub's free tier (Actions + Pages). No server needed.
- **Auto update**: The list refreshes daily; manual refresh is one click.
- **Admin page**: Edit visibility, played tags, per-game playtime display, stream links, and site settings in your browser, with a thumbnail-card view (default) and a list view. Includes search, sort (name / playtime / recently played / release date / developer / publisher), and per-game playtime + last-played + release date + developer info.
- **Stream links**: A channel link at the top of the page, plus per-game stream/video links (▶ icon on cards). Only YouTube (`youtube.com` / `youtu.be`), Twitch (`twitch.tv`), and niconico (`nicovideo.jp` / `nico.ms`) links are accepted — this restriction protects viewers from malicious links.
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
5. **First fetch** — **Actions tab → "Update game list" → "Run workflow"**. This commits your full library to `data/catalog.json`. The same run also automatically removes the demo intro text from the READMEs and fills in the links to your own site (that section is auto-managed — no need to edit it by hand). The site stays in "not published" mode for now.
6. **Hide games** — Open `https://<username>.github.io/<repo>/admin.html` and click cards to toggle visibility (see "Admin page" below; the default view is cards, switch to list view for checkboxes instead). Alternatively, edit `data/catalog.json` on GitHub and set `"visible": false`.
7. **Publish** — Check "Publish the site" on the admin page and save, or set `"published": true` in `config/settings.jsonc`. Your site goes live at `https://<username>.github.io/<repo>/`.

From then on the list updates daily. Newly purchased games follow the `default_visibility` setting.

## Admin page

`https://<username>.github.io/<repo>/admin.html` lets you edit, without touching JSON: per-game visibility (with search), sort (name / playtime / recently played / release date / developer / publisher, applied to both the list and card views — the admin sort always offers all options, regardless of the site-wide developer switch; release date has no display switch, so it's always offered too), played tags, per-game playtime display, per-game playtime, last-played, release date, and developer info, per-game stream/video URLs, site settings (site title, default language, "Card display items" — site-wide switches for playtime display, the played tag, the last-played date, and the developer, channel URL), and the publish state. When sorting by developer or publisher, games with the same developer/publisher are ordered by whichever sort you had selected before switching (name, by default) — the same rule applies on the public page. The default view is the thumbnail card view that mirrors the public page (click a card to toggle visibility); you can switch to a list view, and your choice is remembered. Each "Card display items" switch preserves per-game settings when off, and also affects more than the cards themselves — it changes the top stats bar and/or the played/not-played filter on the public page too. Saving commits via the GitHub API, and the site updates in a minute or two.

Saving requires a fine-grained personal access token (GitHub Settings → Developer settings → Fine-grained tokens): limit it to your repository only, with the **Contents: Read and write** permission. When you click "Load", progress and any errors are shown directly under the button (verifying the token → loading data). The token is verified against the target repository first — if it's invalid, scoped to the wrong repository, or lacks write access, loading is blocked with an error right away (instead of only failing later when you try to save). If you haven't run "Update game list" yet, you'll see a "data/catalog.json not found" error with an "Open Actions" button that takes you straight to the workflow run page. The token is stored only in your browser's localStorage and is sent only to api.github.com. Anyone can open the page, but nobody can save without your token. On a shared/public computer, clear your browser's site data after use. Also, GitHub Pages sites under `<username>.github.io` share an origin with any other repository owned by the same account, so JavaScript on another page under the same `<username>.github.io` could in theory read this localStorage (not normally an issue, but be aware if you publish untrusted code under the same `<username>.github.io`). Try the UI with `admin.html?demo=1` (saving is disabled in demo mode).

## Played tags

Each game can carry a "Played" tag. It defaults to on when playtime is over zero, and manual changes are preserved across daily updates. The site shows it as a badge and offers a played/not-played filter. Turning off the played tag site-wide (the "Card display items" switch on the admin page) hides both the badge and the filter (per-game settings are preserved and take effect again when turned back on).

## Settings

See the comments in `config/settings.jsonc`: `published`, `site_title`, `site_description`, `default_lang` (`ja`/`en`), `show_playtime`, `show_played` (also hides the played/not-played filter when off), `show_last_played`, `show_developer`, `channel_url`, `default_visibility`, `fetch_japanese_names`. Turning any of `show_playtime` / `show_played` / `show_last_played` / `show_developer` off also removes the matching sort option(s) from the public page (`show_developer` removes both "Developer" and "Publisher"), and hides the sort dropdown entirely if only "Name" remains.

Note on Japanese titles: the Steam store API is heavily rate-limited, so localized names are fetched up to 150 per run and cached in `data/catalog.json`. Large libraries fill in over a few runs (daily auto-updates or manual runs).

Sorting uses Japanese collation (`localeCompare('ja')`) on the localized title when available, otherwise the original title. **Games whose localized title hasn't been fetched yet sort by their (usually English) original title until it arrives.** Also, **kanji titles do not sort in reading order** (there's no furigana/reading data to sort by) — this is a technical limitation with no planned fix.

### About game images

Some newer titles don't have artwork at the guessable CDN path, so the store API's official header image URL is fetched alongside the localized name and cached in `data/catalog.json` (falling back to the guessed URL chain when it can't be fetched).

### About developer / publisher

The developer and publisher (the first one, when a game lists several) are fetched from the store API alongside the localized name and image, and cached in `data/catalog.json`. Only games where this was fetched successfully show a developer on their card, and are used for the "Developer" / "Publisher" sort options (games without it sort last).

### About release date

The release date is fetched from the store API alongside the localized name, image, and developer/publisher, and cached in `data/catalog.json`. It has no display or sort on/off switch — it's always shown when available (missing dates sort last). Upcoming ("coming soon") games and dates in formats we can't parse (quarter labels like "Q3 2026", year-only, etc.) aren't usable for date sorting.

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
