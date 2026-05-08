# Darts apps — shared technical specification

Applies to **follow-sector**, **random-sector**, **max-game**, **min-game**, and **around-the-world** unless noted.

## Stack & delivery

- Static **HTML**, **JavaScript**, **Bootstrap** (CDN), **jQuery** (CDN). **No build step.**

## Repository layout

| Path | Role |
|------|------|
| **`index.html`** (repo root) | Game selector (links to each game’s `index.html`) |
| **`assets/darts-shared.css`** | Shared layout and component styles (dartboard, podium, setup width, progress bar, etc.) |
| **`follow-sector/`** | `index.html`, `app.js`, `styles.css` |
| **`random-sector/`** | `index.html`, `app.js`, `styles.css` |
| **`max-game/`** | `index.html`, `app.js`, `styles.css` |
| **`min-game/`** | `index.html`, `app.js`, `styles.css` |
| **`around-the-world/`** | `index.html`, `app.js`, `styles.css` |

Each game page loads styles in order:

1. `../assets/darts-shared.css`
2. `styles.css` (game-specific overrides only)

## UI conventions

- **Language:** English.
- **Layout:** Mobile-first; optional max-width on larger screens for setup and main cards (see shared CSS).
- **Navbar:** Game title; **`Home`** → **`../index.html`** (selector); **`Instructions`** → **`../instructions.html?game=<game-id>`** (loads `README.md` via Marked + DOMPurify — same behaviour as the hub); **`Abandon game`** visible during play and on finished screen (hidden on setup).

## Persistence

| Storage | Contents |
|---------|----------|
| **`localStorage`** | Last-used player names when a game is started; setup offers **Use last names**. |
| **`sessionStorage`** | Full in-progress game state so **refresh** keeps the session; closing the tab/window usually clears it. |

## Abandon game

Clears the saved session (`sessionStorage` game key), resets client state, returns to setup.

---

## Game-specific notes

### random-sector

- **Legacy sessions:** On load, discard corrupted or obsolete saves (e.g. old tie-break phase, round **> 7**) and show setup.
- **Targets:** Rounds **1–6** — uniform random wedge **1–20**. Round **7** — **bull** only. Older saves with bull on rounds 1–6 are corrected on load when possible.

### follow-sector

- **sessionStorage** may include **tie-break** phase and related state while a tie-break is in progress.
- **`styles.css`:** e.g. hides the SVG wedge label when the large target numeral is shown beside the compact board.

### max-game

- **`sessionStorage`** key **`maxGameState`** — in-progress **playing** / **finished** only (seven rounds). **`pending`** while playing is **`{ buffer: string }`** — digits typed for the **visit total** (three-dart sum); legacy saves with per-dart state are reset on load.

### min-game

- **`sessionStorage`** key **`minGameState`**. Same keypad **`pending`** shape as **max-game**. **Standings:** lowest cumulative score wins; an entered visit of **0** adds **60** to the running total (miss rule).

### around-the-world

- **`sessionStorage`** key **`aroundWorldState`** — in-progress **playing** / **finished**; **`pendingRound`** holds unconfirmed Hit/Miss entries until **Confirm** (same refresh behaviour as other games). **Random** mode also stores **`visitOrder`** (permutation of 1–20) and **`progressIndex`**.
