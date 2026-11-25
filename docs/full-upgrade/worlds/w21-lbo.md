# w21 · בית ההשקעות הפרטי

- Rule adapter: `lbo` (`js/worlds/adapters/lbo.js`, `uses: ['auction', 'credit', 'holding', 'market']`)
- Tier 10. Unlock: ★ in one of w12 / w17 / w19.
- minRules 7. Difficulty 5/5. All numbers are TUNE.
- Spec: CATALOG-25 §1.4 (w21 card), §2.2, §6.3 (`W21-curse`, `W21-exit`).
- This file is the **as built** record (engine lane, wave A5).

## Story
> קונים חברה בהלוואה, מתקנים אותה ומוכרים. לקרן יש תאריך סיום, והקונים לא תמיד מגיעים בזמן.

## As built (rules 7)

### Files
| file | role | size |
|---|---|---|
| `js/worlds/adapters/lbo.js` | rule adapter `lbo` (tile `W` חברה למכירה); all state in `st.world.lbo` | 178 lines (V-adapter ≤ 350) |
| `js/worlds/w21.js` | world data, characters, decks, `lessonDefs` | 130 lines |
| `tools/policies/lbo.mjs` | sim plug-in + `W21-curse`, `W21-exit` | 79 lines |
| `tests/w21.test.mjs` | 14 tests | — |

Changes in `tools/sim.mjs`:
- `lbo` is in the plug-in list.
- `modForced` = forced exits at the fund's end.
- `modStat` = the final DPI.

No validator check was added. The pack is w21.js + adapters/lbo.js (no data file).

### The catalog's composition, as built
None of the four modules is imported. Their ideas are re-implemented inside the adapter, so `auction.js`, `credit.js`, `holding.js`, `market.js` and the packs that pin them stay untouched.

- **`auction`:** each target has 2–4 rival funds. A rival's bid = (1 + 0.5 × the sealed potential u) × 0.72…1.00 × the buy multiple (+10 % for 3 months after "קרן גדולה נכנסה לשוק").
  - Your bid wins only if it is above every rival. The dealMaker counts 5 % more.
  - Because the rivals' bids rise with u, the targets you win at a given bid have a lower u on average. That is **the winner's curse** (test: won-at-mid u is ≥ 0.05 below the pool mean).
  - Bids are a grid: low 0.85 / mid 1 / high 1.15 × the regime's buy multiple (bull 9, normal 8, bear 6.5, crash 5.5).
- **The 100-day plan** (dd) costs 0.4 % of the price, from the fund. It narrows the public band on the uplift from ± 25 % to ± 6 % (around a noisy centre).
- **`credit` (LBO debt):** debt = the chosen multiple (3 / 4 / 5, default 4) × EBITDA; at most 2 × during a credit freeze.
  - Interest: 7 % (+2 % in bear / crash / freeze) + **a leverage premium of 2 % per turn above 3 ×** (5 × pays 11 %).
  - The covenant: debt ÷ trailing-12 EBITDA ≤ 5.5 (6.5 for 12 months after "הבנקים מקלים בתנאים").
  - A breach shows on the panel ("cure" suggested). A second breach in a row: the lender takes the company; its equity is lost.
  - The cure pays down debt from the fund to 1 × under the covenant.
- **`holding.light` (the fix):** one EBITDA line per company. Monthly EBITDA = E/12 × (1 + u × up × fix) × the regime factor × ± 6 % noise.
  - The fix runs 18 months (× the character's speed).
  - Cash sweep: 60 % of EBITDA less interest pays the debt down.
  - The sealed u is −0.3…+0.9 (some companies get worse: "the books by management").
- **`market` (exits):** a trade sale = trailing EBITDA × the regime multiple (bull 10.5, normal 9, bear 7, crash 5.5) + 2 once fixed (+1.5 with a strategic buyer) − debt.
  - No sale or half-sale in a crash. IPO only in bull / normal (multiple + 0.5, −5 % fees).
  - Secondary fund: anywhere, −15 %. Half: half now, half stays.
  - **Dividend recap:** debt up to 5 × EBITDA, the extra goes out as a distribution; once a year; not in a freeze.
- **Regimes:** a Markov chain, one draw a payday (bull ↔ normal ↔ bear → crash → bear). "חלון יציאה" makes the market bull (not from a crash).

### The distinct rule — deadline-driven exits
- **Only cash returned counts.** DPI = distributions ÷ paid-in. A company worth 3 × on paper counts 0.
- **Bids close 12 months before the fund's end** (month 60 of 72).
- **At the fund's end** (month 72, the character's `end`), everything left is sold at once in the regime of the day, at a **30 % forced-sale discount** (lesson `exit_deadline`).
- **The extension:** in the last 6 months, the LPs give 12 more months at half the fee. Never for the first-time GP.

### Fees, carry and personal net worth
- **Management fee:** 1.5 % a year on committed for 36 months, then 1 % on the cost still invested (half after the extension). It is drawn from the fund. **Your share is 50 %, paid to your cash.**
- **Carry:** 20 % of what has come back past 1 × paid-in, less carry already paid. It is paid in cash at each distribution. There is no clawback.
- **The fund** (the asset "הקרן") is the LPs' money and is worth 0 in your net worth.
- **Net worth** = cash (salary, fee share, carry) − loans.

### Fixed draws (stream `world`)
- **init: 2** — the regime and a seed.
- **payday: 8** — the regime, one EBITDA draw per slot (6, used or not) and an event target.
- **`W` landing: 4** — the sealed potential, the rivals (count and bids), size and sector, and the plan's jitter.

### Tile W (חברה למכירה)
- **The card:** sector, EBITDA (2–6.5 % of the fund a year), the number of rivals, the public band, today's buy multiple, and each bid's price and equity.
- **Options:**
  - `dd` (the card stays open);
  - `bidlow` / `bidmid` / `bidhigh` (disabled with 6 companies, without the equity in the fund, or in the last year);
  - `pass` (safe).
- **The highlighted pick:** first the plan, then the highest bid at or under a "fair" value of (9 + 2) × (1 + the band centre) × 0.8 — a fixed company at a normal multiple, less time, interest and risk.

### Characters
| character | fund | fix speed | uplift | auction edge | cash | notes |
|---|---|---|---|---|---|---|
| operatingPartner | ₪3B | × 1.2 | × 1.2 | 1 | ₪8M | — |
| dealMaker | ₪3B | × 0.8 | × 0.9 | 1.05 | ₪8M | wins bids 5 % lower |
| firstTimeGP | ₪1.5B | × 1 | × 1 | 1 | ₪60M | no extension |

### Goal
- `all`, hold 2: `modValue dpi` ≥ 2.0 **and** `nw` ≥ ₪400M.
- maxMonths 84 (★★ 72, ★★★ 62). The fund ends at 72, and at 84 with the extension.

### Gates (N = 36 per character, rules 7, `node tools/sim.mjs --world-gates 36 w21`, 232 s)
| policy | in time | won | median months | bankrupt |
|---|---|---|---|---|
| guideTapper / smart | 69% | 69% | 57 | 0% |
| blindTapper | 2% | 2% | 73 | 0% |
| naive | 0% | 1% | 85 | 0% |
| saver | 0% | 0% | — | 0% |
| founder | 2% | 3% | 73 | 0% |
| diversified | 64% | 66% | 57 | 0% |
| gambler | 19% | 19% | 59 | 0% |
| f:frugal / f:none / maxDebt | 69% | 69% | 57 | 0% |
| bidMaxAlways | 36% | 36% | 55 | 0% |
| holdToEnd | 4% | 6% | 73 | 0% |
| maxLeverage | 68% | 69% | 60 | 0% |
| recapAlways | 45% | 45% | 55 | 0% |

| gate | status | numbers |
|---|---|---|
| G-guide | met | 69 % · worst 58 % (operatingPartner 72, dealMaker 75, firstTimeGP 58) |
| G-blind | met | 2 % |
| G-smart | met | smart 69 % med 57 · naive 0 % med 85 |
| G-reach | met | 72 / 75 / 58 % |
| G-loss | met | naive 100 % out of time · maxDebt 31 % · smart loses 31 % |
| G-dom | **NOT met** | A4: diversified best in 100 % of 3 cells · ablations maxLeverage 68 % (Δ 1 pp), recapAlways 45 % (Δ 23 pp) |
| G-frugal | met | 69 vs 69 % |
| G-durable | met | 143 / 149 = 96 % |
| G-time | met | median 80 rolls (p10 56, p90 91) |
| W21-curse | **NOT met** | bidMaxAlways ends with DPI < 1.5 in 25 % (needs ≥ 40 %). It loses 33 pp of in-time vs smart. |
| W21-exit | met | holdToEnd 4 % (forced exits in 100 %) vs smart 69 % |

**Open gates:**
- **G-dom.** `diversified` is smart's module play with the generic archetype's deal choices. The other three archetypes map to never bid (saver), bid high and hold (founder), and bid high + 5 × + recap (gambler), and all three lose. The maxLeverage ablation stays even with smart: 5 × debt costs 11 % against an exit multiple of 9–12.5, so even with the premium it pays.
- **W21-curse.** Bidding high after the 100-day plan costs a third of the wins, but the DPI of the high bidder clusters at 1.5–2.0, not below 1.5.

**Tuning history:**
1. The previous worker's version (DPI ÷ committed, forced sale −15 %, covenant 6, a fair-value factor 0.88): the guide finished in time in ~45 %, and naive equalled it (its forced sale at month 72 still landed in time).
2. **DPI ÷ paid-in** (the industry definition): the guide reached 63 %. The personal-NW goal still needs scale, because carry grows with the profit, so a timid fund cannot win.
3. The forced sale −30 % and the covenant 5.5 make holding to the end lose (naive 6 %, blind 3 %). A stronger curse (0.7) cut the guide to 30 %, so it was reverted.
4. A fair-value factor of 0.8 (the guide sets its price beforehand) brought the guide to 74 % at N = 36 (first full calibration).
5. **G-dom / W21-curse, attempt 1:** u went from −0.1…0.9 to −0.3…0.9. bidMaxAlways's DPI median moved from ~2.0 to ~1.85.
6. **Attempt 2:** a leverage premium of 2 % per turn above 3 ×, and a curse of 0.6. At curse 0.6 the guide fell to 56 %, so the curse went back to 0.5 and the premium stayed. Both gates are still open; stopped there.

**Deviations from the catalog:**
- **DPI ÷ paid-in, not ÷ committed.** Paid-in = everything called from the fund: equity, cures, the 100-day plans and management fees (at least 1 % of committed). Carry is measured past 1 × paid-in as well.
  - Why: with ÷ committed, an uninvested shekel counted as a loss, and the guide could not reach the goal in time often enough.
  - Paid-in is also how real funds report DPI. The NW goal (₪400M) still forces you to put the fund to work.
- **Fund life:** the catalog says "fund life = maxMonths". As built, the fund ends at month 72 and maxMonths is 84, so the 12-month extension fits inside the game.
- **The lesson `winners_curse`** is shared with w13 (both libraries list "קללת המנצח"). w21 carries the same text, so the library reads the same whichever pack loads first.
- **Not built:** add-ons and the continuation fund (the secondary covers the "sell to another fund" exit), and the "management quits" card only rolls the fix back 30 %.

### Registration
- `LAZY_IDS` + `js/worlds/all.js`.
- meta: tier 10 ← 1 of w12 / w17 / w19; status lazy; playable; diff 5.
- SQL draft row: unranked, never applied.
- Sim plug-in list.
- Re-pin:
  - core: +7 chars (885,695 / 900,000);
  - pack `w21` = w21.js + adapters/lbo.js (34,280 chars).
- Lessons (with the pack): `winners_curse` (shared with w13; its lessons-meta hint names only the stadium) and `exit_deadline` (תאריך יציאה, new). They need lessons-meta entries (UI lane; t4_meta T-M2 until then).
