# Data sources for `js/data/real.js` (v3)

Owner: data-research lead. Retrieved **2026-11-20**. Every number in `real.js` comes from one of the sources below.
Nothing was invented. Nothing was interpolated: all 6 series are true monthly data (`fidelity: 'monthly'`).
The only helper interpolation is `seriesAt('YYYY-MM-DD')` inside a month, which runs at game time.

## 1. Monthly series (`SERIES`)

| key | coverage | what it is | source (URL) | how it was turned into monthly values |
|---|---|---|---|---|
| `sp500` | 1999-01 … 2026-10 (334) | S&P 500 price index (no dividends) | Yahoo Finance chart API `https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1=915148800&period2=1795000000&interval=1mo` (index is published by S&P Dow Jones Indices) | Close of each monthly bar = month-end close. Partial Nov-2026 bar dropped. |
| `ta125` | 1999-01 … 2026-10 (334) | TA-125 (called TA-100 until 2017, same continuous index), TASE | Yahoo Finance chart API `…/chart/%5ETA125.TA?…&interval=1mo` | Same as above. |
| `boiRate` | 1999-01 … 2026-10 (334) | Bank of Israel policy rate, % per year | BoI SDMX API `https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/BR/1.0/MNT_RIB_BOI_D?startperiod=1999-01-01&format=csv` | Daily series. Value = rate in effect on the last day of the month. |
| `cpiIL` | 1999-01 … 2026-10 (334) | CBS (הלמ"ס) CPI, general index, code 120010 | CBS API `https://api.cbs.gov.il/index/data/price?id=120010&format=json&download=false&startPeriod=01-1999&endPeriod=10-2026&PageSize=1000&coef=true` | CBS changes base every 2 years. Each month was converted to the "1993 average" base using CBS's **official chaining coefficients** (`prevBase[].value`, returned with `coef=true`), then rescaled so the **2024 average = 100** (the current CBS base). Year-over-year rates match CBS's published `percentYear` within 0.05 pp (rounding). |
| `homeIL` | 1999-01 … **2026-08** (332) | CBS Dwellings Prices Index "מחירי דירות", code 40010, base 1993 = 100 | CBS API `https://api.cbs.gov.il/index/data/price?id=40010&format=json&download=false&startPeriod=01-1999&endPeriod=10-2026&PageSize=1000` | Used as published (one base for the whole span). Each month's value covers the **2-month transaction window ending that month** (CBS method). The last ~3 months are provisional and CBS revises them. Latest available month: 2026-08. |
| `usdIls` | 1999-01 … 2026-10 (334) | BoI representative exchange rate, ILS per 1 USD | BoI SDMX API `https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/RER_USD_ILS?startperiod=1999-01-01&format=csv` | Daily series. Value = last business day of the month. |

### Cross-checks
- **S&P 500**: Yahoo month-end closes match FRED `SP500` (`https://fred.stlouisfed.org/graph/fredgraph.csv?id=SP500`, daily, from 2016-11) for every month 2016-12…2026-10 (largest difference 5e-8).
  Spot anchors: Oct-2007 peak 1,549 · Feb-2009 735 / Mar-2009 798 (trough) · Mar-2020 −12.5% month · Dec-2024 5,882.
- **TA-125**: Calcalist (`https://www.calcalist.co.il/market/article/uvfm7ah7o`, 30-10-2025) reports TA-125 +2.7% in October 2025. Our series gives +2.8%.
  TradingEconomics (`https://tradingeconomics.com/israel/stock-market`) gives a 19-11-2026 close of 3,802.29, the same as the Yahoo daily price. It also gives an all-time high of 4,588 (intraday, May 2026); our May-2026 month-end close is 4,430.
  Note: FRED/OECD `SPASTT01ILM661N` ("share prices, Israel") is a **different** index (monthly average, broader). It diverges strongly in 2026, so it was **not** used.
- **BoI rate**: every change date matches BoI decisions, e.g. 3.8% Dec-2001, 9.1% Jun-2002, 0.5% Mar-2009, first hike Aug-2009, 0.1% Mar-2015…Oct-2018, 0.25% Nov-2018, 0.1% Apr-2020…Mar-2022, 4.75% May-2023, 4.5% Jan-2024, then 4.25% Nov-2025 → 3.25% Sep-2026.
- **CPI**: Dec/Dec inflation from the series is 2002 6.5%, 2015 −1.0%, 2022 5.3%, and Jan-2023 5.4% y/y (peak). All of these equal CBS's published rates.
  An earlier attempt used FRED/OECD `ISRCPIALLMINMEI`. It was dropped because it differs from CBS by up to 0.28 pp in 1999–2006 and ends in 2025-03.
- **USD/ILS**: FRED `CCUSMA02ILM618N` (OECD monthly average) used for a visual sanity check only.

### Caveats for the engine
- `sp500` and `ta125` are **price** indices. Dividends (~1.5–3%/yr) are not included. If the index fund should be total-return, add a dividend yield on top.
- `boiRate` is a level in %, not a price. `monthlyChange('boiRate', …)` returns a ratio (e.g. 0.1→0.35 = 3.5×). For rates, use differences: `seriesAt(…, ym) − seriesAt(…, prev)`.
- `homeIL` ends 2026-08, two months before the other series. `seriesAt` clamps to the last value outside a series' range.
- Live values for the weekly challenge (BoI, retrieved 2026-11-20): policy rate **3.25%**, USD/ILS representative rate **3.326**.

### Re-fetch recipe
`curl` works from the container for all of the URLs above (FRED, Yahoo, CBS, BoI). The build scripts are kept outside the repo, in `/tmp/rrbuild/{build,gen,validate}.mjs`. Stooq was **not** used because it serves a JavaScript bot-check.

## 2. Israeli tax / payroll parameters (`TAX_IL`, year 2026, monthly ₪)

| parameter | value | source |
|---|---|---|
| Income-tax brackets 2026 (monthly) | ≤7,010 10% · ≤10,060 14% · ≤19,000 20% · ≤25,100 31% · ≤46,690 35% · ≤60,130 47% · above 50% (47% + 3% מס יסף) | Full table: Bizportal brutto-netto 2026 calculator `https://www.bizportal.co.il/additives/376/brutto-netto-2026.html`. Widening of the 20%/31% brackets (to 19,000 / 25,100; annual 228,000 / 301,200), **retroactive to January 2026**, law published in Reshumot on 31-03-2026: Malam payroll clarification `https://www.malam-payroll.com/ריווח-מדרגות-מס-הכנסה-מינואר-2026-הבהרה-למ/` and Maariv `https://www.maariv.co.il/economy/israel/article-1317774` (35% now starts at 25,100 instead of 22,441). |
| Credit point value | 242 ₪/month (2,904 ₪/year) | Kol-Zchut `https://www.kolzchut.org.il/he/נקודות_זיכוי_ממס_הכנסה` ("2,904 ₪ לשנה") and the Bizportal 2026 calculator (242/month). |
| Default credit points | 2.25 (resident man; woman 2.75) | Bizportal 2026 calculator (same page). |
| Bituach Leumi, employee | 1.04% up to 7,703 ₪; 7% above; ceiling 51,910 ₪ | Bituach Leumi official rates page `https://www.btl.gov.il/insurance/rates/pages/לעובדים%20שכירים.aspx`: threshold 7,703 and ceiling 51,910 effective 01-01-2026; 1.04% from 01-01-2025; 7% from 01-01-2006. |
| Health tax, employee | 3.23% up to 7,703 ₪; 5.17% above | Same BTL page (3.23% from 01-01-2025, 5.17% from 01-02-2025). Together with BL: 4.27% / 12.17%. Bizportal shows the same total of 329 ₪ on the reduced part. |
| Pension (mandatory minimum) | employee 6%, employer 6.5% (savings), employer 6% (severance); total 18.5% | Kol-Zchut `https://www.kolzchut.org.il/he/פנסיה` (in force since January 2017). |
| Capital-gains tax | 25% of the **real** gain on securities (individual) | Globes `https://www.globes.co.il/news/article.aspx?did=1001142874`. The extra surtax on capital income is not modelled. |
| Rental income | 10% track on gross residential rent; exemption track up to 5,654 ₪/month (2026) | Kol-Zchut `https://www.kolzchut.org.il/he/פטור_ממס_על_הכנסה_מהשכרת_דירה_למגורים` (page title states 5,654 ₪ for 2026). 10% track: same page family / Bizportal rental-tax calculator `https://www.bizportal.co.il/additives/264/rental-income-tax-ca.html`. |

Sanity payslip with these parameters (single man, 2.25 points, 6% pension, no pension tax credit): gross 15,000 → income tax ≈1,572, BL ≈591, health ≈626, pension 900 → **net ≈11,312**.

## 3. Scenario headlines (`SCENARIOS`)

All headlines are paraphrased in our own Hebrew; none were copied. They come from three kinds of source:
- **Derived from the series above**, so they match the data by construction:
  - every BoI rate move (3.8% 12-2001, 9.1% 06-2002, 0.5% 03-2009, first hike 08-2009, 0.1% 02-2015, 0.25% 11-2018, 0.1% 04-2020, 0.35% 04-2022, 4.75% 05-2023 = 10th hike in a row, 4.5% 01-2024);
  - "home prices +~20% in 2009", "+~13% in 2021", "−~2% y/y Aug-2018, first drop in about a decade", "≈2.4× vs Jan-2008 by Dec-2020";
  - "S&P −57% from the 2007 peak" (closing values 1,565 → 676; month-end series −53%);
  - "S&P −25% from peak in Oct-2022";
  - "Israeli CPI 5.4% y/y, Jan-2023 (published Feb-2023)".
- **Verified on the web for this file**:
  - State Comptroller housing report (Feb-2015): +55% home prices and +30% rents, 2008–2013. Source: JewishPress summary `https://www.jewishpress.com/news/breaking-news/israel-state-comptrollers-report-details-housing-crisis/2015/02/25/`, report at `https://library.mevaker.gov.il/sites/DigitalLibrary/Pages/Publications/56.aspx`.
  - Purchase tax on investment flats raised to 8%, effective 24-06-2015. Source: Bizportal `https://www.bizportal.co.il/realestates/news/article/410162`.
  - High Court struck down the third-apartment tax, 07-08-2017. Source: Israel Hayom `https://www.israelhayom.co.il/article/495735`.
  - Investor purchase tax cut from 8% to 5% (July 2020, COVID). Source: Bizportal `https://www.bizportal.co.il/realestates/news/article/782102`.
- **Widely documented events, dated from general knowledge.** No figures were taken from a single article for these:
  - AOL–Time Warner (01-2000); Nasdaq >5,000 (03-2000) and its −25% week (04-2000); start of the Second Intifada (09/10-2000); Pets.com (11-2000); Fed emergency cut (01-2001); 9/11 market closure; Enron (12-2001); WorldCom (06-2002); Sarbanes-Oxley (07-2002); Nasdaq trough −78% (10-2002); Iraq war (03-2003); Israeli recovery plan (2003); Fed hikes (06-2004); Google IPO (08-2004).
  - Bear Stearns funds (06-2007); BNP Paribas freeze (08-2007); Fed −75 bp (01-2008); Bear Stearns sale (03-2008); BoI dollar buying (03-2008); Lehman and the TARP vote (09-2008); coordinated cuts (10-2008); Madoff and Fed 0–0.25% (12-2008); Greece bailout and the Flash Crash (05-2010); QE2 (11-2010); tent protest (07-2011); US downgrade (08-2011); Trajtenberg report (09-2011); BoI mortgage LTV limits (11-2012) and PTI/term limits (08-2013); "0% VAT" plan shelved (12-2014).
  - COVID timeline 2019-10 … 2023-03, including WHO pandemic, the Fed to zero, negative oil, >1M Israeli job seekers, Pfizer, Israel's vaccination drive, GameStop and SVB.
  - Inflation timeline 2021–2025, including "transitory" being retired, the Ukraine invasion, the Fed +75 bp, US CPI 9.1%, ChatGPT, the judicial overhaul, 7-Oct and the BoI $30bn FX package, Moody's first downgrade of Israel (02-2024), the Fed −50 bp (09-2024), VAT 18% (01-2025) and the April-2025 tariffs.

  The engine team can easily cut any of these headlines if needed. None of them drives numbers in the game.
