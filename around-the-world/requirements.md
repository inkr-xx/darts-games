# Around the world — requirements (as implemented)

## Game logic

- **Players:** **Single player** only (one name at setup).
- **Modes** (chosen before start): **1 → 20** or **20 → 1**. Rules are the same in both directions: visit every wedge **once**, in **strict order** (must complete the current wedge before advancing).
- **Board:** Wedges **1..20** only. **Bull is excluded** — a dart on bull counts as a **miss** for progression (the dart still counts toward the total dart count).
- **Hits:** Any scoring hit on the **active** wedge counts — **single, double, or triple** are equivalent (“any hit in the wedge”).
- **Misses:** A dart that does **not** land on the active wedge counts as a **miss** — including **wrong wedge** or **bull**. Each recorded dart (**hit or miss**) adds **1** to the running **total darts**.
- **Score display:** **Darts thrown** shows **confirmed** total plus **pending** darts (preview before **Confirm**); **Reset** clears pending so the number drops back to the confirmed total only.
- **Honesty:** The UI does not enforce dart order labels (no Dart 1 / 2 / 3 rows); the player records outcomes honestly like other casual scorekeepers.

## Pending, confirm, reset

- **Hit** / **Miss** append outcomes to a **pending queue** for the current round segment (up to **three** minus already confirmed darts this round).
- **Confirm** applies all pending outcomes **in order**, updating totals and progression as if those darts had been entered sequentially.
- **Reset** clears the pending queue **without** applying — restarts entry for that stretch only (confirmed score and board position unchanged).

## Rounds and progression

- Each **round** allows up to **three** darts (same upper bound as “three throws per round”).
- At the start of each round, the scoreboard shows the **next up to three wedges** in sequence for the current mode — e.g. in **1 → 20**, after wedge **6** is cleared the round might show **7, 8, 9**; near the end it might show only **19, 20** or **20**.
- After **three** confirmed darts in a round (hits or misses), the **next round** begins automatically; unused slots do not carry over as extra free darts — only behaviour documented below avoids counting unused throws.

## N/N (end round early)

- **N/N** is hidden while **pending** throws are queued (confirm or reset first).
- **N/N** is shown only when this round displays **fewer than three** wedge targets (i.e. the count of wedges for the round is **less than** the maximum throws per round, **3**) **and** at least one **confirmed** dart has been recorded this round but not yet three.
- When used, **N/N** ends the **round** immediately: **remaining throws for that round are not taken** and **do not** increase the total dart count.

## End of game and score

- The game ends when the **last** wedge in the sequence is hit (**20** in **1 → 20**, **1** in **20 → 1**).
- **Final score** = **total number of darts thrown** (every recorded hit or miss). **Lower is better** for this game type.
- If the **final wedge** is hit before using all three darts in that round, **remaining darts in that round are not needed** and **do not** count toward the score (same idea as N/N for “unused shots don’t count”).

## Technical

Shared stack, CSS loading order, persistence pattern (`localStorage` last names, `sessionStorage` in-progress game), navbar (**Home**, instructions, **Abandon game** during play), and navigation match **[`../TECHNICAL.md`](../TECHNICAL.md)**.

- **`sessionStorage`** key: **`aroundWorldState`** for in-progress / finished session restore until abandon or tab close.
- **`localStorage`** player names use the shared **`dartsLastPlayerNames`** key with other games (single saved name as a one-element list).

## UI / behaviour

- **Setup:** Player **name** and **mode** radio (**1 → 20** / **20 → 1**); **Start game**.
- **Play:** **Compact dartboard** image with this round’s wedge sectors **highlighted** (active wedge vs other wedges still in this round’s sequence); **wedge numbers** beside the board in order; **last card** header shows player and **darts thrown** (confirmed + pending preview); row **Hit N** / **Miss**; row **Confirm** / **Reset**; **pending** line lists each dart with wedge (**Hit N** / **Miss N**) when applicable; **N/N** when applicable.
- **Finished:** Shows final dart total and **New game** (returns to setup and clears session on abandon flow).
