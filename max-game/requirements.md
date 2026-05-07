# Max — requirements

**Technical** details (stack, `assets/darts-shared.css`, persistence, **Home**, **Abandon game**) are in **[`../TECHNICAL.md`](../TECHNICAL.md)**. **Game rules** are below.

## Game logic

- **Players:** 1..n.
- **Setup order** is the **fixed turn order** for **every round** (rounds **1–7**): same sequence each round; **no** reordering between rounds.
- **Board:** Sectors **1..20** — single / double / triple (**face value × multiplier**). **Bull:** outer **25**, inner **50**. **Miss** **0**.
- **Structure:** **7 rounds**. Each round: each player gets **three darts**, then **Confirm turn** (same rhythm as the other games).
- **Scoring:** **Regular / 501-style** arithmetic on the full board each dart (not multiplier-only scoring like random-sector).

## End of game and standings

- After **round 7** completes for everyone, the game ends — **no** extra tie-break throws.
- **Ordering:** Sort by **total score** descending; **equal totals share rank** (competition-style; next rank may skip).
- **Standings:** **Podium** for **1st / 2nd / 3rd** (multiple names on a step when tied); **Other places** for **4th** and below.

## Technical

See **[`../TECHNICAL.md`](../TECHNICAL.md)**.

## UI / behaviour

- **Setup:** Add/remove players; **Start game** requires ≥1 name; **Use last names** from `localStorage` where applicable (see shared spec).
- **Play:** Round **progress bar** (**1–7**); **numeric keypad** for **visit total** (three-dart sum); **Scores** table; **Confirm turn** adds that total to the running game score.
- **Confirm turn:** Disabled until a score has been entered; label **Confirm turn — N pts** (parsed total, max **180**).
