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
