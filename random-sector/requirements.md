# random-sector — requirements (as implemented)

## Game logic

- **Players:** 1..n. **Setup order** is the **fixed turn order** for **every round** (rounds **1–7**).
- **Board:** Sectors **1..20** (turn score **0–9** on wedge rounds) and **bull** (miss / **5** / **10** — outer bull / bullseye by convention in the UI).
- **Structure:** **7 rounds** only. There is **no** eighth round and **no** extra tie-break **play**.
- **Random target each round:** Rounds **1–6:** uniform random wedge chosen uniformly from **1–20** excluding wedges already used in earlier wedge rounds (no bull). Round **7:** target is **always bull** (bull round scoring).
- **Turn:** Each player has **three darts** per turn, then **Confirm turn**.
- **Scoring — wedge target (1–20):** Points per dart are **not** face value; they are **multiplier points only**:
  - Miss **0**, single **1**, double **2**, triple **3** (per dart, summed for the turn).
- **Scoring — bull target:** Per dart: **0**, **5** (outer bull), or **10** (bullseye).
- **Totals:** Running **game score** per player; full **score table** visible during play.
- **Statistics for ranking ties:** When **total score** is tied, sort by per-round scores **descending**, comparing **round 7** first, then **6** … **1**. Same rank only if all seven round scores match.
- **Between rounds:** After **every** player has **confirmed** a full turn, the app advances automatically — next round’s target (random wedge on **1–6**, bull on **7**), same fixed throwing order. No separate “start round” control.

## End of game and standings

- After **round 7** completes for everyone, the game ends — **no** throw-off tie-break.
- **Ordering:** Sort by **total score** descending; if tied, by per-round scores **descending** (**round 7** first, then **6** … **1**); if still tied, **same rank** (shared podium step / shared place).
- **Standings:** Competition-style ranks (ties share rank; next rank may skip). **Podium** for **1st / 2nd / 3rd**; **“Other places”** for **4th** and below.

## Technical

Shared stack, CSS loading, persistence, and navigation are documented in **[`../TECHNICAL.md`](../TECHNICAL.md)** (includes **random-sector** legacy-save behaviour).

## UI / behaviour

- **Setup:** Add/remove name rows; **Start game** needs at least one name.
- **Play screen:** Round **progress bar** (ticks **1–7**); **phase hint** line (often empty); **dartboard** card with compact board + **large target figure** (wedge number or **Bull**); **current player** card with throws; **Scores** table.
- **Wedge rounds:** Miss / Single / Double / Triple per dart; **Confirm turn** shows running sum of **game points** for the turn (1/2/3 style).
- **Bull rounds:** Miss / **5** / **10** per dart; board uses **bull-emphasis** styling (same visual language as shared CSS “final round” bull highlight).
- **Confirm turn:** Disabled until all three darts are chosen; label **Confirm turn — N pts** when complete.
