# Follow-sector darts game — requirements

Technical implementation details match the **random-sector** game (same stack, persistence patterns, UI conventions). Only **game logic** differs as described below.

## Game logic

- **Players:** 1..n.
- **Setup:** **Initial turn order is randomized** once at game start (this order is used wherever a **fixed order** among all players is needed — see tie-break).
- **Board:** Sectors **1..20** (single / double / triple) and **bull** — outer **25**, inner **50**, **miss 0**. A round’s **target** is either a **numbered wedge** **1..20** or **bull** (both rings). What counts as **on target** depends on which target was chosen (see below).
- **Structure:** **7 sector rounds** only — **there is no separate eighth “bull-only” round** (unlike random-sector, which adds round **8** dedicated to bull). Here, **bull can still be the target within rounds 1–7** if it is **selected** during target selection.
- **Establishing the target each round (rounds 1–7):** Play proceeds in **target-selection visits** until something qualifies as the round target. **Scoring uses that target in the same visits** — there is **no** separate “setup only” dart.
  - **Qualifying hit:** The **first dart** (among all players so far this round) that **scores** in one of these forms **qualifies** the round target:
    - **Numbered wedge 1–20** (single / double / triple) → round target is that **wedge N**.
    - **Bull** — **outer (25)** or **inner / bullseye (50)** → round target is **bull** (both rings are in play for that round’s scoring).
  - **Target-selection visits:** Go in **round turn order**. Each player throws **up to three darts** until they record a qualifying hit **or** use all three without qualifying.
    - **The qualifying dart counts for score** using the rules for the target it creates (see **Scoring on the target**).
    - **Further darts in that same visit** (after the qualifying dart) are scored **only** against the **now-fixed** round target.
    - If the player **uses all three darts** without any qualifying hit, **the next player** begins **their own** three-dart target-selection visit.
  - **No target this round:** If **no player** qualifies before target selection is exhausted **for everyone**, the **round ends** and **every player scores 0** for that round. **Exhaustion rule:** Each player gets **at most one** target-selection visit per round; after **each** player has completed their visit without any qualifying hit, the round is **0 for all**.
- **Scoring on the target (everyone):** Once the round target is known, **only** these darts add points; everything else is **0** (miss, wrong wedge, or bull when the target is a **number**).
  - **Target is wedge N (1..20):** **N × multiplier** on that wedge only (**1** / **2** / **3**). **Bull and all other wedges 0.**
  - **Target is bull:** **Outer bull 25**, **inner bull 50**; **all numbered wedges 0** (including “wrong” triples/singles on the board).
- **Who throws after the target is set:** Suppose players are **P₁ … Pₙ** in **round turn order** and **Pₖ** is the player whose dart **first** qualifies.
  - **P₁ … Pₖ₋₁:** If they already finished a **full three-dart target-selection visit** before anyone qualified, they take **no further throws** this round (**0** points from those visits).
  - **Pₖ:** **Visit score** = **qualifying dart** (counts using the target it creates) **plus** any **remaining darts** in that visit scored **only** on the fixed target (**off-target 0**).
  - **Pₖ₊₁ … Pₙ:** Each gets **one** **three-dart** visit on the target, in order.
  - **Pₖ** does **not** get a **second** visit — their qualifying visit **is** their only visit once the target exists.

### Examples

- **Qualifying dart counts (wedge):** Dart **1** miss → dart **2** **single 10** (target **10**, scores **10**) → dart **3** **single 7** (wrong wedge, **0**) → **visit total 10** (the **10** comes **from** the wedge that qualified).
- **Bull qualifies:** Dart **1** **outer bull** (**25**) → target **bull**, **+25** → dart **2** **T20** (**0** vs bull) → dart **3** **inner bull** (**50**) → **visit total 75**.
- **A → B → C:** A misses ×3 → B misses ×3 → C hits **T15** dart **1** → target **15**; **45** from dart **1**; C scores darts **2–3** on **15** only; **A** skips; **B** gets **3** darts on **15**; **C** no second visit.
- **A → B:** A misses ×3 → B’s dart **1** miss, dart **2** **S20** (target **20**, **+20**), dart **3** **S5** (**0** on **20**) → B’s visit **20**; **A** skips (**0**); **B** done.
- **Single player:** Misses all **3** target-selection darts → no next player → round **0** for all (same as everyone failing one visit each).

- **Turn budget:** At most **one** target-selection visit per player per round (**three** darts); **no** second visit for the establisher.
- **Between rounds:** Before **rounds 2–7**, **re-order players** by **current total score ascending** (lowest score leads off next round). **Ties:** break ties with a **random shuffle** among tied players (or stable random — implementation detail).

## Tie-break (first place only)

- Runs only if **two or more players share the highest total** after **all 7 rounds** are complete.
- **Only co-leaders** participate.
- **Wave:** Pick a **random target**: **wedge 1..20** or **bull** (e.g. uniform over **21** outcomes — implementation detail). Each co-leader gets **three darts** using the **same on-target rules** as main rounds; **confirm** after the turn (same behaviour as random-sector tie-break).
- **Turn order among co-leaders:** **Fixed setup order** restricted to tied players (the randomized initial order from setup).
- Repeat **waves** with a **new random target** (wedge or bull) until exactly one highest score → **game over**.
- Other ranks are not tie-broken.

## End of game and standings

- Same as random-sector: **competition ranking**, **podium** for 1st–3rd, **other places** list, ties sharing rank.

## Technical

(Same as random-sector.)

- **Stack:** Static **HTML**, **JavaScript**, **Bootstrap** and **jQuery** (CDN). No build step.
- **Layout:** **Mobile-first**; optional max width on larger screens for main cards.
- **Language:** **English** UI.
- **Persistence**
  - **`localStorage`:** Last-used **player names** when a game is started; setup offers **Use last names**.
  - **`sessionStorage`:** Full **in-progress game** state so **refresh** keeps the session; closing the tab/window typically clears it.
- **Abandon game** (during play or tie-break): Clears the saved session and returns to setup.

## UI / behaviour (aligned with random-sector)

- **Setup:** Add/remove name rows; **Start game** requires at least one named player; initial order can be shown as **shuffled** once names are fixed.
- **Play screen:** Round info and **current target** (**wedge N** or **bull**); **SVG dartboard** — highlight **wedge N** or **emphasize bull** (and dim the rest) matching random-sector’s bull-round styling when the target is **bull**; large dart buttons; values editable until **Confirm**. When the target is a **numbered wedge**, **bull is off-target (0)**; when the target is **bull**, numbered wedges are off-target **(0)**.
- **Confirm turn:** Disabled until all darts for the turn are set; label shows running partial total; **Confirm turn — N pts**.
- **Target selection (rounds 1–7):** UI must show **selection** vs **scoring on a known target** (establishing **wedge or bull** vs everyone throwing on that target). After the target exists, highlight **N** or **bull** like random-sector sector vs bull emphasis.
- **Tie-break:** Same layout as normal play plus a **tie-break banner**; not a separate screen.
