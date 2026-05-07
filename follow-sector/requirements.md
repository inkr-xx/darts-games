# Follow-sector — requirements

Technical stack, persistence, and most UI patterns match **random-sector** (same Bootstrap/jQuery static app, shared **`../assets/darts-shared.css`**, **Home** → **`../index.html`**, **Abandon game**, mobile-first cards). **Game rules** differ as below.

## Game logic

- **Players:** 1..n.
- **Setup:** **Initial turn order is randomized** once at game start (that order is used wherever a **fixed order** among all players is needed — e.g. tie-break among leaders).
- **Board:** Sectors **1..20** (single / double / triple) and **bull** — outer **25**, inner **50**, **miss 0**. A round’s **target** is either a **numbered wedge 1..20** or **bull** (both rings when target is bull). On-target scoring follows the established target (see below).
- **Structure:** **7 rounds** only. There is **no** separate “bull-only” eighth round. **Bull** can be the round target **within** rounds 1–7 when it is chosen during **target establishment**.
- **Establishing the target each round (rounds 1–7):** Play proceeds in **target-selection visits** until a qualifying hit defines the target. **Scoring uses that target in the same visits** — no separate “setup only” dart.
  - **Qualifying hit:** The **first** dart (among all players this round) that **scores** in one of these forms **sets** the round target:
    - **Wedge 1–20** (single / double / triple) → target is that **wedge N**.
    - **Bull** — outer (**25**) or inner (**50**) → target is **bull** (both rings score for that round).
  - **Target-selection visits:** In round turn order, each player gets **up to three darts** until they qualify **or** use all three without qualifying.
    - The **qualifying dart scores** using the rules for the target it creates.
    - **Further darts in that visit** score **only** on the **now-fixed** target (off-target **0**).
    - If a player uses **three** darts without qualifying, the **next** player’s visit begins.
    - If **no one** qualifies after everyone has had their visit, the round scores **0 for all** (each player at most one target-selection visit).
- **Scoring on the fixed target:** Only on-target darts add points; everything else **0**.
  - **Target is wedge N:** **N × multiplier** on wedge **N** only (1 / 2 / 3). **Bull and other wedges 0.**
  - **Target is bull:** **25** outer, **50** inner; **all numbered wedges 0.**
- **Who throws after the target is set:** If **Pₖ** is the player whose dart **first** qualifies:
  - Players before **Pₖ** who already finished a full three-dart target-selection visit with **no** qualify take **no** further throws (**0** for the round from that visit).
  - **Pₖ** scores the qualifying dart plus any **remaining** darts in **that** visit on the fixed target only.
  - **Pₖ₊₁ … Pₙ** each get **one** three-dart visit on the target.
  - **Pₖ** does **not** get a second visit.

- **Between rounds:** Before rounds **2–7**, reorder by **total score ascending** (lowest score leads next round). **Ties:** random order among tied players (implementation: shuffle among ties).

### Examples

- **Wedge qualifies:** First scoring dart is single **10** on wedge 10 → target **10**, +10; further darts in that visit only count on **10**.
- **Bull qualifies:** Outer bull **25** → target bull, +25; next darts use bull-only scoring (25/50).
- **No qualifier:** Everyone exhausts one visit without a qualifying dart → **0** for all this round.

## Tie-break (first place only)

- Runs only if **two or more** share the highest total after **all 7 rounds**.
- **Only co-leaders** play extra waves (same play screen + **tie-break banner**).
- Each **wave:** random target — wedge **1–20** **or** bull (e.g. uniform over **21** outcomes). Same on-target rules as main game; **confirm** after each turn.
- Turn order among co-leaders: **fixed** initial order restricted to tied IDs.
- Repeat waves with a **new** random target until **one** unique leader → finished screen.
- Lower ranks are **not** tie-broken with extra throws.

## End of game and standings

- **Competition ranking**, **podium** for 1st–3rd (multiple names if tied), **Other places** for 4th+.

## Technical

- **Stack:** Static HTML, JavaScript, Bootstrap, jQuery (CDN).
- **Styles:** **`../assets/darts-shared.css`** + **`styles.css`** (game-specific overrides, e.g. hidden SVG wedge label).
- **Language:** English UI.
- **Navigation:** **Home** → **`../index.html`**.
- **Persistence:** **`localStorage`** (names), **`sessionStorage`** (in-progress game including tie-break).
- **Abandon game:** Clears session, returns to setup.

## UI / behaviour

- **Setup:** Add/remove players; **Start game** requires ≥1 name.
- **Play:** Progress bar **1–7**; tie-break uses warning styling on the bar when active; dartboard + target figure; establish-target strip vs scoring controls per phase; **Scores** table; **Confirm turn** with running total.
- **Tie-break:** Banner at top; same layout as normal play.
