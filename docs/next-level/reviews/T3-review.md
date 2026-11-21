# T3 "Stories & business": independent review

- **Reviewer:** independent review agent. I did not write T3.
- **Scope:** a2fcbca, 044e56b, d87eb3c, b1315a1, d9e2440, 3fc419f, f4a2c60, f1953ae, e75a002, cf2b666, 4f4d9cb, and the T3 hunks of 9d07859 (A1 guide highlight).
- **Snapshot:** every line number and probe refers to **HEAD = e75a002**, extracted with `git archive` to `/tmp/t3rev/tree`. While I was reviewing, another lane had uncommitted, half-finished edits in the working tree (`js/engine.js`, `lobby.js`, `ui.js` …). At one point those edits made `createGame` throw `tlPush is not defined`. I therefore probed the committed tree only.
- **Probes:** in `/tmp/t3rev/` (`p1` … `p16`). Each finding names the probe that backs it.
- **Suites re-run on the snapshot:** all green.
  - `tests/t3.test.mjs`: 33/33.
  - `tests/t2.test.mjs`: 17/17, including T7 rules-3 golden equality.
  - `tests/engine.test.mjs`.
  - `tests/verify.test.mjs`: 10/10.
  - `tools/build-edge.mjs --check`: pin `0d3b65e9…` is current.

**Verdict:** 0 blockers, 9 majors, 17 minors, 9 nits. The deterministic core holds up well under probing: streams, seals, replay, save round trips and integer business accounting. The problems sit in four places:
- what the cards **say** before a decision: a burnout hint off by one month, a cash chip with the wrong sign, a tax-evasion highlight;
- one real money bug: stacked pay cuts;
- the Hebrew copy: the friend's gender, and the business "why" sentence that appears every month;
- the balance report, which leaves out several targets it misses.

---

## Blockers

None.

---

## Major

### M1 — "Accepting a 10% pay cut" while on half-time *raises* the salary from 60% to 90% (money bug; the chip is also wrong)

- **Where:**
  - `js/engine.js:3520`: `grossTemp` overwrites `st.story.flags.payCut`.
  - `js/engine.js:3455`: `sidePartTime` overwrites it too.
  - `js/engine.js:3503`: `sideGraduate` sets it to `null`, which also wipes a running crisis cut.
  - `js/engine.js:372`: the payslip honours only a single cut.
- **Evidence (`p14_paycut.mjs`, w2 chef):**
  - Base gross 21,390.
  - After side s3 `partTime`: 12,830 (`{mult:0.6}`).
  - After crisis `job` → `accept`: **19,250** (`{mult:0.9}`). The card's salary chip for "accept" said −₪1,088, because `salaryDelta` is computed from the uncut base.
- **Scenario:** the crisis chain is exempt from the open-chains cap and starts in 90–98% of w1–w4 games, so a side-hustler can easily have both chains open at once. "Accept" is also the *default*, so a player who ignores the item still gets the raise.
- **Fix:**
  - Make `payCut` a list of `{src:'crisis'|'partTime', mult, until}` and multiply the active entries in `payslipOf`.
  - `sideGraduate` removes only `src:'partTime'`.
  - `salaryDelta` (chips) should start from the *current effective* gross.
  - Add a unit test for the stacked case.

### M2 — Friend chain run 2 is "מיכל", but every text is masculine

- **Where:**
  - `js/systems/chains.js:192-219`: `{name} מבקש עזרה`, `חבר מילדות`, `להלוות לו`, `{name} שוב מתקשר`, `אם הוא לא ישלם`, `{name} לא עמד`, `חתמת ערבות ל{name}`.
  - `chains.js:284-287`: the news line `{name} החזיר`.
  - `engine.js:3366-3367`: `חתמת לו`, `כבר נתת לו`, `הבנק רוצה ממנו`.
- **Evidence:** `gz()` (`engine.js:734`) only adapts text to the *player's* gender. `CH.NAMES.friend = ['יוסי','מיכל']`, and `storyVars` picks `מיכל` for run 2 (`engine.js:3346`). Result: "מיכל מבקש עזרה · מיכל, חבר מילדות … להלוות לו".
- **Fix:** pick one of these:
  - give each chain-character a gender and write `{מבקש/מבקשת}`-style template pairs, resolved in `storyVars` (for example `v.he = run2 ? 'היא' : 'הוא'`, `v.lo`, `v.asks`, …);
  - or make run 2 a male name too.

  Either way, add a U13 lint that renders f1/f2/f3a/f3b with run 2.

### M3 — Side-hustle s1: the evaluator and the guide highlight recommend **not reporting the income** ("אחר כך")

- **Where:**
  - `chains.js:155-161`;
  - `engine.js:3449` (`sideLater` preview);
  - `engine.js:3404` (`file` = `sideReportFee` every month);
  - `engine.js:895` (fee ₪200; w1 ₪120).
- **Evidence (`p4_side.mjs`, mentor guide), primary option and U in each world:**

  | World / character | Primary | U(file) | U(later) |
  |---|---|---|---|
  | w1 teacher | `later` | −0.39 | −0.03 |
  | w1 dev | `later` | −0.15 | −0.04 |
  | w2 chef | `later` | −0.32 | −0.03 |
  | w3 captain | `later` | −0.27 | −0.07 |
  | w4 founder | `later` | −0.24 | −0.01 |

  - The accountant fee (₪120–250 a month, 24 months) far exceeds the modelled penalty: 10% of one year's tax, counted once over the 24-month horizon.
- **Why it matters:** the spec §9.3 says "*so `file` is best. That is honest, and the card says so*". The game currently teaches that tax evasion pays, and the `smart` sim policy follows it.
- **Fix (any one of these):**
  - charge the year-end return / accountant cost on `later` as well (an annual return is needed either way);
  - make the late penalty interest-bearing per year, counted twice over H = 24;
  - add an audit risk shown as odds;
  - waive `sideReportFee` while side income is below a threshold.

  Then assert U(file) > U(later) for every character in U9.

### M4 — Career "warn" card: the burnout odds it shows describe the payday *after* next; three different numbers for the same risk

- **Where:**
  - the hint `pBurn`: `engine.js:3353` uses `energy + PLANS[plan].energy − workLoad×4`;
  - the evaluator flag: `engine.js:3809` uses `energy − 4`;
  - the real draw: `engine.js:815` uses `burnoutChance(L.energy)` at the start of the next payday;
  - the HUD: `engine.js:608` shows the real number.
- **Evidence (`p9_warn.mjs`, w2), card hint vs the real chance at the next payday:**

  | Plan, energy | Card hint | Real next payday | Evaluator flag |
  |---|---|---|---|
  | side, 30 | 28% | 0% | — |
  | overtime, 30 | 38% | 0% | — |
  | work, 20 | **23%** | **33%** | — |
  | study, 26 | 33% | 0% | `burnout` |

  The study row is flagged although the real chance is 0. The work row *understates* the real risk.
- **Why it matters:** this is exactly the "hint accurate vs the sealed odds" requirement. The card text says "בחודש הבא".
- **Fix:**
  - `pBurn = burnoutChance(L.energy)`;
  - optionally a second line "ואם תמשיך כך עוד חודש: X%" built from the projected energy;
  - make the evaluator flag use the same function and value as the hint.

### M5 — Side s2 "לקחת": the card says **+₪10,500 now**; the option actually takes **−₪12,600 now**

- **Where:** `engine.js:3450`. The preview is `e.cash += 0.55S − 0.3S`; the apply step is `st.cash −= 0.3S` now, with `+0.55S` booked as income next month (or the month after).
- **Evidence (`p3_chips.mjs`):** card cash +10,500, real Δcash −12,600.
- **Consequences:**
  - no loan is shown, because `loanFor` gets `max(0, −cash) = 0`;
  - no `noCushion` flag is raised;
  - the impact "now" has the wrong sign.

  A player with a thin cushion is forced into a bank loan, with a credit-score hit the card never mentioned. That is a "punish with information the player could not know" case.
- **Fix:** `cash: −0.3S`, then `flow: +0.55S` with `months: 1` (or an explicit "next month" income chip). `total24` stays the same. `side.s1.later` has the same kind of mismatch on a smaller scale: it shows the year-end penalty as cash *now* (minor).

### M6 — The monthly business "why" sentence: missing space in 35% of months, and misleading cash reasons

- **Where:** `js/finance/business.js:1116-1124` and `1093-1099`.
- **Evidence (`p8_sentence.mjs`, 4,800 simulated months):**
  - **1,704** sentences contain "**אבלהקופה**". The template glues `', אבל'` to `'הקופה'`, while `', ו'` is correct as written.
  - Profit reasons are not noun phrases: "בעיקר בגלל **עלות המוצר עלתה**", "בעיקר בגלל **יותר קיבולת**".
  - The cash reason ranks only the *adjustments* and never net profit itself. So "הרווח כמעט לא זז, והקופה עלתה ב־₪7,841 **כי פחת — הוצאה בלי כסף שיצא**" credits depreciation for cash that mostly came from the profit. That is wrong pedagogy for the layer meant to teach cash vs profit.
  - **Bad-debt months (`p7_biz.mjs`, 13 of 14 such months):** the written-off receivable shows up in the cash bridge as "**נכנסו ₪9,600 מלקוחות של החודשים הקודמים**", although nothing came in. The sentence reads: "הרווח ירד … בעיקר בגלל חוב אבוד +₪9,600, אבלהקופה עלתה … כי נכנסו ₪9,600 מלקוחות".
- **Fix:**
  - use `', אבל '`;
  - rewrite the profit texts as noun phrases ("עלייה בעלות המוצר", "פחות לקוחות שלא קיבלו שירות");
  - cash clause: when `|cash.change − netProfit|` is under about ₪500, say "הקופה זזה בערך כמו הרווח"; otherwise say "…יותר/פחות מהרווח, בעיקר כי {top}";
  - take written-off amounts out of ΔAR and show them as their own non-cash line "חוב אבוד — הוצאה שלא יצאה מהקופה".
- **Test:** U16 should assert that the labels tell the truth and that the `other`/`vat` remainders stay small. Today it only checks sums that hold by construction (see M9).

### M7 — Balance: what really drives the smart − guide gap is the card highlights, not the "coupled levers" the report blames

- **Where:** `tools/balance-report.md` ("Reading", "Not met").
- **Evidence:**
  - **`p15_gap.mjs`:** I built a hybrid policy that taps the guide highlight on cards and uses smart's between-roll actions. It does no better than the plain guide:

    | World | guideTapper | hybrid | smart |
    |---|---|---|---|
    | w4 (n 45) | 64% | 64% | 80% |
    | w1 (n 60) | 68% | 65% | 93% |

    So the 15–25 pp gap comes from which option is highlighted, not from fund, loan or invest behaviour.
  - **`p16_disagree.mjs`:** where the guide highlight and smart's choice differ (w1 + w4, 10 seeds per character):
    - **DD:** w1 real estate `buy→inspect` ×104, w1 businesses `buy→inspect` ×67, w4 campus `offer→inspect` ×70. The guide never highlights inspection.
    - **T3 setups:** w1 business offers: the guide highlights **`start:strong`** in 37 of 71 offers where smart picks std or passes. Setups are scored by the 3-month forecast net, which ignores the capital tied up (`engine.js:1723-1734`).
    - **Payday:** `plan:rest` is highlighted ×157 where smart keeps working.
- **Fix, with the expected effect:**
  - At guide level, highlight `inspect:1` exactly when the policy's `ddRule('flagged')` would fire (warn flags ≥ 1 and claimed net > 0). Inspection was decisive in the A9 ablation (−7…−17 pp without DD).
  - Score setups by return on capital: `net ÷ startCapital`, or `net − loanMonthly − capital × the world's opportunity rate`.
  - Align the payday plan highlight with `planFor(…,'smart')`.

  These are content-level changes that raise guideTapper without touching smart. **My estimate:** +6…+10 pp for guide in w1/w4, enough for A1's 60% floor in w4. It needs one sim run to confirm.

### M8 — Chain start rates: the report says only crisis/career miss their targets; car, move and friend miss too, and the fix is concrete

- **Evidence:** `tools/balance-report.md`, T3 table (and `stories-w*.json`), against the spec §12.15 band of 25–60%:

  | Chain | w1 | w2 | w3 | w4 | Over 60% in |
  |---|---|---|---|---|---|
  | car | 56% | **67%** | 55% | **64%** | w2, w4 |
  | move | 60% | **67%** | 52% | **64%** | w2, w4 |
  | friend | **61%** | **72%** | 51% | 59% | w1, w2 |

  - w1 business items have a **p90 of 10** per business-year against the ≤ 6 target, and the table does not flag it. This is partly a measurement artifact: `tools/sim.mjs:589` adds only `+6` months for a sold business but counts all of its items.
  - Rates come from free play capped at 1.6× the month limit, not the spec's time-limited mode, so they are biased upward.
  - `p11_seals.mjs`: `crisis.c1` appeared 768 times in 480 games, **1.6 crises per game** (`maxRuns: 2`).
- **Fix, with arithmetic:**
  - **Crisis:** today the start rate is P(start) ≈ 1 − 0.3^k_rec × 0.7^k_tile, where k_rec is the number of new recession labels per game and k_tile the number of crisis tiles. With k_rec ≈ 1.5 and k_tile ≈ 2 this gives ≈ 0.92, which matches the measured 90–98%. Changing the odds from 0.7/0.3 to **0.45/0.2** gives 1 − 0.55^1.5 × 0.8^2 ≈ **0.74**. Also set **`maxRuns: 1`**, which halves the crisis items.
  - **Career:** promo needs `r < 0.35` from month 24; warn needs `energyLow ≥ 3 && energy < 30`. Estimated start ≈ 65–75%.
  - **car / move / friend:** chain cooldown 24 → 30 and `maxRuns` 2 → 1 for friend (estimate −8…−12 pp).
  - **Items per 12 months (median 1.4, target 2–3):** add follow-up steps instead of more starts:
    - a promo "six months in the role" decision, which today is only news;
    - a second `m2renew` a year later for renters;
    - a "פתח בכל זאת" follow-up after friend `no`;
    - an inbox nudge back to a car after 12 months on the bus.

    Each adds about 0.2–0.4 items a year.
  - Fix the business-months normalisation in `sim.mjs:589`.

### M9 — Several T3 tests cannot fail for the property they claim

- **U10 mid-chain round trip** (`tests/t3.test.mjs:135-159`): it compares `clone(deserialize(s))` with `deserialize(serialize(st))`. Both sides go through `ensureStoryState`, and neither is continuous play. My `p1_roundtrip.mjs` checked the real property and it **holds**: 241 checkpoints, 0 diffs, against a JSON clone without deserialize. The test as written proves nothing; use `cb = clone(b)`.
- **U18 frequencies** (`:446-448`): this measures a local Lehmer PRNG against 0.25 / 0.08. It never touches the engine. It would not catch the `advance` correlation (m2).
- **U16 why invariants** (`:386-401`): both bridges end with a remainder line (`other`, `vat`), so the sums hold by construction. They should assert `vat === 0` and labels that tell the truth. That would have caught M6's bad-debt mislabel.
- **§12.3** (`:78-81`): the per-business loop body is `void a`, with no assertion.
- **§12.15–16** (`:363-372`): it prints start rates but only asserts `p90 ≤ 6.5` and `career ≥ 0.3`. No upper bounds and no item median, so M8 passes silently.
- **U13** checks lengths and `זוכר→זוכרת` only. It would not catch M2 or M6.

  **Meaningful as written:** §12.2 (streams on/off), §12.4 replay, U12+ seal scramble, U5 lint, U15 previews ±₪1, U17.

---

## Minor

- **m1 — lateClient "advance": the late odds are wrong once the client agrees.** `business.js:978-979`. Agreement is `(a+0.5)%1 < 0.6` and lateness is `a < 0.25`, using the same draw. So P(late | agreed) = 0.1/0.6 = **1/6**, while the card (`:893`) says "1 מכל 4". `p2_odds.mjs` measured 0.186 (n 183) and 0.144 (n 215). Fix: decide agreement with `(b+0.37)%1` and keep `bad` on `b`, or use a derived third value. Alternatively, change the text.
- **m2 — Luck accounting (end screen only).**
  - `engine.js:3537`: options with `oddsMoney` but no `o.odds` (`friendMore`, `friendPartner`, `engine.js:3463/3465`) always book the "miss" branch. Partner books −0.6 × the stake value every time; more-lend books +0.4 × the extra.
  - The friend lend/guarantee outcome is booked twice: as `story` at f1, and as `friend` in `friendResolve` (`:3680`, `:3691`).
  - `friendResolve` adds the luck **again on every pacing retry** of f3a/f3b (`:3687`, `:3693`).
  - Fix: book story luck only when `o.odds` is set; skip f1 because friendResolve owns it; guard with `d.luckDone`.
- **m3 — Verifier fallback 3→4: the claim "gives a cheater nothing" is false** (`verify_core.js:133-140`). `p10_fallback.mjs`, same seed and policy: rules 4 is harder on average (smart in time 106 vs 117 of 130), but **strictly better on 15% of seeds (smart) and 12% (guide)**. Best-of-two is a real option.
  - The fallback also stays open forever for challenges created before 2026-12-07.
  - The practical risk is low, because a client-side engine already gives a cheater foresight.
  - Fix: allow the fallback only when the row's day is ≥ RULES4_FROM − 7, count `rulesFallback` in monitoring, and correct the comment.
- **m4 — challenge_day vs the lobby.** The server uses the Israel date of `created_at` (`index.ts:89`). The lobby uses `c.created_at || c.starts_at` (`js/lobby.js:351` at HEAD), but the challenge shape in `net.js:79` has only `starts_at`. A challenge created before the cut-over with a later `starts_at` diverges, and only the fallback (m3) rescues it. The reverse is impossible. `rr_begin.date_key`, which the lobby prefers, is not defined in the in-repo migrations. Fix: have `rr_begin` return the server-computed `date_key` (backend lane), and keep the fallback window from m3.
- **m5 — Bundle headroom.** The bundle is **732,485 chars** (810,489 bytes) against `MAX_BUNDLE = 900,000` chars (`verify_core.js:5`): 81% used, 18.6% left. This wave alone added about 165 KB. One more wave of this size breaks the bootstrap path, and `MAX_BODY` (1 M) must hold the bundle plus actions. Fix: raise to 1.5 M / 1.8 M and add a `build-edge --check` gate requiring ≥ 25% headroom.
- **m6 — The lease path holds one of the two open-chain slots for up to 36 months.** `chains.js:46-48` (`keep`/`downsize` → `s3leaseEnd` at `leaseEnd`); `engine.js:3563`. For the whole time, car, move and friend entries get substituted. Fix: don't count `wait` chains whose `nextAt` is more than 6 months away toward the cap.
- **m7 — Selling a leased car creates money.** `bus` (`chains.js:33`) and `drop` (`:41`, +0.4S "למכור") apply to every `car`-tagged line. That includes `ליסינג` (w1 dev) and `ליסינג רכב יוקרה` (w2 lawyer); `expenseTag`, `engine.js:3197`, tags them `car`. You cannot sell or cut a lease for free, and the `הלוואת רכב` line stays. The w3 exporter's work van `טנדר` is also "given up". Fix: tag lease lines `lease` and have `drop`/`bus` add an early-exit fee, or leave them out.
- **m8 — Periphery twice.** `chains.js:85` has no `when`. A second move run offers "לעבור לפריפריה" while already there and cuts the rent by another 25%. Fix: `when: 'center'`.
- **m9 — Crisis c1 `pause` never resumes.** `chains.js:233`, `engine.js:3473`. The standing order stays 0 after the recovery card; the spec vocabulary has `autoInvest:'resume'`, but no step uses it. Fix: add a `resume` option to `recovery` when `data.auto > 0`.
- **m10 — The recovery hint mislabels a number.** `chains.js:253` / `engine.js:3358`. `{diff}` is the *gain* (`units×price − spent`), but the text says "שוות היום". With no standing order it reads "קנה 0 יחידות — שוות היום ₪0". Fix: say "הרווח עליהן", and hide the line when `unitsDuring = 0`.
- **m11 — Legacy v3 bus saves never get `noCar`.** `engine.js:3219` requires `!carLines(st).length`, but the v3 bus left the reduced line labelled "רכב". The spec's L.events check is therefore dead, and such saves keep getting car repairs and car s1. Fix: drop the `&& !carLines` condition and retag that line `transport`.
- **m12 — The substitution fallback moved the over-draw instead of removing it.** In the t3 run's standalone counts, reserve (287), health (277) and parent (264) come out at ≈ 1.8× the mean of the other standalone cards (151). The §12.10 check covers only `vacation`. Fix: add the 3–4 standalone cards from the spec risk table, and put `quiet` in the rotation.
- **m13 — Study-plan dominance (A7, pre-T3, but the brief asks for a fix).** The evaluator credits `0.2 × baseNet × 24/8` per study month (`engine.js:2497`, `3384`). That is about **0.6 net a month against 0.12 net tuition**, on the *net* salary although the raise is +20% *gross* (about +14–16% net), and with no check that the game has 24 months left after the degree. Fix and expected effect:
  - value = `salaryDelta(1.2) × min(24, maxMonths − month − remainingStudy) / need`;
  - study plan `grossMult 0.9` (part-time) or `studyRaise 0.12` for characters who already hold degrees (doctor, lawyer, engineer, dev).

  Estimated top share: 100% → about 60–75% (late-game and high-earner appearances flip), while it stays the right call for low earners early. One `--dominance` run would confirm.
- **m14 — `shadowOf` (impact panel) does not neutralise story seals.** `engine.js:4102-4116` leaves `st.story.r`, item seals, `chains.*.seal`, `bizStory`, `arTerms` and `decide.seal` untouched. There is no leak today: only L-card chain options are "major", and those use `p.r`, which is neutralised to 0.5. But any future `q:` or inbox impact panel would reveal outcomes, for example a rent negotiation or a buyer's counter-offer. Fix: neutralise them in `shadowOf` now.
- **m15 — The cross-chain "זוכר?" line never shows on steps that have their own `remember`.** `engine.js:3749` takes `[…][0]`.
- **m16 — The career warn text "{months} חודשים בלי הפסקה" counts *all* work months of the game** (`engine.js:3353`), not consecutive ones. The promo6 news "הכוח בממוצע" prints the current energy (`:3361`).
- **m17 — L2 summary.** The `opex` group amount includes `badDebt`, but its `lines` filter leaves it out (`business.js:781`), so the group doesn't add up in the UI.

---

## Nits

- **n1 — Conditioned seals (a latent trap).** Career items are created only when `S.r[1] < 0.5` (`p11`: P(b<.5) = 1.000 for warn/promo/degree), and crisis c1 only when `S.r[0] < 0.7/0.3` (mean a = 0.34). No option of those steps uses the conditioned draw today. Add a U5 lint: "a triggered step's odds may not use the draw its trigger tested".
- **n2 — `'q:<item>:<choice>'` is parsed with `split(':')`** (`engine.js:2241`): a choice id containing `:` (for example `grad:coffee`) would be cut short. Use `indexOf` on the second colon.
- **n3 — Doc drift.** Spec implementation note 14 says `lifeMoneyScale 0.35`; the code is 0.28 (`w1.js:30`, f4a2c60).
- **n4 — w1 scale realism.** Car s1 says "תיבת הילוכים, ₪800" (0.4 S × 0.28). Use a w1-specific text ("המצבר מת").
- **n5 — After `bus`, w3/w4 want-doodads can still sell you a sports car while `noCar` stays true.**
- **n6 — `s1 new` lease is added on top of the old car's line.** You pay both forever. Spec-conformant, but reads oddly.
- **n7 — `buyerOffer` previews are 0 for every choice**, so at guide level the evaluator is indifferent and highlights `keep`. Value `sell` as `offer − valuation.price`.
- **n8 — Valuation includes `arTerms` that are sealed `bad`.** A buyer pays for a debt that will be written off. It doesn't leak (public) but it is generous.
- **n9 — The balance-report A10 row says "met"** while the reading admits about 69% of the pre-T2 speed. Mark it "unconfirmed".

---

## Verified OK (with evidence)

**Streams and determinism**
- `story` = 2 draws per payday; each business = 2 story draws plus 3 luck draws per simulated month (§12.3).
- Pre-existing streams are identical with stories on and off (§12.2).
- **Choice independence:** `p6_choiceindep.mjs` resolved 507 inbox items with every enabled option and compared all 15 global streams over 12 following rolls. **0 diffs in 11,368 comparisons.**
- Card substitution, variants and the bike-doodad swap are draw-free.

**Replay and saves**
- Replay is byte-identical with and without `Q` (§12.4).
- `p1_roundtrip.mjs`: continuous play vs `deserialize(serialize())` at 241 mid-game checkpoints (open L chain cards, open items, scheduled steps, business items). **0 diffs.**
- `ensureStoryState` is idempotent and handles T2-shaped saves and an open `L.friend` (§12.6).
- Rules-3 golden equality: T7, 200 games, logs and live.

**Server**
- `Q` is in `CODES` and the argument limits fit.
- The `rulesFor` duplicate is tested equal to the client's.
- `RULES4_FROM = 2026-12-07` is a Monday, so dailies and weeklies flip together.
- The weekly key → Monday derivation matches between lobby and SQL.
- Replay CPU: worst case 156 ms for a 60-month ranked game with businesses (`p13_replaytime.mjs`).
- The pin is current.

**Fairness**
- The U12+ seal scramble leaves `inbox`, `describe` and the scores byte-identical.
- No public view outputs `seal`, `late`/`bad`, `d.ok` or `called`. The buyer's offer reveals `a` by design.
- **Displayed vs realised odds** (`p2_odds.mjs`, two independent runs, 19 sealed options, n ≈ 60–600 each): car s1, friend lend/guarantee, homeRepair object, m2renew negotiate, degree interview/askHere, crisis refuse/look, side s2 take/advance, costSpike switch, lateClient accept late/bad, counter-offer. All within sampling noise; the one exception is m1.
- Item seals at creation are uniform for every step that has odds (`p11_seals.mjs`).
- impactFor on L chain cards uses `p.r = 0.5`: no leak.

**Business economics**
- `p7_biz.mjs`, 22,500 months across 5 types, 3 setups and random decisions:
  - the cash-bridge residual line `vat` is **always 0**, so the bridge is exact without a plug;
  - the party flows sum to the cash change every month;
  - every money field is an integer.
- Shock floor 0.6 is applied before the season.
- Hysteresis needs 2 / 3 months.
- Bad debt is written off at due + 1 with VAT not refunded (documented).
- Valuation counts all receivables, so `bad` doesn't leak.

**Card chips vs applied effects**
- `p3_chips.mjs`: 58 options across all six chains. Cash and cashflow match except side s1/s2 (M5) and the odds branches (expected).

**Robustness**
- Selling a business through its inbox item while its own manage card is open degrades gracefully: "העסק נמכר" (`p12_sell.mjs`).

**Pacing**
- At most 2 open items (cap 3) and at most 2 open chains in the sim.
- No standalone repeat inside 12 months.
- About 1.4 chain items and 2.4–2.9 business items a year. Not annoying; if anything sparse (M8).

---

## Memory note for the main session

Nothing new about the user. Process fact observed: another lane keeps uncommitted engine edits in the shared working tree. Reviewers and sims should run on `git archive HEAD`.
