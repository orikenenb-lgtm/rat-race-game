# מירוץ העכברים — Financial engine (`js/finance/*`)

Pure formula libraries behind the game's money (spec §6.3 בנקאות, §6.4 השקעות, §6.5 נדל"ן, §6.6 עסקים, §11 מנוע כלכלי אמין, §14 בדיקות).
**Only the engine (`js/engine.js`) imports these modules** (docs/ARCHITECTURE.md). The UI never computes money; it shows what the engine returns.

| Section | Owner | Files |
|---|---|---|
| 0, 1, 2, 4, 5 — conventions, banking & credit, investments, tests, integration guide (bank/invest) | Banking & credit engineer | `js/finance/bank.js`, `js/finance/invest.js`, `tests/finance.test.mjs` |
| 3 — businesses (+ its own integration notes) | Business engineer | `js/finance/business.js`, `tests/business.test.mjs` |

Each owner edits only their own sections.

---

## 0. Shared conventions (bank.js / invest.js)

* **Pure and deterministic.** No DOM, no `Date`, no `Math.random`, no I/O, inputs are never mutated. If randomness is needed (a price path), the caller passes `rand: () => [0,1)` taken from an engine RNG stream (`rng.next(st.rng, '<stream>')`). Same input gives the same output, bit for bit.
* **Cross-engine determinism.** `Math.pow/exp/log/sin/cos` are not required to be correctly rounded, so V8 (Node server checkpoint) and Safari/Firefox can differ in the last bit. That is enough to flip a rounding to the agora and break a ranked replay. Both modules use only `+ − × ÷`, `Math.sqrt/floor/round` (exact under IEEE-754) and the helpers `ipow` (square-and-multiply), `dexp`, `dlog`, `dpow` (series with fixed term counts) exported from `bank.js`. A test fails if `Math.pow|exp|log|cos|sin|random`, `Date`, `document` or `window` appear in either source file.
* **Money = integer agorot inside** (1 ₪ = 100 agorot). Inputs are ₪ numbers, converted once by `toAg`. Every balance, interest amount, fee and tax is an integer number of agorot at every step, so floats never drift.
* **Outputs:** every ₪ field is an **integer ₪** for display. The exact value is in the sibling `…Ag` field (integer agorot). For example `amortize(...).payment = 606` and `.paymentAg = 60598` (₪605.98, available via `agToIls2`).
* **Rounding policy:** half away from zero (`rnd`), to the agora, at each monthly step (indexation, then interest, then fee, then tax). A schedule's last row closes the balance exactly. ₪ columns are rounded **cumulatively** (`splitIls`), so the displayed rows always add up to the displayed total. Splits by share use the largest remainder (`splitByWeights`), so tracks or parts sum exactly to the whole.
* **Rates are decimals** (0.04 = 4%), annual. Bank products are **nominal annual ÷ 12** (as Israeli banks quote them). Investment returns default to **effective annual** (`(1+R)^(1/12)−1` per month); pass `rateMode:'nominal'` for bank-style. ⚠ `real.js` stores the BoI rate in **percent** (3.25), and so does the engine's `st.world.rate`. Use `ratesFromReal()` or divide by 100. Passing 4 instead of 0.04 throws `RangeError(... looks like percent ...)`.
* **No guaranteed returns.** Every projection carries `guaranteed:false` and `note` = `NOTE_NO_GUARANTEE` ("תחזית בלבד — אין תשואה מובטחת…"). Prefer `projectRange()` (bad / typical / good) over a single number.

---

## 1. Banking & credit — `js/finance/bank.js`

### 1.1 API

| Function | Returns (₪ integers unless noted) |
|---|---|
| `amortize({principal, annualRate, months, method:'spitzer'\|'equal', cpiMonthly?, openingFee?, monthlyFee?, payment?})` | `{payment, lastPayment, totalInterest, totalIndexation, totalPaid, totalFees, totalCost, rows:[{n, payment, interest, principal, indexation, balance, …Ag}]}`. `annualRate` / `cpiMonthly` may be **arrays** (per month, last value repeats) for prime/variable tracks or real CPI paths. `payment` (Spitzer) keeps a fixed payment, e.g. after shortening the term. |
| `pmt(balance, monthlyRate, n)` | annuity payment (float, same unit as `balance`) |
| `effectiveRate({principal, annualRate, months, method, openingFee, monthlyFee})` | `{nominal, nominalEffective, effective, effectivePct, feesAddPct}` (decimals / percent with 2 dp). This is ריבית אפקטיבית: the annualised IRR of what you receive vs what you pay, fees included. |
| `irr(flows)` | monthly IRR of integer cash flows (bisection) |
| `prepay({principal, annualRate, months, method, atMonth, amount?, track:'fixed'\|'prime'\|'variable'\|'cpi', marketRate, noticeDays=30, loanAgeMonths?, mode:'reducePayment'\|'shortenTerm', cpiMonthlyAvg?})` | `{balance, amount, fee, fees:{operational, noNotice, capitalization, cpi, discountPct}, cashNeeded, oldPayment, newPayment, newMonths, interestSaved, netSaving, worthIt, creditDelta, schedule}` |
| `checkingMonth({balance, limit, annualRate, creditRate?, fee?})` | `{interest, fee, newBalance, overLimit, overLimitBy, creditDelta}`. One month of עו"ש with מסגרת and ריבית חריגה. |
| `overdraftRate(boiRate, score)` | decimal, or `null` (no credit line for this score) |
| `savingsMonth({balance, annualRate?, taxRate?})` | `{interest, tax, net, newBalance}` |
| `fixedDeposit({amount, annualRate, months, compounding:'simple'\|'monthly', linked?, cpiTotal?})` | `{interest, indexation, tax, net, maturity, creditDelta}` |
| `breakDeposit({amount, annualRate, months, elapsed, exitEvery?, feePct?})` | `{payout, interestKept, tax, interestLost, fee, penalty, atExitPoint}` |
| `installments({price, count, annualRate?})` | `{first, perInstallment, total, interest, amounts[] (sum = total), effectivePct}` |
| `loanOffer({principal, months, track:'prime'\|'fixed', boiRate, creditScore, method?, openingFee?})` | `{ok, reason?, annualRate, payment, totalInterest, totalPaid, openingFee, effectivePct, variable, schedule}` |
| `loanOpeningFee(principal)` | 0.5%, min ₪100, max ₪1,000 |
| `mortgageTracks({principal, months=300, mix={prime,fixed,cpi}, boiRate, rates?, cpiYearly?, method?, primePath?, cpiPath?})` | `{tracks:[{id, name, share, principal, annualRate, linked, payment, totalInterest, totalIndexation, totalPaid, schedule}], payment, totalPaid, totalInterest, totalIndexation, fileFee, stress:{primePlus2, cpiPlus2Year10, baseYear10}, rules:{ok, issues[]}}` |
| `mortgageCheck({price, principal, netIncome, payment, buyer:'first'\|'upgrade'\|'investor'})` | `{ok, ltv, pti, maxPrincipal, issues[], warnings[]}` (Hebrew texts) |
| `monthlyFees({plan:'basic'\|'digital'\|'premium', tellerActions})` | `{account, teller, total}` |
| `primeFromBoi(boi)` · `ratesFromReal(realModule, ym)` · `cpiTrend(realModule, ym, years)` | decimals; `ratesFromReal → {boi, prime, cpiYearly, cpiMonthly}` |
| `creditSpread(score)` · `CREDIT_DELTAS` | credit-score hooks (§1.4) |
| `rnd, toAg, toIls, agToIls2, splitIls, splitEven, splitByWeights, ipow, dexp, dlog, dpow` | money and math primitives |
| `BANK` (config), `TRACK_NAMES` | constants. Tune balance here, not in callers. |

### 1.2 Formulas

* **Spitzer (שפיצר)**: `m = r/12`, `PMT = B·m / (1 − (1+m)^−n)`. Each month `interest = rnd(B·m)`, `principal = PMT − interest`, and the last row takes `principal = B`. The payment is recomputed only when the rate changes or the balance is indexed (variable / prime / CPI-linked tracks).
  *Known answer:* ₪100,000, 20 years, 4% gives **₪605.98** a month.
* **Equal principal (קרן שווה)**: `principal = floor(B / remaining)`, so leftover agorot drift to the last row. `interest = rnd(B·m)`. Payments fall every month.
* **CPI-linked (צמוד מדד)**: each month, before interest, `B += rnd(B·cpi_m)`. The payment is then the Spitzer payment on the indexed balance. Invariant: `Σ principal parts = principal + Σ indexation`.
* **Effective rate**: cash flows `[P − openingFee, −(PMT_1 + fee), …]`. Monthly IRR by bisection, then `(1+irr)^12 − 1`. With no fees this equals `(1 + r/12)^12 − 1` (4% gives 4.07%).
* **Early repayment fee** (simplified צו הבנקאות (עמלת פירעון מוקדם), 2002):
  * operational fee **₪60**, always;
  * **no-notice fee** 0.1% × amount when notice is under 10 days (not on prime);
  * **capitalization fee (עמלת היוון)**, on fixed / CPI-linked / variable tracks between change points: `max(0, PV_marketRate(remaining payments) − balance) × amount/balance`. For variable tracks the PV runs only to the next change point (every 60 months) plus the balloon there, and is **0 at a change point**. **Discount 20%** if the loan is ≥ 3 years old, **30%** if ≥ 5 years. A rate higher than the contract rate means no fee;
  * **CPI fee (עמלת מדדים)**: `amount × ½ × average monthly CPI change` (CPI track);
  * **prime track: only ₪60.**
  * Then either `reducePayment` (same term, lower payment) or `shortenTerm` (same payment, fewest months that payment covers). `interestSaved` = remaining interest before minus after. `netSaving = interestSaved − fee`.
* **Overdraft**: inside the limit `|B| · r/12`, beyond it `|B_over| · (r + 3%)/12` (ריבית חריגה). Overdraft rate = prime + 6% + credit spread.
* **Deposits**: simple interest at maturity by default, `A·r·months/12`. Tax is **15% of nominal interest** (unlinked), or for linked deposits **25% of the real interest** (indexation untaxed).
  *Early break:* with exit points (`exitEvery`) you keep the interest up to the last exit point; a fully closed deposit loses all accrued interest. An optional `feePct × amount` applies off an exit point. `penalty = net interest lost + fee`.
* **Card installments**: up to 3 installments with no interest, split evenly with the extra agorot on the first installment (as Israeli card issuers do). More than 3 is a "קרדיט" plan: Spitzer at 12%.
* **Personal loan rate**: prime track `BoI + 1.5% + 2.5% + creditSpread`; fixed track `BoI + 3.5% + creditSpread`.
* **Mortgage**: default mix ⅓ prime (prime − 0.5%), ⅓ fixed unlinked (4.9%), ⅓ CPI-linked fixed (3.2% real + CPI 2.5%/yr). Stress tests: prime +2% from month 1, and CPI +2%/yr (payment in year 10).

### 1.3 Simplifications vs real Israeli rules (read before teaching)

| Topic | Real | Game / module |
|---|---|---|
| Prime | BoI + 1.5% | same |
| Overdraft | negotiated, P+3%…P+10%, daily interest | one rate P+6% (+ credit spread), monthly on month-end balance, +3% over the limit |
| Effective rate | regulated disclosure formula (IRR incl. fees) | IRR of the schedule incl. opening/monthly fees. CPI-linked loans are quoted in real terms (no indexation), like the disclosure. |
| Prepayment fee | צו הבנקאות (עמלת פירעון מוקדם) 2002: average rate published by BoI, day-of-month rules for the CPI fee, 10–30 day notice window, operational fee around ₪40–60 depending on the bank | `marketRate` is a single caller-supplied number; CPI fee always applied on CPI tracks; notice < 10 days gives 0.1%; operational fee ₪60 |
| Variable tracks | rate resets every 1/2.5/5 years to anchor + spread | only "every 5 years" for prepayment PV; schedules accept a per-month rate array |
| Deposit tax | 15% nominal (unlinked), 25% real (linked), withheld at payout | same, computed per deposit; savings tax withheld monthly |
| Deposit break | bank-specific (exit points, reduced rate) | exit points keep interest; otherwise lose accrued interest (+ optional fee); principal protected except for the fee |
| Mortgage rules | ≥ ⅓ fixed, prime ≤ ⅔, LTV 75/70/50%, PTI ≤ 50% (banks flag > 40%), ≤ 30 years, file fee capped (₪360) | checked in `mortgageTracks().rules` / `mortgageCheck()` |
| Mortgage rates | market (2026: fixed ≈ 4.8–5%, CPI ≈ 3–3.3%, prime − 0.3…−0.7%) | constants in `BANK.mortgage`. Replace with history paths (`primePath`, `cpiPath`) in מכונת הזמן. |
| Card installments | issuer- and merchant-specific | ≤ 3 free, otherwise 12% Spitzer |
| Credit score | BDI / credit-data bureau models | 300–850 game score from life.js; this module only maps score to rate spread / refusal and reports deltas |

### 1.4 Credit-score hooks

The engine (`life.js`) owns `st.life.creditScore` and clamps it. This module only:
* `creditSpread(score)` gives an annual rate add-on following the ENGINE.md bands: ≥760 **−0.5%**, 680–759 **0**, 600–679 **+0.75%**, 520–599 **+1.5%**, <520 **`null`** (no new voluntary credit; `loanOffer` returns `ok:false` with a Hebrew reason, `overdraftRate` returns `null`).
* Results carry `creditDelta` (`prepay` +6, `checkingMonth` over the limit −10, `fixedDeposit` +1). The full table is `CREDIT_DELTAS = {cleanMonth:+2, loanRepaid:+6, prepay:+6, forcedLoan:−25, cardUnpaid:−4, overLimit:−10, missedPayment:−30, depositOpened:+1, bailout:−80}` (values that overlap ENGINE.md match it). The engine adds the delta to the score.

---

## 2. Investments — `js/finance/invest.js`

### 2.1 API

| Function | Returns |
|---|---|
| `futureValue({pv, monthly, annualReturn, years\|months, timing:'end'\|'begin', rateMode:'effective'\|'nominal', mgmtFee})` | `{value, contributed, growth, feeDrag, monthlyRate, path:[{year, value, contributed}], guaranteed:false, note}` |
| `projectRange({pv, monthly, years, annualReturn=0.07, vol=0.16, mgmtFee})` | `{p10, p50, p90, contributed, lossChance, path:[{year, p10, p50, p90, contributed}], guaranteed:false, note}` |
| `dca({prices[], amount, commissionPct?, minCommission?, wholeUnits?})` | `{invested, fees, units, avgCost(Ag), value, gain, leftover, lumpSum:{units, fees, value, gain}, buys[]}` |
| `tradeCost({amount, commissionPct=0.1%, minCommission=₪5})` | `{commission, commissionAg}` |
| `capitalGainsTax({cost, proceeds, cpiBuy, cpiSell, mode:'real'\|'nominal', lossCarry, rate=25%})` | `{nominalGain, inflationPart, realGain, taxable, tax, net, lossCarryOut}` |
| `dividend({units, perUnit, taxRate=25%})` | `{gross, tax, net}` |
| `bondPrice({face, couponRate, ytm, years, freq})` · `bondYield({pricePct, …})` · `bondDuration(…)` · `bondRateShock({…, dy})` · `bondExpectedReturn({kind:'gov'\|'corpAA'\|'corpBBB', govYield})` | price as % of face (4 dp) + ₪ value; YTM; Macaulay/modified duration; exact vs duration-approximate % move; expected return after default losses |
| `realEstateYield({price, monthlyRent, vacancyMonths=1, maintenancePct=8%, managementPct=0, insuranceYear=1200, buyer, closingPct=3%, renovation, taxTrack:'auto'\|'exempt'\|'track10'\|'none', mortgage?})` | `{grossRent, collectedRent, vacancyLoss, maintenance, management, insurance, noi, taxTrack, tax, noiAfterTax, purchaseTax, closing, totalCost, debtService, cashFlowYear, cashFlowMonth, equity, grossYield, capRate, netYield, cashOnCash, lines:[{label, amount}]}` |
| `purchaseTax({price, buyer:'first'\|'investor'})` · `capRateValue({noi, capRate})` | ₪ |
| `returnsOf(values)` · `volatility(values, ppy=12)` · `maxDrawdown(values)` · `cagr(values, ppy)` | risk metrics (decimals, 4 dp); `maxDrawdown → {maxDrawdown, peakIndex, troughIndex, recoveryIndex, monthsToRecover}` |
| `seriesRisk(realModule, 'sp500'\|'ta125'\|'homeIL'\|'usdIls'\|'cpiIL', fromYm?, toYm?)` | `{from, to, months, cagr, volatility, maxDrawdown, peakYm, troughYm, recoveryMonths, worstMonth, bestMonth, worst12m}` from **real data** |
| `simulateReturns({months, annualReturn, vol, rand, crashChance?, crash?})` | seeded monthly returns. **Exactly 1 draw per month**, or 2 when `crashChance > 0`. |
| `diversificationScore([{kind, value, name?}])` | `{score 0..100, classes, effectiveClasses, tips:[Hebrew]}` |
| `realReturn(nominal, inflation)` · `doublingYears(r)` · `normCdf(z)` · `normInv(p)` | helpers |
| `INSTRUMENTS`, `INVEST`, `BOND_KINDS`, `PURCHASE_TAX`, `NOTE_NO_GUARANTEE` | constants (Hebrew names, risk 1–5, liquidity, assumed long-run return and volatility) |

### 2.2 Formulas

* **FV** (closed form, rounded once per reported point, so there is no drift): `FV = PV·(1+m)^n + C·((1+m)^n − 1)/m · (begin ? 1+m : 1)`. Effective mode uses `m = (1+R)^(1/12) − 1`; nominal mode uses `m = R/12`. A management fee `f` is taken monthly: `m_net = (1+m)(1 − f_m) − 1`, `f_m = 1 − (1−f)^(1/12)`. `feeDrag` = FV without the fee − FV with it.
  *Known answers:* ₪500/month for 30 years at 7% gives **₪609,986** (nominal, monthly compounding) or ₪584,726 (7% effective per year). ₪10,000 for 10 years at 7% gives ₪19,672.
* **Range**: log-normal with median growth `ln(1+R) + ln(1−fee)` and volatility `σ`. Value at percentile z after t years is `X·exp(g·t + z·σ·√t)`, with each deposit at the same percentile (a comonotonic approximation, labelled as a teaching range). p50 equals the effective FV. `lossChance = Φ(−g·T̄/(σ√T̄))`, where T̄ is the money-weighted average horizon. It falls with time: 33.6% after 1 year and 2.9% after 20 years, at 7% median return and 16% volatility.
* **Capital-gains tax** (§91, simplified): `inflationPart = cost × (CPI_sell/CPI_buy − 1)` is exempt. 25% of the real gain, after offsetting carried losses. A nominal gain that is a real loss pays no tax and creates no loss. A nominal loss is carried forward. `mode:'nominal'` taxes 25% of the nominal gain, which is what the v3 engine does today.
* **Bonds**: `P = Σ c/(1+y)^k + 100/(1+y)^n`. YTM by bisection. Macaulay duration is `Σ t·PV(CF)/P`, modified duration is `D/(1+y/f)`. Shock: `ΔP/P ≈ −D_mod·Δy`. Corporate bonds are gov yield + spread; expected return is `ytm − PD × 60% LGD`.
* **Real estate**: `collected = rent × (12 − vacancy)`. `NOI = collected − maintenance%·gross − management%·collected − insurance`. Tax: exempt if rent ≤ **₪5,654/month** (real.js `rentalExemptUpTo`), otherwise **10% of collected rent**. `totalCost = price + מס רכישה + closing + renovation`. `grossYield = 12·rent/price`, `capRate = NOI/price`, **`netYield = NOI_after_tax / totalCost`**, `cashOnCash = (NOI_after_tax − debt service)/equity`. Value = `NOI / capRate`.
  *Known answer:* ₪1,000,000 at ₪4,000/month is 4.8% gross but **3.51% net**.
* **Risk** (real.js): S&P 500 1999–2026 has CAGR 6.6%, volatility 15%, **max drawdown −52.6% (Oct 2007 to Feb 2009), 49 months to recover**, worst 12 months −44.8%. TA-125 over 2007-06 to 2012-06 also fell −52.6% (Oct 2007 to Dec 2008).
* **Diversification score**: effective number of asset classes `1/HHI` mapped from 1 to 4+ onto 0..70. Then +20 if ≥ 25% is in a broad index fund, +10 if ≥ 5% is liquid (cash/deposit/bonds), −15 if one non-index position is above 25%, −15 if crypto is above 10%. Clamped to 0..100. Each penalty comes with a Hebrew tip.

### 2.3 Simplifications

* Capital-gains tax ignores the 30% rate for substantial holders, the 3%/5% surtax, and inflation-adjusted loss rules (losses are carried nominally). Dividends are a flat 25%.
* Commission is 0.1% with a ₪5 minimum; custody fee is 0 (most Israeli online brokers, 2026).
* Purchase tax brackets are the 2024–2027 frozen thresholds, rounded. Betterment tax (מס שבח) is not here; the engine taxes 25% of (sale − purchase price).
* The rental exemption track is simplified to "fully exempt below the ceiling". The real partial exemption between 1× and 2× the ceiling is not modelled. The 10% track is chosen automatically above the ceiling.
* Long-run instrument returns in `INSTRUMENTS` are assumptions for teaching, not forecasts. Crypto is modelled with **zero drift**: no cash flow backs it, so it is pure volatility.

---

## 3. Businesses (עסקים) — `js/finance/business.js`

<!-- Owned by the business engineer: model, formulas, simplifications, API, integration notes. -->
Owner: real-estate & business engineer · tests: `node tests/business.test.mjs` (101 known-answer + invariant checks).

**The lesson:** revenue ≠ profit ≠ cash ≠ money in your pocket. A business card stops being a fixed "+₪X a month" and becomes a small management sim: price, staff, marketing, stock, a manager, owner draw, selling. Every month the player sees a compact P&L ("דוח עסקי") and up to 3 teaching notes that explain *why* the numbers moved.

Pure, deterministic ES module (no DOM / Date / Math.random). Functions never mutate their input; each "change" returns a **new** plain-JSON business object (`v: 1`). All ₪ are **integer shekels** (not agorot like §0: the module works in whole-₪ business lines; the per-unit math is float and rounded once per line), rounded half away from zero (same `rnd` rule as `bank.js`), so every statement adds up exactly. Only `+ − × ÷`, `Math.floor/ceil/round/min/max/abs` are used (no `Math.pow/exp/log`, per §0), so results are bit-identical in every JS engine (browser ↔ server).

### 3.1 Archetypes (`ARCHETYPES`, `archetypeList()`)
Israeli flavour, no real brands. Costs are pre-VAT; `price` is what the customer pays **including VAT**.

| id | name | model | what it teaches | start capital | price | break-even at defaults |
|---|---|---|---|---|---|---|
| `coffee` | עגלת קפה בתחנת רכבת | fresh stock, owner is the barista | a small business you work in is a job; a hire must earn more than it costs | ₪25,000 | ₪14 | 469 cups |
| `laundromat` | מכבסה בשירות עצמי | no stock, machines cap capacity, `expand` buys machines | operating leverage, equipment ceiling, depreciation; nearly passive | ₪120,000 | ₪18 | 948 washes |
| `toyshop` | חנות צעצועים אונליין — יבוא מהמזרח הרחוק | ordered inventory, 1-month shipping, 12% customs, import VAT, dead stock, 50% paid next month | stock = cash out today, expense later; stock-outs; marketing drives demand | ₪60,000 (incl. 600 units of stock) | ₪99 | 66 orders |
| `pizza` | זיכיון פיצרייה שכונתית | fresh stock, 8% royalties, 4 staff, 30% card settlements next month | ₪120K+ monthly revenue can leave only a few thousand; receivables squeeze | ₪250,000 | ₪60 | ~2,000 pizzas |
| `app` | אפליקציית כושר במנוי חודשי | subscription: users accumulate, churn, 15% app-store fee | burn rate, runway, LTV vs CAC, revenue-multiple exits | ₪250,000 | ₪30/month | ~1,600 subscribers |

Every parameter can be overridden per card: `create('pizza', { overrides: { rent: 12000 } })` (the engine lead tunes balance through overrides or by editing the data).

### 3.2 The monthly model — `simulate(business, decisions, rng)`
Order of operations (one month = one payday):
1. Apply `decisions` (optional; same rules as `applyDecisions`).
2. Draw **exactly 3** randoms: `r1` demand noise (`0.9 + 0.2·r1`), `r2` event happens (`< eventChance`, ≈ 25%), `r3` which event (weighted per archetype).
3. Event effects: `competitor` demand ×0.82 for 6 months · `viral` ×1.35 for 1 · `holiday` ×1.2 for 1 · `platformChange` ×0.85 for 3 · `costSpike` unit cost ×1.15 for 3 · `breakdown` capacity ×0.7 plus a repair bill · `inspection` fine · `staffQuit` −1 employee · `customsDelay` orders arrive 1 month later · `bigClient` +25% of base demand (subscription: +3 months of organic signups).
4. Pay queued items: owner injections, inventory orders (goods + shipping + duty + import VAT), new equipment, hiring and severance costs. Orders that are due arrive in stock.
5. **Demand and capacity (sales mode)**
   * `priceFactor = clamp(1 − elasticity × (price − ref)/ref, 0, 2.5)` (linear: +10% price at elasticity 1.6 → −16% customers)
   * `marketingLift = mktMax × M / (M + mktHalf)` (diminishing returns: spending `mktHalf` gives half the maximum lift)
   * `demand = round(baseDemand × priceFactor × (1 + lift) × eventMult × noise) + extra`
   * `capacity = min((manager ? managerCap : ownerCap) + staff × perStaff − newHires × perStaff/2, equipCap + expanded × expand.cap) × capMult`
   * `units = min(demand, capacity, stock if inventory)`. Lost sales are reported as `lostSales.capacity` and `lostSales.stock`.
   * **Subscription mode:** `devs = staff + (owner working ? 1 : 0)`, `churn = base × 2/(1+devs) × priceChurnMult`, `new = (baseNew × (1 + 0.2·devs) + lift) × priceFactor × eventMult × noise`, `users = users − round(users × churn) + new`. Billing units are the users. Monthly `burn` = operating cash lost before any owner money; **`runway = floor(cash ÷ burn)`** months (e.g. ₪40,000 ÷ ₪10,000 = 4).
6. **P&L (accrual basis, VAT excluded)**
   * `revenueGross = units × price` · `vatOut = round(gross × 18/118)` · `revenue = gross − vatOut`
   * COGS: `none` = units × unitCost · `fresh` = units × unitCost, plus waste = (max(units, lastMonthUnits × (1+buffer)) − units) × unitCost (you buy according to last month's sales, so a drop in demand means spoilage) · `inventory` = average landed cost of the units sold, plus `deadRate` (2%/month) of the remaining stock written off · plus fulfilment per unit.
   * `grossProfit = revenue − COGS`
   * opex = wages + manager + rent + fixed + marketing + royalty (% of revenue) + card/app-store fees (% of gross) + depreciation (equipment ÷ life, non-cash) + one-offs
   * `ebt = grossProfit − opex` · corporate tax `23%` on `max(0, ebt − carried losses)` (losses carry forward) · `netProfit = ebt − tax`
   * Costs grow with `cpi` (`applyInflation`). The price does not; raising it is the player's decision.
7. **Cash (who gets paid, `report.flows`)**
   * customers pay `cashShare` now and the rest after `arLag` months (receivables)
   * suppliers, landlord, services and franchisor are paid their base plus 18% input VAT; wages and card fees carry no VAT
   * the state gets `vatOut − vatIn` (negative = refund) plus customs, corporate tax and dividend tax, all in the same month
   * if cash would go negative, the **owner injects exactly the shortfall** (`toOwner.injection`)
   * then the owner draw is paid: `min(draw, cash)` gross, minus **30% dividend tax**, net to the owner
8. Teaching notes, P&L lines and history (last 24 months).

**Invariants (tested on all 5 archetypes over 36 months of random decisions):**
* `Σ flows === cash.change`
* `revenue − COGS − opex === ebt` and `ebt − tax === netProfit`
* cash, stock and users never go negative
* every amount is an integer
* `collected + receivables === billed` (no money created; customers never pay twice)
* stock value in === sold + dead stock + on hand + on order
* determinism: same seed gives identical JSON
* exactly 3 draws per month whatever the player decides
* a JSON round-trip mid-run continues identically
* no input is mutated

### 3.3 Analytics
* `breakEven(b)` → `{units, revenue, contribution, fixed, text}`
  * contribution per unit = net price − variable costs (unit or landed cost, fresh buffer, fulfilment, royalty, fees)
  * fixed = rent + fixed + wages + manager + marketing + depreciation
  * `units = ceil(fixed / contribution)`, or `null` when every sale loses money
* `margins(report)` → `{gross, net}` in %.
* `valuation(b)` (sale price):
  * **profit-based:** `price = avg(EBT + one-offs, last ≤12 months) − manager wage (if the owner runs it) → ×12 × (1 − 23%) × multiple`. Buyers pay for profit that continues without you, which is why an owner-run coffee cart is worth little more than its equipment.
  * **subscription:** `ARR × revMultiple` if users grow ≥ 3%/month.
  * **floor:** 60% of the equipment book value + 70% of inventory at cost.
  * **owner's proceeds:** `price + business cash + receivables`, minus 30% capital-gains tax (substantial shareholder) on `(proceeds − total invested)`.
* `sell(b)` → `{business (closed, emptied), sale}`.

### 3.4 Simplifications vs Israeli reality (documented, deliberate)
| area | model | real-world simplification |
|---|---|---|
| VAT | 18%, B2C prices include it; reported and paid in the same month | real: monthly/bi-monthly report by the 15th; עוסק פטור below the threshold is ignored |
| VAT timing | due on what was **billed**, even if not yet collected | real for most businesses (cash-basis exceptions are ignored) |
| VAT exemptions | input VAT reclaimed on goods, rent, services, marketing, royalties, equipment; none on wages, card fees or fines | — |
| legal form | every business is a חברה בע"מ: 23% corporate tax monthly (real: advances plus an annual reconciliation), loss carry-forward | עוסק מורשה / personal income tax is not modelled |
| owner draw | dividend, 30% tax (significant shareholder) | the 3% surtax and the "distributable profits" test are ignored; the draw is limited only by cash |
| customs | 12% on goods + shipping | real toy duty varies, often 0–12% |
| staff | one wage per employee (employer cost); hiring costs ¼ of a wage; firing costs 1 month (notice + severance, simplified); new hires work at 50% in their first month | — |
| sale | capital-gains tax 30% (substantial shareholder, like the dividend) on proceeds over invested capital | — |
| equipment | straight-line depreciation; no resale except in the valuation floor | — |
| demand | linear price response; marketing with no memory (stop spending and the lift stops) | — |

### 3.5 API
```js
import * as BIZ from './js/finance/business.js';
// data
BIZ.ARCHETYPES, BIZ.ARCHETYPE_IDS, BIZ.archetypeList(), BIZ.EVENTS, BIZ.BIZ_LESSONS (16 lessons, cat 'business'|'tax')
BIZ.VAT_PCT (18), BIZ.CORP_TAX (0.23), BIZ.DIV_TAX (0.30), BIZ.CAP_GAINS (0.30), BIZ.RNG_DRAWS (3), BIZ.BIZ_VERSION (1)
// lifecycle
create(typeId, {name?, overrides?, month?}) → business             // owner pays p.startCapital
applyDecisions(b, d) → {ok, errors[], business, costs:{hiring,severance,inventory,equipment,total}, cashNeeded, changes[]}
     // d = {price?, hire?, fire?, marketing?, order?, manager?: bool, draw?, inject?, expand?} — atomic: any error ⇒ nothing applied
simulate(b, decisions|null, rng, {noEvents?}) → {business, report}  // throws on invalid decisions (validate with applyDecisions first)
sell(b) → {business, sale}
applyShock(b, {id, demand?, cost?, months}) → business             // economy-wide events (מיתון, בום)
applyInflation(b, pctPerYear) → business                            // costs rise, price doesn't
// analytics / UI
breakEven(b) · margins(report) · valuation(b) · capacity(b) · priceFactor(p, price) · marketingLift(p, spend)
ownerEnergy(b) → energy/month (owner-run 4–16, with manager 1–4) · incomeKind(b) → 'active'|'passive'
forecast(b, decisions, months) → {reports[], business, netProfit, cashChange}   // deterministic preview (neutral luck, no events)
suggest(b) → {decisions, why[]}   // smart default (→ `primary`)
decisionOptions(b) → {canDecide, price, staff, marketing, order, manager, draw, expand, sell, suggest}
summary(b, lastReport?) → compact card data · canDecide(b) (quarterly gate, advisory)
vatOf, vatOn, netOf, rnd, fmt
```
`report` fields:
* volume: `month, units, demand, capacity, lostSales{capacity,stock}`
* P&L: `price, revenueGross, vatOut, revenue, cogs{goods,waste,fulfil,total,wasteLabel}, grossProfit, grossMargin, opex{wages,manager,rent,fixed,marketing,royalty,fees,depreciation,oneOff,oneOffs[],total}, ebt, corpTax, taxLossCarry, netProfit, netMargin`
* VAT and cash: `vat{output,input,payable}, cash{start,collected,end,change,inventoryBought,capex}, receivables, inventory{units,value,arrived,onOrder}|null, flows{owner,customers,suppliers,staff,landlord,services,franchisor,state}`
* owner: `toOwner{drawGross,divTax,drawNet,injection,injectedTotal,net}, ownerEnergy, incomeKind`
* teaching: `breakEven, events[{id,title,text,effect}], sub{users,newUsers,churned,churnRate,mrr,arr,cac,ltv,burn,runway}|null, lines[{k,label,amount,bold?,pct?,sep?}], headline, notes[≤3 {id,text,lesson}], allNotes[], lessons[ids]`

### 3.6 Integration guide (business) — for the engine lead
Nothing in `engine.js` uses this yet. These are the suggested hooks. Simple `biz` deal cards can stay as they are (fixed `cf`) for quick play; "managed" business cards use this module.

1. **State.** Store each managed business on its asset: `a.k = 'biz'`, `a.managed = true`, `a.biz = <business>`. This keeps `cityModels`, spawn/despawn and sell offers working.
   * `assetValue(st, a)` = `valuation(a.biz).price + a.biz.cash + receivables`, which is the owner's equity in the company, before tax.
   * `assetCf(st, a)` = `a.biz.last ? last report's toOwner.drawNet : 0`.
   * Count it in **passive income only if `incomeKind(a.biz) === 'passive'`** (a manager is hired). Otherwise show it as an "active" income line (`'עסק (אתה עובד בו)'`). This is the Rich Dad lesson.
2. **Randomness (fair in ranked modes).** Seal a per-business seed when the deal card is drawn (from the `deal` stream, consumed whether or not the player buys). Keep it outside the business object, e.g. `st.bizRng = { [assetId]: uint32 }`, and pass `() => R.next(st.bizRng, assetId)`. The holder must live outside `b` because `simulate` returns a clone. Decisions never consume randomness, so everyone who buys that card sees the same luck. (The alternative, appending a `'biz'` stream to `STREAMS`, is less fair: owning two businesses interleaves the draws.)
3. **Buying.** The deal card shows `archetypeList()` data, `breakEven(create(id))` and the first-month `forecast(create(id), null, 3)`. On `buy`: `st.cash −= p.startCapital` (loan rules as usual), then `a.biz = create(id, {month: st.month})`. Negotiation can lower the price with `overrides: {startCapital}`, but keep `startCapital ≥ equipment + opening stock` or `create` throws.
4. **Every payday** (passed or landed), for each managed business:
   * call `simulate(a.biz, null, rng)` and store `a.biz = res.business`
   * `st.cash += report.toOwner.net` (negative = injection; the engine's auto-loan covers a shortfall)
   * `st.life.energy −= report.ownerEnergy`
   * `st.taxes.business += corpTax + divTax` (add the key; VAT is not the player's tax, so show it separately if at all)
   * unlock `report.lessons`
   * push `report.headline` + `notes[0]` to `rollDice().news` as `{kind:'business', assetId, headline, note, report}` (UI shows a compact toast; a tap opens the full "דוח עסקי")
   * events with `report.events.length` deserve a card-style toast
5. **The "עסק" tile.** Suggested new tile type `K` ("העסק שלך", icon `shop`; free letter in `TILE_TYPES`). Landing with ≥1 managed business opens a decision card. With none, it becomes an `auto` card or offers to buy an archetype (seeded from the `deal` stream).
   * `data = decisionOptions(a.biz)` + `summary(a.biz, lastReport)`
   * options: `price:-10|-5|+5|+10`, `hire`, `fire`, `marketing:<preset>`, `order:<preset>`, `manager`, `draw:<preset>`, `expand`, `sell`, `ok`
   * `primary` = `suggest(b)`. Show each option's 3-month effect with `forecast(b, d, 3).netProfit`.
   * on choose: `const r = applyDecisions(b, d)`. If `!r.ok`, return the engine's usual `{ok:false, error: r.errors[0]}`. If `r.cashNeeded > 0`, the owner must inject: `d.inject = r.cashNeeded` and debit `st.cash` now.
   * `sell`: `const {business, sale} = sell(b)`, then `st.cash += sale.net`, despawn the asset, and record `sale.tax` in `st.taxes.capGains` (30%: the owner is a substantial shareholder, unlike the engine's 25% for portfolio holdings). **Do not apply the engine's own betterment tax again.**
   * Decisions are quarterly by design: use `canDecide(b)`, or let the tile itself be the gate.
6. **Engine events → business:**
   * w1 market `bonus` (type biz) → `applyShock(b, {id:'holiday', demand:1.2, months:1})` (the next simulated month only; `months` counts upcoming simulated months), instead of a free cash bonus
   * market `sell` offers for biz → `valuation(b).price × card.mult` (drop the 85% rule for managed businesses; the valuation already reflects losses)
   * crises / recession → `applyShock(b, {id:'recession', demand:0.8, months:3})`
   * yearly CPI step → `applyInflation(b, st.life.inflationYear)`
   * `noSalary` crises don't stop the business; that's a lesson in itself
7. **Time/energy layer.** An owner-run business costs 4–16 energy a month on top of the monthly plan. Suggested rule: owning a business you run + the `overtime` plan shows a warning. Hiring a manager drops the cost to 1–4; that is the "rich people buy time" lesson. `life.side` level 3 could create a `coffee` (or a cheaper override) instead of the fixed-cf side asset.
8. **Lessons.** Merge `BIZ_LESSONS` into the library (`LESSONS.concat(BIZ_LESSONS)`; the ids are prefixed `biz_`). Unlock `report.lessons` (≤3 per month, from the notes shown).
9. **End screen / leaks.** Add a `bizInjected` leak (`b.totals.injected`) and `topDecisions` entries for hire/fire/sell. `b.totals` has the lifetime revenue, net profit, draws, VAT, corporate tax, dividend tax and customs.

**What to show on the card (UI lead) — compact "דוח עסקי":**
* the headline line
* `report.lines` as a short P&L: bold rows are revenue, gross profit, profit before tax and net profit, with `pct`. Collapse the opex rows into one "הוצאות תפעול" row with an expander. The `sep` row separates P&L from cash.
* a break-even bar: units sold vs `breakEven.units`
* a cash chip with receivables / stock under it
* an owner-energy chip (⚡ −12/month, or "מנהל ✓")
* up to 3 `notes`
* subscription: users / burn / runway / LTV vs CAC instead of break-even
* history: a 12-month sparkline of `hist[].rev` vs `hist[].np` (two lines that diverge is the whole lesson)

---

## 4. Tests — `tests/finance.test.mjs`

Run `node tests/finance.test.mjs`. There are no dependencies and it takes about 0.4 s. Expected output: `37 passed, 0 failed`.

* **Known answers**, computed independently inside the test (own formulas or hand arithmetic, never the function under test):
  * Spitzer ₪100k/20y/4% = ₪605.98
  * קרן שווה ₪120k/12m/6%: ₪10,000 parts, ₪3,900 interest
  * zero-rate split
  * variable-rate recompute
  * CPI-linked month 1 (₪600 indexation, ₪751.50 interest)
  * effective rate: (1+r/12)^12 − 1, and the 1-month loan with a fee
  * prepayment fee (full repayment at market 0% = total interest + ₪60; capitalization by an independent PV; 20%/30% discounts; 0.1% no-notice; prime = ₪60 only; variable at a change point = 0; CPI fee)
  * overdraft inside and beyond the limit
  * savings tax
  * deposits (unlinked and linked)
  * deposit break penalty ₪141.67
  * card installments
  * credit bands and refusal
  * mortgage split, rules and stress
  * `ratesFromReal`
  * FV ₪500/m × 30y × 7% (nominal ₪609,986 and effective)
  * lump sum ₪19,672
  * fee drag
  * projectRange ordering and loss chance
  * capital-gains tax (real, nominal, real loss, carry-forward)
  * dividends
  * commissions
  * DCA
  * bonds (par, zero-coupon, YTM inverse, duration)
  * net yield 3.51%
  * 10% track
  * cap-rate value
  * drawdown, volatility and CAGR on hand series
  * S&P 500 2007–09 drawdown from real.js
* **Properties:**
  * 2,000 random loans (both methods, CPI on ~30%):
    * principal parts = principal + indexation (exact agorot)
    * paid − interest − indexation = principal (no money created)
    * all rows ≥ 0 and integer
    * last balance 0
    * displayed ₪ columns add up
    * identical on re-run
  * 400 random prepayments: fee ≥ 0, cash = amount + fee, the rest becomes the new schedule, prepaying never costs extra interest
  * 500 random deposits: break payout ≤ maturity, penalty ≥ 0, only the fee touches the principal
  * edge cases: zero principal, zero balance, negative rate, 1-month loan, bad inputs throw
* **Determinism guard:** `dexp/dlog/dpow` match `Math.*` to about 1e-13, `normInv` inverts `normCdf`, and a source scan fails if `Math.pow|exp|log|cos|sin|random`, `Date`, `document` or `window` appear.

---

## 5. Integration guide (bank.js / invest.js → engine.js) — for the engine lead

**Import (engine only):**
```js
import * as BK from './finance/bank.js';
import * as IV from './finance/invest.js';
```
Both modules are small and pure, with no dependency on `real.js`. Functions that need real data take the module as an argument (`ratesFromReal(realMod, ym)`, `seriesRisk(realMod, …)`), so the 4 worlds never load `real.js`.

**Units at the boundary:** the engine keeps whole ₪ in `st` (`cash`, `debt`, …), and that stays as it is. Pass ₪ in and read the integer-₪ fields out. Convert rates: `st.world.rate` (percent) becomes `st.world.rate / 100`.

**Recommended order** (ARCHITECTURE A1: never two economic engines). Each step is shippable:
1. **Display and decisions first, no balance change.** Use the modules for what cards *show*: schedules, effective rate, fee previews, yields, projections. Cash still moves through the engine's existing code, so ranked results are unchanged.
2. **Replace formulas one at a time**, each with the 2,000-seed before/after run (`tools/sim.mjs`): `loanPay/creditPay` → `amortize` (bank loans), the interest-only mortgage cashflow `debt × rate/12` → Spitzer `mortgageTracks`, `gainTax()` → `capitalGainsTax({mode:'nominal', lossCarry: st.life.lossCarry})` (then optionally `'real'` with `cpiBuy/cpiSell` from `st.life.cpi`). Store the loan descriptor (`{principal, annualRate, months, method, startMonth, track}`) in state, never the schedule. The schedule is recomputed deterministically, which keeps saves small and JSON-stable.

**Event → function map:**

| Engine event / tile | Call | Show |
|---|---|---|
| `B` bank tile (`bank` card, w2 and all v3 worlds) | `prepay({…, track, marketRate: <new rate>/100, atMonth: st.month − a.startMonth, mode})` for the `prepay` option; `fixedDeposit` / `breakDeposit` for a "פיקדון" option; `savingsMonth` preview; `loanOffer({principal, months, track, boiRate: st.world.rate/100, creditScore: st.life.creditScore})` | fee breakdown (`fees.*`), `interestSaved`, `netSaving`, `worthIt` (good `primary` rule: prepay when `worthIt` and the cash after it still leaves 3 months of expenses); deposit maturity vs early-break penalty |
| `refi` option | `mortgageTracks` with the new mix; `effectiveRate` incl. the refi fee | new payment vs old, `stress.primePlus2` |
| Mortgage / property deal card (`deal` with `buyVar`/`buyFix`, w2) | `mortgageTracks({principal: debt, boiRate, mix})` (`buyVar` ⇒ `{prime:2/3, fixed:1/3}`, `buyFix` ⇒ `{fixed:1/3, cpi:1/3, prime:1/3}`) + `mortgageCheck({price, principal, netIncome: m.payslip.net, payment, buyer})` | monthly payment per track, total interest vs price ("תשלם ₪X ריבית על דירה של ₪Y"), stress test line, `issues` as disabled-option `reason` |
| Property deal ROI chip | `realEstateYield({price, monthlyRent, mortgage})` | `grossYield` vs `netYield` and the `lines` ("תשואה נטו ולא רק שכירות") |
| Asset sale (`offers[]`) | `capitalGainsTax({cost: a.cost, proceeds: offer, mode:'nominal'})` | `tax`, `net` |
| `I` index tile / `invest()` | `futureValue({monthly: autoInvest, annualReturn: 0.07, years: 10/20/30})` + `projectRange(...)` for the chart; `capitalGainsTax` on sell; `tradeCost` if commissions are added | **range chart** p10/p50/p90 with `note`, `feeDrag` for "דמי ניהול 1% עולים לך ₪X" |
| Index price path (worlds) | the engine already pre-draws it (`LIFE_CFG.idx`). Optional: `simulateReturns({rand: () => rng.next(st.rng,'idx'), …})` (fixed draws per month, so fairness holds) | — |
| History mode (מכונת הזמן) | `ratesFromReal(real, ym)` → `boi`, `prime`, `cpiMonthly` for loans and mortgages that month; `mortgageTracks({primePath, cpiPath})` built from the real series; `seriesRisk(real, 'sp500', startYm, ym)` | end screen: "המדד ירד X% בשיא המשבר וחזר תוך Y חודשים" |
| Doodad `credit` option (installments) | `installments({price, count})` | "3 תשלומים ללא ריבית" vs "12 תשלומים: סה"כ ₪X (ריבית אפקטיבית Y%)" |
| Payday with negative cash (forced loan) | `checkingMonth({balance: st.cash, limit, annualRate: overdraftRate(boi, score)})` if a מסגרת is introduced before the forced loan; add `creditDelta` to the score | overdraft interest line in `expenseLines` |
| Statement sheet / portfolio | `diversificationScore(holdings)` (`kind` from asset `k`: real-estate assets → `realEstate`, `IDX` → `index`, stocks → `stock`, crypto → `crypto`, cash → `cash`) | score + first tip |
| Lessons (`lesson(st, out, id)`) | trigger `effective_rate` when `effectivePct − nominal ≥ 0.5`, `prepay_fee` when `fees.capitalization > 0`, `net_yield` when `grossYield − netYield ≥ 0.01`, `drawdown` in history mode | — |

**Credit score:** after any call whose result has `creditDelta`, do `st.life.creditScore = clamp(score + creditDelta)` in life.js (the engine owns clamping and the band table). `creditSpread()` matches `ENGINE.md` bands. If life.js's monthly `adj` values for w1 bank loans stay as they are, keep both, but use `creditSpread` only for annual-rate products (loans, overdraft, mortgages).

**Do not:** call these modules from the UI; pass percent rates; store schedules in `st`; use `projectRange` for game-state cash (it is a visual).
