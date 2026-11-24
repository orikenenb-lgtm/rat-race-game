# w10 · מרכז הפיננסים

Mechanic id `portfolio` · tier 7 · unlock: ★ in any one of w6/w7/w8 · minRules 6 · difficulty 4/5 · numbers TUNE.

## Story
> משרד משפחתי בקומה ה־40. מאות מיליונים בעשרות נכסים, ושאלה אחת שמכריעה: כמה מזה אפשר למכור מחר בבוקר בלי להפסיד.

## Visual language
- Glass tower at blue hour: sky `#0f172a → #3b82f6`, navy board `#1e293b`, gold accent `#d4af37` (ink `#a16207` on light, `#facc15` on dark).
- Decor `towers` with a scrolling ticker ribbon.
- Holdings appear as building blocks coloured by liquidity class (daily = glass, monthly = stone, locked = vault).
- A margin call flashes the ribbon red and drains the pieces that get sold.
- 2D motif 🏦📊.

## Money ranges
- Start equity ₪80–150M.
- Positions ₪5–80M. Private deals ₪20–100M (locked 18–36 months).
- Margin LTV by class: daily 60%, monthly 40%, locked 0%.
- Monthly returns ~±1–6% by factor.
- Goal NW **₪400M**. `econ`: loanUnit ₪1M, ddMinFee ₪250k, bands deal [5M, 100M].

## Core mechanic: factor exposure, liquidity, margin
**Holdings:** `{class, betas:{eq, rate, credit, prop, usd}, liq:'daily'|'monthly'|'locked', lockUntil, price}`.

**Factors:** 5 factor returns per payday:
- Drift by cycle phase (cycle.js multipliers), plus 5 fixed `world` draws of noise.
- Market cards are **factor shocks** (one card moves several factors: e.g. "inflation surprise" = rate +, eq −, credit −).

```
ret_h   = Σ beta_hf × factor_f       (no correlation matrix needed: correlation emerges from shared factors)
LTV     = marginDebt / Σ (value × ltvClass)
LTV > 1 → margin call (event): deposit cash | sell daily (at price) | sell monthly (−5%) | sell locked (secondary, −20…−40%)
         unresolved → forced sale in that order
capital calls: PE commitments draw 25% of the unfunded amount on sealed months (drawn at commitment, fixed 2 draws)
```

**Decisions:**
- Allocation (a buy/sell window at M/I tiles + `Z:rebalance` to a target mix, one action).
- **Leverage** (`Z:margin` borrow/repay).
- **Private deals** (higher expected return; locked; hidden quality → dd "due diligence on the manager").
- **Commitments** (a promise now, cash calls later: the liquidity trap).
- **Research focus** reveals exact betas. Otherwise the panel shows rough "low/mid/high" exposure: partial information that can be investigated.

## Mapping
| need | existing | new |
|---|---|---|
| tradeable instruments | tickers / holdings / `tradePending` | per-ticker betas and liquidity class |
| bond prices move with the rate | w2 `kind:'bond'` pricing | rate factor |
| USD | w3 `usd` ticker kind | usd factor |
| regime | `cycle.js` phase → factor drift | factor table per phase |
| hidden manager quality | `dd.js` pool `fund` | — |
| exact exposure as information | focus `research` | beta reveal |
| **new** | — | `mech/portfolio.js` (factors, betas, margin engine, margin-call tile/event, commitments and capital calls, fire-sale discounts), indicators (exposure bars, liquidity ladder by days-to-cash, LTV gauge), cityModels |

## Characters
| id | who | start | pros | cons |
|---|---|---|---|---|
| `allocator` | הדס, מנהלת השקעות | ₪90M diversified | exact betas from day 1 | mandate: max 30% per class (the trustee enforces it) |
| `heir` | אורן, יורש עם החזקה מרוכזת | ₪150M, 70% in one listed company | big start | selling the block moves its price (−1% per 5% sold) + capital-gains tax; concentration hits in shocks |
| `trader` | מאיה, סוחרת | ₪80M, margin LTV +10 pp | more leverage, cheaper trades | higher margin rate; a shock hurts more |

## Assets and deals
- Index ETFs, sector funds.
- Government bonds (short/long duration), corporate bonds (credit beta), REIT (prop beta).
- Gold, USD.
- Private equity fund commitment, private credit fund, a direct stake in a private company (locked).
- A hedge overlay (put protection: costs 1%/quarter, caps the equity factor loss).
- Traps: "guaranteed 12% yield" note (credit beta hidden 3×), an illiquid fund marked at stale prices (marks jump at reveal).

## Unique events
- Inflation surprise; a rate cut; a credit-spread blowout; a property slump; a USD spike.
- A "liquidity freeze" (monthly class becomes locked for 2 months).
- A PE distribution (cash back + gains).
- A fund gates redemptions.
- A flash crash with a quick recovery (punishes forced sellers).

## Risks
- Leverage on illiquid assets.
- Correlated drawdowns ("I owned 12 things that were all one bet").
- Capital calls arriving in a crash.
- Concentration (the heir).

## Recovery
- Deleverage early (repay margin).
- A put overlay.
- Sell daily assets before locked ones.
- A secondary sale of a PE stake (−25%).
- A credit line from a private bank (pricey).
- Bailout rule unchanged.

## Lesson
"פיזור אמיתי הוא בין דברים שלא נופלים ביחד. הכמות לא קובעת. ומינוף על נכס שאי אפשר למכור מהר הוא הדרך הקצרה למכור בתחתית."

## Goal and stars
- Goal `all`: NW ≥ ₪400M, hold 3.
- Stars: ★ 72 · ★★ 58 · ★★★ 46, plus happiness and fund **and 0 forced liquidations**.

## Solo / online / competition
- Factor noise is shared (5 fixed draws per payday); commitment draws are at commit.
- Safe = `hold` / meet the margin call by selling daily assets (non-buying).
- Rank: months → NW/target.

## Sim policies and gates
- `smart`: max LTV 0.6 of capacity; ≥ 25% daily liquidity; commitments ≤ 15% of NW; rebalance quarterly; puts in a slowdown.
- Ablations `maxMargin`, `allCash`, `privateHeavy`, `oneFactor` (all equity). Each must lose to smart by ≥ 5 pp.
- World gate: `maxMargin` has the best p90 NW **and** a worse in-time rate (variance is not skill).

## Size
L. `mech/portfolio.js` ~800 lines, data ~300, tests ~450.

## As built (rules 7 — engine lane, CATALOG-25 waves A0 + A1)

Shipped in `js/worlds/mech/market.js` (module `market`, state `st.mkt`, stream `exch`), `js/worlds/mech/portfolio.js` (module `portfolio`,
stream `world`), `js/worlds/data/companies.js`, `js/systems/content.js` + `js/content/{deals-w10,news,rumor}.js` (stream `content`),
`js/worlds/w10.js`, `tools/policies/portfolio.mjs`, `tests/{w10,market,content}.test.mjs`. It follows CATALOG-25 §3 where this file
(written before the catalog) differs: the "factor" model became a real market of fictional companies; the factors survive for the funds.
`mechanic: 'portfolio'`, `modules: ['market', 'portfolio']`, `minRules: 7`, `streams: ['exch', 'content']`.

| item | as built |
|---|---|
| rules 7 | `RULES7_FROM` = `RULES6_FROM` (placeholder — the owner confirms at release, client and verifier tested equal); `RULES_CURRENT` 7. `verify_core.nextCutover` collapses cut-overs that start on the same day (4 → 7 while all three placeholders are equal). Rules 7 ≡ 6 for every world without lazy streams: replay corpus w1–w4 144/144, rules 6 = 5 48/48, rules 7 = 5 48/48, w5–w9 rules 7 = 6 30/30 |
| lazy streams | `js/rng.js LAZY_STREAMS = ['exch', 'content']` (indices 16, 17; next free 18): created in `createGame` only for a world that declares them (and rules ≥ 7); `makeStreams` never creates them, so w1–w9 states keep exactly 16 streams |
| draws | `exch`: 37 at init (1 regime + 12 × pick / q / jitter), **69 per payday** (1 regime · 4 index · 8 sector · 48 idiosyncratic · 2 × 3 event slots · 2 relisting; a crash month is decided from the regime draw's fraction). `content`: 1 per pool at init (3), 1 per pool every 12 paydays, 4 per deal landing, 8 per payday (4 news picks × 2). `world`: 2 at init, 3 per payday (rate, credit spread, property), 4 per `Y` landing. Opposite players stay aligned on all 18 streams (validator fuzz + tests) |
| companies | 48 fictional entries (8 sectors × 6, sizes large / mid / small); M-fict: unique names / tickers, `tools/data/real-names.txt` denylist (TASE + major US / EU, hand-maintained) |
| regimes | catalog table; w10 adds `marketCfg.muAdd` +0.85 %/month to the index drift (TUNE: a 400M goal needs it); crashes (fat tail) −10…−22 % with p by regime growth 0.8 % · bubble 6 % · recession 5 % · recovery 1 % · highVol 8 % · sectorCrisis 2 % |
| company drift | idiosyncratic σ/2 per sub-step + quality alpha 3 %/month × (q − 0.45) − 0.1 % per distress point per sub-step (as tuned: the catalog's numbers left stock picking worthless) |
| events | catalog weights; company pick base 10, negative × (1 + distress) × (1.5 − q), positive × (0.5 + q) (as tuned), fraud only q < 0.35 once per company, crisis sector × 3, recent × 0.3, same type in 12 months excluded; never reads holdings |
| bankruptcy | distress ≥ 4 or the sealed fraud follow-up (50 % within 3 months); price → recov (≤ 8 % × q, sealed); holding → claim paid at +3; loss booked in `closed`, loss carry; grave keeps the last 12 candles; relisting ≥ 6 months after, new id `c<n>`, pool entry never reused |
| trading | half-spread large 0.05 % · mid 0.15 % · small 0.40 % (× 2 highVol, × 3 crisis sector); commission invest.js (0.1 %, min ₪5); CGT 25 % nominal with loss carry; dividends quarterly at the company yield, 25 % withheld; index fund `IDX` (₪100 base, 2 %/yr) |
| classes / margin | daily (listed + index) 60 % (trader 70 %), monthly (funds) 40 % (0 during a freeze), locked 0 %. Margin rate = policy rate + 4 % (trader + 5 %). Borrow ≤ 95 % of capacity. LTV > 1 at a payday → call due next payday; > 1.25 → forced at once; forced liquidation down to **60 %** of capacity: daily (largest first, −3 %), funds −5 %, privates −30 % |
| funds | 12 content-pool entries (gov short / long / linked, corporate, private credit (gate risk), REIT, infrastructure, a hedge fund with sealed alpha, a "guaranteed 12 %" note (sealed 3× credit beta, defaults when the spread ≥ 4.5 pp), a non-traded property fund (sealed 1.6× beta, marked every 6 months), 2 triggered: distressed bonds after a recession, a theme fund in a bubble). Redeem at the next payday's NAV or now at −5 % |
| private deals (`Y`) | PE fund (calls 4 × 25 % at sealed 3–6-month gaps, 3 distributions from month 18–29), late VC, direct stake (locked 18–35 months), property partnership, private credit; sealed multiples (as tuned, lower than drafted: privateHeavy otherwise matched smart): PE 0.5–2.0, VC 0.1–2.8, stake 0.4–1.9, property 0.7–1.5, credit 0.85–1.3; exits × regime (recession 0.8 … bubble 1.15); due diligence (max(₪250k, 0.4 %)) narrows the band to ± 0.3; secondary sale −25 % |
| put overlay | 0.33 %/month of the daily class; pays the index's monthly loss beyond −5 % |
| characters | allocator (הדס): ₪60M cash + index ₪22M + 4 stocks ₪16M + a gov fund ₪10M + a year-old PE commitment ₪12M; free research and every band known; 30 % sector mandate · blockHeir (אורן): ₪45M + 70 % of ₪150M in the first large-cap (basis 30 %); selling the block prints −1 % per 5 % of it · floorTrader (מאיה): ₪100M cash, spread × 0.7, commission × 0.5, LTV + 10 pp, margin rate + 1 %. Ids changed from the draft (heir / trader exist in w6; ids are global) |
| limits / stars | allocator 84 (★★ 72 ★★★ 60) · blockHeir 78 (66 / 56) · floorTrader 90 (76 / 64); ★★★ also needs 0 forced liquidations (starGates) |
| guide (suggested actions) | research 3 a month; sell low band / distress ≥ 2 / > 15 % of NW / the block above 25 % (10 % a month); buy high band 12 % each, mid 4 % (≤ 2 per sector), the rest in the index; margin to 65 % of capacity in calm regimes, 25 % in recession / highVol **and after the goal is reached**; hedge in recession / highVol; keep 8 months of expenses + half the unfunded |
| Z actions | `trade` (`<id>:<b|s|B|S>:<qty|₪|all>`) · `research` · `margin` (`b:<₪>|b:max|r:<₪>|r:all`) · `redeem` · `sellNow` · `secondary` · `hedge` (`on|off`) |
| lessons | margin_call · liquidity_ladder · capital_call · correlation · stale_marks · put_overlay · mkt_candle · mkt_diversify · mkt_fees · mkt_bankrupt · mkt_rumor (js/life.js) |
| engine | multi-module: indicators / cityModels / worldActions merge every module; new hook `worth` (module value outside st.assets) in net worth **and** `metrics.totalAssets`; module liabilities now also in `metrics.totalLiabilities` (w5's seasonal line included — the NW identity now holds without a correction) |

Balance (tools/balance-data/gates-w10.json, N = 36 per character): guide 60 % (worst floorTrader 50 %), blind 6 %, smart 56 % vs naive
32 %, every character ≥ 47 %, durable 89 %, G-loss met (naive 68 % lose, maxDebt bankrupt 6 %), W10-margin **met** (maxMargin best p90 NW
519M vs smart 489M, in time 44 % vs 56 %), M-dom **met** (holdIndex 32 %, momentum 27 %, buyDip 30 %, allCash 0 %), W10-forced met
(maxMargin forced 97 %, smart 0 %). **Not met:** G-smart (smart's median won month 75 vs naive 74 — naive's few wins are fast, levered
ones), G-time (median won rolls 106 > 100; won months 75 / 71), G-dom (A4: founder best in 3/3 cells, as in w9; ablation privateHeavy only
−3 pp, the others −11…−56 pp). Next tuning step: a shorter world needs more drift, which lifts blind above 8 % — the trade-off is open.

### Takeover frequency (after A2)
`market` merger weights halved (catalog §3.5 as-built note): ≈ 0.9 takeovers a game-year instead of ≈ 1.6; bankruptcies unchanged at ≈ 0.4.
Gates re-run (N = 36, `gates-w10.json`): G-guide 60 % met (worst floorTrader 53 %), G-reach met, G-loss met, W10-margin / M-dom / W10-forced met;
G-smart (smart 57 % vs naive 31 %, median 74 vs 71 months), G-dom (founder 100 % of 3 cells) and G-time (104 rolls) stay open as before;
**G-blind moved from 6 % to 12 % (NOT met)**. A 2/3 weight was also tried: G-guide fell to 56 % (worst 47 %), so the half weight was kept.
