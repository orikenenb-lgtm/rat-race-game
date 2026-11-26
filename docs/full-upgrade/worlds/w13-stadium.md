# w13 · אצטדיון הכוכבים

Mechanic id `league` (rule adapter) + module `auction` · tier 7 · unlock: ★ in any one of w6/w7/w8 · minRules 7 · difficulty 3/5 · numbers TUNE.
Spec: CATALOG-25 §1.4 (w13 card), §2.2, §2.4 (`auction`), §6.3 (`W13-*`). This file is the **as built** record (engine lane, wave A2).

## Story
> מועדון בדרג השני, אצטדיון חצי ריק ואוהדים שזוכרים ימים טובים. כל מקום בטבלה שווה כסף אחר — ובין המקום השני לשלישי עובר צוק.

## As built (rules 7 — engine lane, CATALOG-25 wave A2)

### Files
| file | role | size |
|---|---|---|
| `js/worlds/adapters/league.js` | rule adapter `league` (`uses: ['auction', 'season']`, state only in `st.world.league`) | 276 lines (V-adapter ≤ 350) |
| `js/worlds/mech/auction.js` | new engine module `auction` (tile `H`) | 102 lines |
| `js/content/deals-w13.js` | content pool `deal` on tile `O`: 5 sponsorships + 4 facilities, fictional brands | 29 lines |
| `js/worlds/w13.js` | world data, characters, decks, `lessonDefs`, `auction` wiring | 169 lines |
| `tools/policies/league.mjs` | sim plug-in + `W13-*` gates | — |
| `tests/w13.test.mjs` | 13 tests | — |

Verifier pack `w13` = those 4 js files, 62,893 chars (31.4 % of 200,000). Core grew by 158 chars (885,467 → 885,625): `'w13'` in `LAZY_IDS`
and a 2-line `onRegister` hook that registers a lazy world's `lessonDefs` — so w13's (and every later world's) lessons travel in its pack,
not in `js/life.js`. No other core change.

### Calendar (the catalog's `season` profile "league")
12 months = summer window (month 1 of each year), rounds 1–5, winter window (month 7), rounds 6–10. Round 10 is simulated at the payday that
starts month 12 and the season ends in the same payday. The w5 `season` module is hotel-specific (occupancy, allotments, 2 draws/payday, its
own `asset` hook); attaching it would add draws and hooks that mean nothing here, so the league calendar lives in the adapter and the adapter
declares `season` in `uses` (deviation, documented).

### Fixed draws (stream `world`)
- init **18** — one per starting-squad slot (sealed potential, injury-proneness, growth pace), whoever plays;
- payday **6** — 4 fixtures (our match + 3 others; drawn in window months too) + 2 injury draws (whether / who, weighted by the sealed proneness);
- `H` landing **5** — `auction`: draw 0 = the lot (player template, age, rating, sealed potential / injury / pace) and the rival count (1–3),
  draws 1–4 = one sealed ceiling per rival slot (unused slots drawn too).
- stream `content`: the pool `deal` (D = 4) on `O`, as w10.

### The league
- 3 tiers × 8 clubs, fictional names (`clubNames()`): `הדרג השלישי` (base strength 50), `הדרג השני` (58, the start), `הדרג הראשון` (66).
  Rivals = base + offsets −7…+8 ± 2 (from the season-end draws).
- Team strength = mean rating of the best 11 available players (injured / loaned out excluded; a missing place counts 35).
- A match: d = Δstrength / 12 ± 0.05 home edge; p(win) = 0.40 + 0.45·d (0.05–0.88), p(draw) = 0.27 − 0.15·|d| (0.08–0.27).
- **The cliff:** rank ≤ 2 → up a tier; rank ≥ 7 → down; prize ₪12 / 8 / 5 / 3 / 2 / 1 / 0 / 0 M × the tier's gate factor.
  Revenue by tier (expected month): tier 3 ≈ 0.49×, tier 2 = 1×, tier 1 ≈ 1.82× (gate and merchandise × 0.6 / 1 / 1.6; TV × 0.45 / 1 / 2.0).
  The panel reports the live multipliers (`league.payoff.up / down`).
- FFP: at every season end, wages > **80 %** of the 12-month revenue → a fine of 4 % of it (`league.ffp`); the crisis card `ffp` audits at 75 %.

### Money (per month, tier 2)
Gate = seats 20,000 × 2 home games × ₪150 × fill (0.55 + 0.04 × (form − 4) + fan effects, 0.25–1) — 10 match months a year; TV ₪6.5M;
merchandise ₪1.2M × (0.8 + 0.4 × fill); naming share 8 % of gate (if sold for a share). Ops ₪3.5M + ₪0.5M per tier step + training ground
₪150k + academy ₪100k. Club cash flow = revenue − wages − ops (the club asset's `cf`, paid at the next payday). Sponsors and facilities are
their own assets (sponsor money counts as revenue in the wage ratio).

### Players
- Market value `mv = ₪400k × ((r − 35) / 5)² × age factor` (≤21 1.3 · ≤24 1.2 · ≤28 1.0 · ≤30 0.75 · ≤32 0.5 · else 0.3), × 1.2 in a "transfer
  market boils" half-year.
- Wage at signing = 6 % of the rating price (min ₪20k); stars ask × 1.3, veterans × 0.9; renewal = max(old, the rating's wage).
- **Book** = fee × months left ÷ contract months (straight line to 0 at the end). The club asset's value = Σ book + stadium works + training
  ground + academy at cost → net worth counts the squad at book (hype does not count); a sale books mv − book.
- Growth: ≤ 23: +0.5 / month × sealed pace (0.4–1.4) × 1.5 with the training ground, up to the sealed potential; 24–28 +0.15; ≥ 31 −0.25.
  The shown potential range is ±15 (the coach: ±5) around the truth, never the truth.
- Contracts end → the player leaves for free. In a window, a squad below 15 is filled with free agents (age 30, rating 45, 12 months).

### Auction (`H`, שוק ההעברות)
Public: the estimate (`value`, from the public potential range), reserve (80 %), the rival count, the 3 levels (current price, +15 %, +35 %),
round `n` of 3, who outbid you and at what price, the guide's `budget`. Sealed: the true value (from the true potential, × (1.12 − 2 × injury)),
each rival's ceiling (true value × 0.8–1.3). An offer above every ceiling wins and pays the offer; else the top rival answers at min(its ceiling,
offer × 1.08); after round 3 the lot is lost. `walk` is the room-timeout safe option (never spends). The guide's pick: the **highest** level
≤ min(estimate × 0.92, budget) — say the maximum once, never chase. Budget > 0 only for a player who would start (rating in a year ≥ the
11th best + 3; youngsters ≥ the 11th best), aged ≤ 31, with the wage ratio ≤ 72 % at today's revenue **or** ≤ 62 % at the next tier's revenue in a
promotion push (tier < 1st, round ≤ 6, rank ≤ 4), keeping 2 months of the club's costs in cash.

### Z actions (`act`, ≤ 40-char params)
`sell p<id>` (≥ 15 players; −10 % outside a window) · `loanOut p<id>` (until the next window; the other club pays the wage) · `renew p<id>`
(≤ 6 months left; 36 months) · `expand` (₪50M in 2 stages of 3 months, −15 % seats meanwhile, +40 % seats; twice at most) · `train` (₪25M) ·
`academy` (₪15M, +1 youngster a season) · `naming now|share` (36 months: 70 % of 8 % × gate × 36 now, or 8 % of the gate) · `ownerLoan`
(₪10M, a liability, happiness −4) · `ownerRepay` · `wageCut` (−15 % for everyone, the best player leaves for free; once a season).

### Characters
| id | icon | cash | start NW | rule |
|---|---|---|---|---|
| `coachOwner` | whistle | ₪28M | ₪61M | sees potential ±5 instead of ±15 |
| `localTycoon` | crown | ₪85M | ₪118M | a window without a new star (rating ≥ 75 signed in the last 6 months) → happiness −5; wages × 1.1 |
| `academyDirector` | sprout | ₪30M | ₪42M | +1 academy youngster every season (age 17, rating 44–52, sealed potential); young squad, wages × 0.85 |

### Goal and stars
`all`, hold 2: `nw` ≥ ₪450M **and** `modValue wageRatio12` ≤ 0.70 (`cmp: 'le'`; 12 paydays of wages ÷ revenue incl. sponsors). maxMonths 84,
★★ ≤ 72, ★★★ ≤ 60 (all characters).

### Lessons (`lessonDefs`, registered with the pack)
`rank_cliff` צוק התגמול · `winners_curse` קללת המנצח · `book_value` ערך בספרים מול ערך בשוק. The UI lane adds their `js/data/lessons-meta.js`
entries (T-M2 reads the core list before the lazy worlds load, so it stays green meanwhile).

### Gates (N = 36 per character, rules 7, engine f5bdeeeee81a, `tools/balance-data/gates-w13.json`)
| gate | status | numbers |
|---|---|---|
| G-guide | met | 76 % · worst 56 % · coachOwner 56 % localTycoon 75 % academyDirector 97 % |
| G-blind | met | 1 % |
| G-smart | met | smart 75 % med 68 · naive 2 % med 120 |
| G-reach | met | coachOwner 53 % · localTycoon 75 % · academyDirector 97 % |
| G-loss | met | naive 98 % (bankrupt 10 %) · maxDebt 27 % · smart loses 25 % |
| G-dom | met | cells 6: saver 25 % founder 50 % diversified 25 % gambler 0 % · starsOnly 69 % (Δ 6 pp) · bidMaxAlways 42 % (Δ 33 pp) |
| G-frugal | met | f:frugal 75 % vs smart 75 % |
| G-durable | met | 210 / 210 = 100 % |
| G-time | met | median 98 rolls · median won months 68 / 69 |
| W13-cliff | met | allInPromotion bankrupt / FFP 29 % (in time 4 %) · neverSpend 45 % vs smart 75 % |
| W13-trade | met | buyYoungSellPeak top in 58 % of 6 cells · 78 % vs smart 75 % |

Margins are thin on G-dom's starsOnly (Δ 6 pp) and W13-trade (58 % of 6 cells): a re-tune should re-run both. buyYoungSellPeak beats smart by 3 pp
— trading young players is the strongest single plan, as the catalog intends, but it is not dominant.

### Deviations from the catalog
- `season` is not attached (see Calendar); `modules: ['league', 'auction']`, `uses: ['auction', 'season']`.
- The auction is one dialog (rounds inside the `H` event: `bid` / `raise` / `jump` / `walk`), not Z actions `bid {lot, amount}` / `walk` with lots
  open between rolls; same sealed model, same 5 fixed draws.
- Injuries: 1 injury at most a month (p = 0.30), 1–3 months, the player picked by sealed proneness (the catalog's "whether + which squad slot").
- Events: injury, a star's raise (market `star`), the coach poached (`coach`, no growth 6 months), a cup run (`cup`), a sponsor scandal (crisis
  `scandal`), the FFP audit (crisis `ffp`), a fan protest (crisis `protest`) + a TV deal, a transfer-fee boom, a derby, the stand roof. "A star
  asks to leave" is the wage raise (no decision card).
- Players are not engine assets (one `club` asset; the squad is `st.world.league.squad`), so the 3D board shows the stadium; players are panel rows.
- The stadium expansion is an inline 2-stage build (not the `stages` library).
