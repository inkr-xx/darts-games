# Darts scorekeeper — requirements (as implemented)

## Game logic

- **Players:** 1..n. **Setup order** is the **fixed turn order** for **rounds 1–7** and is used to break ties in ordering when scores are equal.
- **Board:** Sectors **1..20** (single / double / triple) and **bull** — outer **25**, inner **50**, **miss 0** in the final round.
- **Structure:** **7 sector rounds** + **1 final (bull) round** = **8 rounds** in order.
  - **Rounds 1–7:** At the **start of each round**, a **random target sector 1..20** is chosen; **everyone** uses that sector for the whole round.
  - **Round 8:** **Bull only** — each throw is **miss (0)**, **25**, or **50**.
- **Turn:** Each player has **three darts** per turn.
  - **Rounds 1–7:** Points per dart = **sector × multiplier**, where multiplier is **0** (miss), **1** (single), **2** (double), **3** (triple).
  - **Example:** Target sector **3** → per dart **0**, **3**, **6**, or **9**.
  - **Round 8:** Sum of **0 / 25 / 50** per dart.
- **Totals:** Each player has a **running total**; **all players’ totals stay visible** during play (score table).
- **Order of play**
  - **Rounds 1–7:** Same **fixed** order every round.
  - **Round 8:** Order by **total score descending**; when scores tie, order follows **fixed setup order** among tied players.
- **Between rounds:** When every player has **confirmed** a full turn for the current round, the app **advances automatically** — new random sector (rounds 1–7) or final round (after round 7). There is no separate “start round” control.

## Tie-break (first place only)

- Runs **only** if **two or more players share the highest total** immediately **after round 8** is complete (for everyone).
- **Only those co-leaders** participate; **same rules as rounds 1–7**: one **random target sector 1..20** per **wave** (shared by all co-leaders in that wave), **three darts** per turn, **miss / single / double / triple**, **confirm** after the turn.
- **Turn order** among co-leaders: **fixed setup order** (among tied players only).
- After **each** co-leader has finished a turn in the wave: if **exactly one** player has the highest score → **game over**; else if **fewer than two** share the top score (only one leader) → **game over**; else **another wave** with a **new random sector** and updated co-leader set.
- **No bull** scoring in tie-break. **Other ranks** (2nd, 3rd, …) are **never** tie-broken with extra throws.

## End of game and standings

- When the main game ends **without** a first-place tie → **standings** immediately.
- When a **first-place tie** exists after round 8 → **tie-break** on the **same play screen** (see UI); when tie-break resolves → **standings**.
- **Standings:** **Competition ranking** (tied players share the same rank; next rank may skip). **Podium** for **1st / 2nd / 3rd** (names + totals; multiple names on one step if tied). **“Other places”** lists everyone ranked **4th and below** in a simple list.

## Technical

- **Stack:** Static **HTML**, **JavaScript**, **Bootstrap** and **jQuery** (CDN). No build step.
- **Layout:** **Mobile-first**; optional max width on larger screens for main cards.
- **Language:** **English** UI.
- **Persistence**
  - **`localStorage`:** Last-used **player names** when a game is started; setup offers **Use last names**.
  - **`sessionStorage`:** Full **in-progress game** state so **refresh** keeps the session; closing the tab/window typically clears it.
- **Abandon game** (during play or tie-break): Clears the saved session and returns to setup.

## UI / behaviour (implementation detail)

- **Setup:** Add/remove name rows; **Start game** requires at least one named player.
- **Play screen** shows: round info and target (sector or bull), **SVG dartboard** — **highlighted sector** for sector rounds and tie-break; **bull emphasized / sectors dimmed** for round 8.
- **Throws:** Large buttons per dart; values stay **editable until Confirm**.
- **Confirm turn:** Disabled until **all three** darts are set. Button label shows a **running partial total** while choosing; when complete, **Confirm turn — N pts**. No per-dart points line.
- **Tie-break:** Same layout as normal play plus a **tie-break banner** at the top; not a separate screen.
