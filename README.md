# TBC Holy Priest Log Analyzer

Analyze your TBC Classic Holy Priest performance from Warcraft Logs.

## Features

- **Healing Throughput** — Per-spell breakdown with HPS, overheal %, crit %, and contribution %
- **Cooldown Usage** — Circle of Healing, Prayer of Mending, and Inner Focus usage rates with time off cooldown
- **Renew Analysis** — Clipped renews, tank uptime, target breakdown
- **Mana Management** — Potion/rune/Shadowfiend/Innervate timing, mana timeline chart
- **Activity & GCD** — GCD utilization %, latency between casts, idle time
- **Timeline** — Cast-by-cast event log with spell, target, healing, and overheal
- **Smart Observations** — Contextual suggestions for improvement

## Setup

1. Get a WCL v1 API key from [classic.warcraftlogs.com/profile](https://classic.warcraftlogs.com/profile)
2. Open the site and paste your key
3. Enter a Warcraft Logs report URL
4. Select fight, player, and tanks
5. Click Analyze

## Deployment (GitHub Pages)

1. Push this repo to GitHub
2. Go to Settings → Pages
3. Set source to "Deploy from a branch" → `main` / `/ (root)`
4. Your analyzer will be live at `https://<username>.github.io/<repo-name>/`

## Tech

Pure HTML/CSS/JS — no build step, no dependencies, no framework. Just open `index.html`.

## Credits

Inspired by the [Shadow Priest Log Analyzer](https://trusty118.github.io/shadow_tbc/) by trusty118.
