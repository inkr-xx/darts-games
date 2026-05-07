# random-sector — requirements (as implemented)

## Game logic

- **Players:** 1..n. **Setup order** is the **fixed turn order** for **every round** (rounds **1–7**).
- **Board:** Sectors **1..20** (miss / single / double / triple on the **round target**) and **bull** (miss / **5** / **15** — outer bull / bullseye by convention in the UI).
- **Structure:** **7 rounds** only. There is **no** eighth round and **no** extra tie-break **play**.
- **Random target each round:** Before each round, the app picks **uniformly** among **21** outcomes: wedges **1–20** **or** **bull** (each wedge has the same chance as any other single outcome; bull is one of the 21).
- **Turn:** Each player has **three darts** per turn, then **Confirm turn**.
- **Scoring — wedge target (1–20):** Points per dart are **not** face value; they are **multiplier points only**:
  - Miss **0**, single **1**, double **2**, triple **3** (per dart, summed for the turn).
- **Scoring — bull target:** Per dart: **0**, **5** (outer bull), or **15** (bullseye).
- **Totals:** Running **game score** per player; full **score table** visible during play.
- **Statistics for ranking ties:** On wedge rounds only, the app counts **triples**, **doubles**, and **singles** (multipliers **3 / 2 / 1** on the target). Bull rounds do **not** add to these counts.
- **Between rounds:** After **every** player has **confirmed** a full turn, the app advances automatically — new random target (wedge or bull), same fixed throwing order. No separate “start round” control.

## End of game and standings

- After **round 7** completes for everyone, the game ends — **no** throw-off tie-break.
- **Ordering:** Sort by **total score** descending; if tied, by **most triples**, then **most doubles**, then **most singles**; if still tied, **same rank** (shared podium step / shared place).
- **Standings:** Competition-style ranks (ties share rank; next rank may skip). **Podium** for **1st / 2nd / 3rd**; **“Other places”** for **4th** and below.

## Technical

- **Stack:** Static **HTML**, **JavaScript**, **Bootstrap**, **jQuery** (CDN). No build step.
- **Styles:** Shared **`../assets/darts-shared.css`** plus **`styles.css`** in this folder.
- **Layout:** Mobile-first; optional max width on larger screens for setup / cards (shared CSS).
- **Language:** English UI.
- **Navigation:** **Home** links to **`../index.html`** (selector page).
- **Persistence**
  - **`localStorage`:** Last-used player names; setup offers **Use last names**.
  - **`sessionStorage`:** In-progress game; refresh keeps the session; closing the tab usually clears it.
- **Abandon game:** Clears session and returns to setup.
- **Legacy saves:** Old sessions with tie-break or round **> 7** are discarded on load.

## UI / behaviour

- **Setup:** Add/remove name rows; **Start game** needs at least one name.
- **Play screen:** Round **progress bar** (ticks **1–7**); **phase hint** line (often empty); **dartboard** card with compact board + **large target figure** (wedge number or **Bull**); **current player** card with throws; **Scores** table.
- **Wedge rounds:** Miss / Single / Double / Triple per dart; **Confirm turn** shows running sum of **game points** for the turn (1/2/3 style).
- **Bull rounds:** Miss / **5** / **15** per dart; board uses **bull-emphasis** styling (same visual language as shared CSS “final round” bull highlight).
- **Confirm turn:** Disabled until all three darts are chosen; label **Confirm turn — N pts** when complete.
