# Darts apps — shared technical specification

Applies to **follow-sector**, **random-sector**, and **max-game** unless noted.

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

Each game page loads styles in order:

1. `../assets/darts-shared.css`
2. `styles.css` (game-specific overrides only)

## UI conventions

- **Language:** English.
- **Layout:** Mobile-first; optional max-width on larger screens for setup and main cards (see shared CSS).
- **Navbar:** Game title; **`Home`** → **`../index.html`** (selector); **`Abandon game`** visible during play and on finished screen (hidden on setup).

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

### follow-sector

- **sessionStorage** may include **tie-break** phase and related state while a tie-break is in progress.
- **`styles.css`:** e.g. hides the SVG wedge label when the large target numeral is shown beside the compact board.

### max-game

- **`sessionStorage`** key **`maxGameState`** — in-progress **playing** / **finished** only (seven rounds). **`pending`** while playing is **`{ buffer: string }`** — digits typed for the **visit total** (three-dart sum); legacy saves with per-dart state are reset on load.
