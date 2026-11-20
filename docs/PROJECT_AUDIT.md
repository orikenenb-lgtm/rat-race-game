# PROJECT_AUDIT — מירוץ העכברים (Existing-Code Audit)

> מבקר: Agent 14 (Existing Code Auditor) + Agent 03 (Chief Architect, תיעוד). קריאה בלבד בקוד.
> תאריך: 2026-11-20. **צילום מצב: 15:00–15:10 (IST).** חמישה סוכנים עורכים את `/home/claude/rr2` במקביל.
> לדוגמה, `js/engine.js` גדל מ־1,934 ל־~2,400 שורות בזמן הביקורת. כל סטטוס של v3 הוא "נכון לרגע הבדיקה".
> כל טענה כאן נבדקה בקוד (grep/קריאה), בהרצת בדיקות, ב־SQL לקריאה בלבד מול Supabase או ב־curl לאתר החי. מה שלא נבדק מסומן "לא אומת".

## 0. איך נבדק

| מה | איך | תוצאה |
|---|---|---|
| קוד v2 (חי) | `/home/claude/rat-race-game` (ענף `feature/financial-game-master-upgrade`, HEAD `6e9372a` = main) | נקי, אין שינויים מקומיים |
| קוד v3 (בעבודה) | `/home/claude/rr2` (עותק עבודה, לא git) | 27 קבצי JS/CSS/HTML, מהם 6 חדשים לעומת v2 |
| האתר החי | `curl https://orikenenb-lgtm.github.io/rat-race-game/` | 200. `js/net.js` החי = v2 (אין `rr_register2`), `js/life.js` מחזיר 404 → **החי הוא v2** |
| בדיקות v2 | `node tests/engine.test.mjs 200` · `node tests/progress.test.mjs` (בתיקיית v2) | **30/30** · **31/31** |
| בדיקות v3 | אותן בדיקות ב־rr2 + `tests/energy.test.mjs` | מנוע: 12/30 (14:58) → 19/30 (15:03) → **30/30 (15:10, 30 משחקים לעולם; ראש המנוע עדכן בדיקות ו־handlers במהלך הביקורת)**. progress **31/31**. energy **26/26** |
| שרת | Supabase MCP: `list_tables`, `list_migrations`, `execute_sql` (SELECT בלבד), `get_advisors` | 7 טבלאות בסכמה `game`, 23 פונקציות `rr_*`, 6 migrations |

## 1. Git, ענפים ופריסה

| פריט | מצב |
|---|---|
| Remote | `github.com/orikenenb-lgtm/rat-race-game` (ציבורי). Pages מ־`main`, תיקיית שורש (`.nojekyll`) |
| היסטוריה | 2 commits בלבד: `7bab0bf` (v1.1 חלון מסחר) ← `6e9372a` (v2, 77 קבצים, +10,320 שורות) |
| ענף עבודה | `feature/financial-game-master-upgrade` קיים, עדיין זהה ל־main. עבודת v3 נמצאת ב־`/home/claude/rr2` ותועתק לענף ע"י המתזמר |
| שחזור | `main` = v2 החי. חזרה לאחור = לא למזג. אין CI (אין `.github/`), אין `package.json`, אין lint/type-check |
| תוכן שלא ב־git | `legacy/v1.html`, `docs-v3/`, `ENGINE.md`/`DESIGN.md` בשורש rr2 (ב־git הם תחת `docs/`), `blender/build_*` של v3 |

## 2. מבנה הפרויקט ו־Stack

**Stack:** HTML + ES modules סטטיים, בלי שלב build. `three@0.170.0` מ־jsDelivr דרך importmap (`index.html:17`, בלי SRI). פונטים Rubik/Secular One. Supabase (Postgres) רק דרך RPC `public.rr_*` (SECURITY DEFINER, בדיקת id+secret). אירוח: GitHub Pages. נכסים: GLB מ־Blender. בדיקות: Node 22 (יחידה/סימולציה) + Python Playwright 1.63 עם Chromium ו־SwiftShader (E2E).

| קובץ | שורות (rr2) | v2→v3 | תפקיד | בעלים (לפי AGENT_ORGANIZATION) |
|---|---|---|---|---|
| `index.html` | 76 | שונה | מעטפת, importmap, DOM של HUD/כרטיסים | ממשק המשחק |
| `js/main.js` | 108 | זהה | boot, טעינת lobby, **בורר חלופי מובנה** אם lobby נכשל | ממשק המשחק |
| `js/engine.js` | ~2,400 (v2: 1,592) | שונה מאוד | מנוע טהור ודטרמיניסטי | ראש המנוע |
| `js/rng.js` | 71 | +2 streams (`life`, `index`) | mulberry32 + streams בשם | ראש המנוע |
| `js/life.js` | ~230 | **חדש** | מס/תלוש, תוכניות, אנרגיה, אושר, דירוג אשראי, 12 אירועי חיים, 59 שיעורים | ראש המנוע |
| `js/history.js` | 60 | **חדש** | גישה לנתונים אמיתיים, תרחישים, עזרי YYYY-MM | ראש המנוע |
| `js/data/real.js` | 417 (36KB) | **חדש** | 6 סדרות חודשיות 1999–2026, `TAX_IL` 2026, 5 תרחישים | חוקר נתונים (הושלם) |
| `js/worlds/{common,index,w1..w4,h}.js` | ~940 | שונה + `h.js` חדש | נתוני עולמות, לוחות, חפיסות, קווי מנטור | ראש המנוע |
| `js/achievements.js` | 120 | זהה | 33 הישגים, `TITLES`, `titleFor` | ראש המנוע |
| `js/game.js` | 739+ | שונה | בקר מסך המשחק, שמירה מקומית, checkpoint לשרת, שער ⚡ | ממשק המשחק |
| `js/ui.js` | 916+ | שונה | HUD, דוח כספי, כרטיסים, חלון מסחר, מנטור (+TTS), סיפור חיים | ממשק המשחק |
| `js/scene.js` | 1,232 | שונה | three.js: לוח דינמי (24/40), מודלים, יד+קוביות, אפקטים, render-on-demand | ממשק המשחק |
| `js/audio.js` | 153 | שונה מעט | צלילי WebAudio סינתטיים | ממשק המשחק |
| `js/lobby.js` | 1,535+ | שונה | מפת עולמות, יומי/שבועי, קבוצות, דו־קרב, פרופיל, ספרייה, מכונת הזמן, מסך סיום | לובי |
| `js/progress.js` | 327 | שונה מעט | התקדמות מקומית + סנכרון | לובי |
| `js/energy.js` | 95 | **חדש** | ⚡ (25, +1 כל 6 דק') ב־localStorage | לובי |
| `js/library.js` | 65 | **חדש** | ספריית שיעורים (נפתחים/נקראו) | לובי |
| `js/net.js` | 104 | שונה | עטיפת RPC ל־Supabase | מתזמר |
| `js/bus.js` | 11 | זהה | אירועים בין game↔lobby | מתזמר |
| `css/game.css`, `css/lobby.css` | 590 / 710 | שונה | עיצוב, `light-dark()`, 26+9 media queries | ממשק / לובי |
| `tools/sim.mjs` + `tools/balance-report.md` | 387 | זהה | סימולציית איזון (6 מדיניויות × דמויות) | ראש המנוע |
| `tests/*` | ~1,800 | +`energy.test.mjs`, `lobby_v3.py` | יחידה (Node), E2E (Playwright), stubs | כל ראש צוות |
| `blender/*` | 5 סקריפטים | `build_w1.py` בלבד ב־git | בניית GLB ב־bpy 5.3 | תלת־ממד |
| `assets/**` | 13MB (GLB ≈9.8MB) | +`life/`, `history/` | מודלים ותמונות כרטיס | תלת־ממד |
| `legacy/v1.html` | 69KB | לא ב־git | v1 בקובץ יחיד (ארכיון) | — |

## 3. מפת המערכות — סטטוס

מקרא סטטוס (לפי המפרט): **קיימת ופועלת** · **חלקית** · **תקולה** · **חסרה** · **כפולה** · **לא רלוונטית**.
עדיפות: **P0** חוסם מיזוג או שובר משחק · **P1** ערך גבוה · **P2** שיפור · **P3** נחמד.

### 3.1 ליבת המשחק

| מערכת | v2 חי | v3 בעבודה | קבצים | ממצאים | המלצה | עדיפות |
|---|---|---|---|---|---|---|
| מנוע משחק טהור | קיימת ופועלת | חלקית (בעבודה, מהיר) | `js/engine.js` | v2: 30/30 בדיקות, אפס `Math.random`/`Date`/DOM. v3: 14:58 נכשל ב־`unknown tile type life/tax/index`. 15:03: 19/30 (בדיקות v2 שמניחות 24 אריחים, קובייה אחת ו־3% קבוע). **15:10: 30/30** אחרי ש־handlers `life/edu/tax/index` נוספו והבדיקות עודכנו. 30/30 הורץ רק עם 30 משחקים לעולם; ב־v2 הבסיס היה 200–2000 | להריץ שוב עם 2000 משחקים לעולם, ואת `tools/sim.mjs` על v3 (balance-report עדיין v2.1). קריטריון מיזוג: 30/30 ב־2000 ודוח איזון v3 | **P0** (עד אימות) |
| לוח, קוביות, תורות | קיימת ופועלת (24 אריחים, קובייה 1) | חלקית | `engine.js rollDice`, `worlds/common.js ring()`, `scene.js boardN` | v3: `ring()` בונה 40 אריחים, משכורת בפינות 0/10/20/30. תמיד נמשכות 2 קוביות מ־stream `dice`. בדאבל יש בונוס (אנרגיה או "הצצה"). `scene.js` גוזר גאומטריה ממספר האריחים | סטיית חוזה: ENGINE.md אומר ש־`boardInfo()` מחזיר `{length, corners, tiles}`. בקוד (15:10) הוא מחזיר **מערך** אריחים עם `tiles.corners`. לעדכן את ENGINE.md לצורה בפועל | P2 |
| RNG ודטרמיניזם | קיימת ופועלת | קיימת ופועלת | `js/rng.js`, ENGINE.md §5 | streams בשם, נצרכים לפי האריח בלבד. בדיקות הדטרמיניזם עוברות גם ב־v3. גורל סטארט־אפ, משא ומתן ושיעור העלאה נקבעים מראש בזמן משיכת הכרטיס | לשמר. כל מכניקה חדשה (בנק/עסק) חייבת לצרוך RNG רק מ־stream ייעודי ובזמן המשיכה | — |
| מנגנון כרטיסים/אירועים | קיימת ופועלת | חלקית | `engine.js DESCRIBE/CHOOSE`, `worlds/*` | 13 סוגי אירועים ב־v2 (deal, trade, doodad, market, crisis, mystery, payday, bank, upgrade, fx, shipping, pitch, giving). v3 מוסיף `life`, `edu`, `tax`. אריח `index` ממומש כחלון `trade` על `IDX`, כלומר שימוש חוזר ולא סוג חדש. קיימים בנוסף: `primary` חכם, כרטיסים אוטומטיים לא רלוונטיים, `shortfall` לפני תשלום | לשמר את דפוס השימוש החוזר | — |
| שמירה/המשך | קיימת ופועלת | חלקית | `engine.js serialize/deserialize/migrateV2`, `game.js persist()` | שמירה בכל צעד, גם עם כרטיס פתוח. v3 ממפה שמירת v1/v2 ללוח 40 (`pos×40/24`) או זורק `save_incompatible` → טוסט "מתחילים מחדש". **שני מספרי גרסה**: עטיפה `{v:2,cfg,state}` ומצב `st.v=3` | לתעד את שתי הגרסאות (ARCHITECTURE §5). להוסיף בדיקת "טעינת שמירה ישנה" עם קובץ v2 אמיתי | P1 |
| יומן פעולות ו־replay | חלקית (`st.log` עד 80 החלטות + `summaryForServer`) | **בעבודה** | `engine.js act()/replay()/replayConfig()` | נוסף בזמן הביקורת (T-06). זה הבסיס לאימות בשרת | להשלים בדיקה "replay(actions) ≡ state" | P1 |
| מנגנון סיום וכוכבים | קיימת ופועלת | חלקית | `engine.js checkEnd/starsFor/starThresholds`, `nearMiss`, `tipFor`, `leaksOf` | ספים לפי דמות. "דליפות" וטיפ על הדליפה הגדולה שנבחרה. ★★★ עם שער אושר: ב־15:03 לא היה במנוע. ב־15:10 נוספו `starsBlockedByHappiness` ו־`lifeSummary`. הלובי מחזיק ברירת מחדל 60 קשיחה משלו (`lobby.js:1201`) | המנוע הוא מקור האמת לשער. הלובי רק מציג את `end.starsBlockedByHappiness` ו־`T.happy`, בלי מספר משלו | P2 |
| בייל־אאוט | קיימת ופועלת | קיימת | `engine.js bailout()` | פעם אחת למשחק, ונעשה בפועל רק אם השחקן לא פשט רגל קודם (`progress.bailoutAvailable`) | לשמר | — |
| הדרכה (tutorial) | קיימת ופועלת | קיימת | `engine.js createGame({tutorial})`, `game.js` coach marks | הזריקה הראשונה נוחתת על עסקה, עסקת פתיחה, אין משבר ב־3 תורות. RNG לא זז | לשמר | — |

### 3.2 מערכות פיננסיות

| מערכת | v2 חי | v3 בעבודה | קבצים | ממצאים | המלצה | עדיפות |
|---|---|---|---|---|---|---|
| תזרים, הכנסה, שווי נקי | קיימת ופועלת | חלקית | `engine.js metrics/passiveOf/expensesOf/netWorthOf`, `ui.js renderSheet` | מזומן, תזרים, הכנסה ושווי נקי מופרדים ב־`metrics()`. **סטיית חוזה:** ENGINE.md v3 אומר ש־`m.netWorth` כולל פנסיה ויש `netWorthNoPension`. בקוד `netWorth` בלי פנסיה ו־`netWorthTotal = netWorth + pension`. **חישוב כפול:** `ui.js:330` מחשב סה"כ נכסים בעצמו (`totA`) | להחליט על הגדרה אחת ולעדכן את ENGINE.md. ה־UI יציג `m.totalAssets`/`m.totalLiabilities` מהמנוע ולא יחשב | **P1** |
| תלוש (ברוטו→נטו) | חסרה | קיימת (בעבודה) | `life.js TAX/slip/incomeTax/blTax`, `engine.js payslipOf` | מדרגות 2026, נקודות זיכוי, ב"ל+בריאות, פנסיה 6/6.5/6. מקור: `docs-v3/sources.md`. **שתי טבלאות מס:** `life.js TAX` (ברירת מחדל קשיחה) ו־`real.js TAX_IL`, מסונכרנות ב־`setTaxTable()` שמשנה אובייקט גלובלי. כותרת `life.js` עדיין אומרת "2025 brackets" | מקור אחד: `real.js TAX_IL`. `life.js` רק ממיר. להוסיף בדיקה עם תשובה ידועה (₪15,000 → ₪11,312 לפי sources.md, כרגע אין) | **P1** |
| בנק: הלוואות | קיימת ופועלת | חלקית | `engine.js loanPct/loanCap/takeLoan/repayLoan/ensureCash`, `worlds/*.loan` | תקרה לפי הכנסה, הלוואה כפויה ביחידות קטנות, סדר עלויות משכנתא < בנק < אשראי (נבדק). **הלוואות בלי לוח סילוקין:** הקרן לא יורדת בלי פירעון ידני. **ריביות מוגזמות לצורך חינוכי:** w1 3% לחודש (≈36% לשנה), אשראי 5% לחודש (≈60% לשנה). זה לא מתועד לשחקן | לא לבנות מודול מקביל. `js/finance/bank.js` (T-07) צריך **להחליף** את `loanPay/creditPay` במנוע, לא לשבת לידם. להוסיף שפיצר כאופציה ולתעד במנטור ש"הריביות מוגדלות כדי שתרגיש אותן" | **P1** |
| משכנתאות | קיימת (w1: מקדמה+חוב, w2: ריבית משתנה/קבועה, מחזור, פירעון מוקדם `prepay`) | קיימת | `engine.js assetCfRaw`, `DESCRIBE.bank` | תזרים = NOI − חוב × ריבית ÷ 1200, כלומר **interest-only**. אין לוח סילוקין ואין ירידת קרן | לוח סילוקין לתצוגה (שפיצר) דרך T-07, ולהזין את אותה נוסחה למנוע | P2 |
| כרטיס אשראי/תשלומים | קיימת (`credit`, 5%/חודש, `payCredit`) | קיימת + השפעה על דירוג | `engine.js` | אין מסגרת עו"ש, אין עמלות חודשיות | לא הכרחי. מסגרת אשראי = הלוואה כפויה קיימת. לתת לה שם במנטור | P3 |
| חיסכון/פיקדונות | חסרה | חסרה (יש קרן מדד) | — | מזומן לא נושא ריבית. לא נמצאו "פיקדון"/"חיסכון" כמוצר | פיקדון פשוט (ריבית בנק ישראל − מרווח) ב־T-07, מוצג רק ב־w2/היסטוריה | P2 |
| דירוג אשראי | חסרה | קיימת (בעבודה) | `life.js creditBand`, `engine.js bandOf/creditScore` | 300–850, שינוי ריבית ותקרה לפי רצועה. מוצג ב־HUD (`ui.js:254`) | לשמר. בדיקה עם תשובה ידועה לרצועות | P2 |
| השקעות: מסחר | קיימת ופועלת | קיימת | `engine.js trade`, `ui.js tradeHtml`, `worlds/*.tickers` | מניות, אג"ח (`AGAH` ב־w2, יורד כשהריבית עולה), זהב, דולר, קריפטו עם "מטבע חדש" (EV<1). **אין עמלות מסחר.** מס רווחי הון 25% עם קיזוז הפסדים (v3) | עמלה קטנה קבועה (כדי ללמד "מסחר תכוף עולה כסף") דרך מודול ההשקעות, לא ב־UI | P2 |
| קרן מדד ופנסיה | חסרה | קיימת (בעבודה) | `worlds/common.js INDEX_TICKER`, `engine.js monthlyIndex/invest/setAutoInvest`, `ui.js compoundBox` | תשואה ≈7%/שנה, משיכות מראש. פנסיה גדלה עם המדד. `invest/setAutoInvest/setPlan` יוצאו בזמן הביקורת | לחבר אריח `I`, ולהוסיף בדיקת ריבית דריבית עם תשובה ידועה | P1 |
| נדל"ן | קיימת (עסקאות, שכירות, תיקונים, שערוך `reval`, הצעות קנייה, שדרוג ב־w2) | + מס שכירות 10%, מס שבח פשוט | `worlds/*.deals`, `engine.js` | **אי־דיוק:** מס 10% מוחל על **התזרים נטו אחרי משכנתא** (`assetCf`), ובמסלול האמיתי הוא על שכר הדירה ברוטו. אין חודשים בלי שוכר (vacancy) כמכניקה | לתקן במודול אחד (מס על ברוטו). vacancy כאירוע market | P1 (דיוק) |
| עסקים | חלקית: עסק = כרטיס עסקה עם תזרים קבוע. w3 יבואן/יצואן רגיש לדולר. w4 סטארט־אפים | `side` מתפתח לעסק ברמה 3 | `worlds/*`, `engine.js` | אין מלאי, עובדים, תמחור, ביקוש או מחזור מול רווח | T-08 `js/finance/business.js`. **להרחיב את `kind` הקיים** של נכס עסקי, לא סוג נכס חדש | P1 |
| אינפלציה ומדד | חסרה (w2 רק טקסט) | קיימת (בעבודה) | `engine.js yearlyPrices`, `life.js`, `real.js cpiIL` | CPI חודשי, הוצאות עולות, שכירות 70%, "ערך ריאלי" | לשמר | — |
| אירועים כלכליים | קיימת: ריבית (w2), דולר (w3), משברים, פיטורים, שוק, הפתעות | + אירועי חיים, היסטוריה אמיתית | `worlds/*`, `life.js LIFE_EVENTS`, `history.js` | מיתון מופיע רק כטקסט ב־w2. אבטלה = משבר X ו־`layoff` | לשמר | — |
| מצב היסטורי "מכונת הזמן" | חסרה | בעבודה | `history.js`, `worlds/h.js`, `real.js`, `lobby.js` (תפריט) | 5 תרחישים אמיתיים, מדד "קנה והחזק" | לבדוק את כל 5 התרחישים עד הסוף ב־sim | P1 |

### 3.3 מטא, חברתי ושרת

| מערכת | v2 חי | v3 בעבודה | קבצים | ממצאים | המלצה | עדיפות |
|---|---|---|---|---|---|---|
| זהות/Auth | קיימת ופועלת | קיימת | `net.js`, `game.auth()` | אין Supabase Auth. `rr_register` מחזיר `{id, secret}`, השרת שומר `sha256(secret)`. קוד שחזור = base64 של `[id,secret,nick]` | לשמר (מתאים לקהל). להזהיר בפרופיל שהקוד = סיסמה | — |
| התקדמות, כוכבים, פתיחת עולמות | קיימת ופועלת | קיימת | `progress.js`, `rr_sync_progress2` | השרת שומר מקסימום כוכבים ואיחוד הישגים. **השרת מאמין לכוכבים מהלקוח** (`least(3,…)` בלבד) | לאמת דרך replay (T-15) לפחות לתוצאות מדורגות | P2 |
| הישגים ותארים | קיימת ופועלת | קיימת | `achievements.js` (33), `progress.js` | **כפילות:** `net.title()` (`net.js` סוף הקובץ) משכפל את `titleFor()` עם אותם ספים. לא נמצא שימוש ב־`net.title` | למחוק את `net.title` (באישור המתזמר, קוד מת) | P3 |
| כלי משחק, צבעים | קיימת ופועלת | קיימת | `progress.js PAWNS/PAWN_COLORS`, `assets/pawns` | 6 כלים לפי כוכבים | לשמר | — |
| יומי | קיימת ופועלת | קיימת | `rr_daily`, `game.day()`, `lobby.js` | השרת קובע עולם/דמות/seed (`game.day()`: מערך לפי יום בשבוע, 24 חודשים). **כפילות/קוד מת:** `E.dailyConfig()` במנוע מסובב w1→w4 אחרת, ורק הבדיקות משתמשות בו | לסמן את `dailyConfig` כ־deprecated, או ליישר לשרת | P3 |
| שבועי | קיימת ופועלת | קיימת | `rr_weekly`, `game.week()` | `game.week()` מחזיר גם `profession` (מערך 4 מקצועות v1) שאף אחד לא קורא | להשאיר (תאימות). לתעד כמת | P3 |
| קבוצות ואתגרים | קיימת ופועלת | קיימת + פיד ומתנות ⚡ | `rr_create_group/join/leave/my_groups/group/create_challenge2`, `rr_group_feed`, `rr_send_energy` | קוד קבוצה וקישור WhatsApp. אתגר = seed משותף, אסינכרוני | לשמר | — |
| דו־קרב (`?duel=`) | קיימת ופועלת | קיימת | `lobby.js renderDuel` | משחק free עם seed ידוע, לא נרשם בשרת | לשמר | — |
| checkpoints מדורגים | קיימת ופועלת | קיימת | `game.js checkpoint/pumpCheckpoint`, `rr_begin/rr_checkpoint` | state מלא אחרי כל נחיתה והחלטה, `seq` מונוטוני, השרת דוחה הורדת מספר (`stale_checkpoint`), עד 300KB (בפועל ≤2.5KB) | לשמר. **השרת לא מאמת את התוכן** | P1 (ראו אבטחה) |
| שליחת תוצאה | קיימת ופועלת | קיימת | `rr_finish`, `lobby.js` תור `rr2-pending-finish` | פעם אחת בדיוק (`already_finished`). **ערכים מהלקוח בלי אימות** (סטטוס, חודשים, שווי) | T-15: Edge Function שמריצה `replay()` ודוחה זיוף | **P1** |
| ⚡ אנרגיה (מגבלת זריקות) | חסרה | קיימת (בעבודה) | `energy.js` (`rr2-energy`), `game.js` שער, `E.rollCost` | 25 מקס, +1/6 דק', מדורג חינם. **מאוחסן רק בדפדפן** (מחיקת localStorage = מילוי). מתנות והפניות בשרת | מקובל לשלב זה (אין כסף אמיתי). לתעד. אפשר לשמור `e/at` בשרת בעתיד | P3 |
| הפניות (+5⚡) | חסרה | קיימת | `rr_register2` | **ניתן לניצול:** אין הגבלת קצב. כל רישום עם `p_ref` נותן +5⚡ למפנה | להגביל: הפניה נספרת רק אחרי משחק ראשון של המופנה, או עד N ליום | P2 |
| ספריית שיעורים | חסרה | קיימת (בעבודה) | `life.js LESSONS` (59), `library.js`, `lobby.js` | נפתחים לפי ניסיון | לשמר | — |
| סיפור חיים בסוף | חסרה | בעבודה | `ui.js lifeStory`, `lobby.js`, `engine` | ה־UI והלובי מוכנים. `lifeSummary` הופיע במנוע ב־15:10 | E2E מקצה לקצה כשהשילוב נגמר | P1 |
| מנטור "אבא עשיר" | קיימת ופועלת, **מבוסס חוקים** | קיימת | `worlds/common.js MENTOR`, `worlds/*.mentor`, `engine.js mentorLine`, `ui.js mentor/speak` | שורת "לפני" ו"אחרי" לכל החלטה, הקראה בעברית (`speechSynthesis`). **אין AI חיצוני**: הקריאה היחידה ברשת היא `net.js` → Supabase. אין התאמה לרמת ידע. המנטור תמיד בלשון זכר (QA) | להרחיב את המנגנון הקיים (שכבת `mentorLine`): רמות, דוגמה מספרית, שאלת תרגול. AI חיצוני = T-18 ממתין לאישור (עלות) | P1 |
| בורר חלופי ב־main.js | קיימת | קיימת | `main.js useFallback` | **כפולה (מכוונת):** לובי מינימלי אם `lobby.js` נכשל. משמש גם בבדיקות E2E | לשמר ולתעד ככפילות מכוונת | — |
| מולטיפלייר בזמן אמת | חסרה | חסרה | — | יש רק תחרות אסינכרונית על seed משותף. אין חדרים, טיימר תור או סנכרון חי | **לא רלוונטית לשלב זה** (T-19 ממתין לאישור). ראו FEATURE_MATRIX §10 | P3 |

### 3.4 ממשק, תלת־ממד, נגישות, ביצועים

| מערכת | v2 חי | v3 בעבודה | קבצים | ממצאים | המלצה | עדיפות |
|---|---|---|---|---|---|---|
| תלת־ממד | קיימת ופועלת | חלקית (יד+קוביות, 40 אריחים, מודלי חיים) | `scene.js`, `assets/**`, `blender/*` | render-on-demand (`wake/invalidate/setPaused`), `lowPower` לרינדור תוכנה (pixelRatio 0.6), טעינה לפי עולם (`preloadWorld`). **GLB לא דחוסים** (אין Draco/Meshopt), 0.1–0.43MB למודל | דחיסת Meshopt/Draco ב־Blender export. לא להחליף מנוע | P2 |
| כפילות נכסים | — | **כפולה** | `assets/{apartment,business,crypto,pawn,stock}.glb` | זהים byte-by-byte (md5) ל־`assets/w1/*`. רק `legacy/v1.html` משתמש בהם. לא ב־git | לא להעתיק לענף. למחוק מ־rr2 באישור | P3 |
| HUD ודוח כספי | קיימת ופועלת | חלקית (שורת חיים, תלוש) | `ui.js renderHUD/renderSheet/lifeDetails` | ראו "חישוב כפול" ב־3.2 | — | P1 |
| עברית ו־RTL | קיימת ופועלת | קיימת | `index.html lang="he" dir="rtl"`, `ui.js iso()/goalWords()` | בידוד מספרים (LRI/PDI), משוואת ROI ב־`<bdi dir="ltr">`. תוקנו באגי bidi מ־QA (B6) | בדיקת RTL אוטומטית ב־E2E (צילום + regex ל־`₪…−`) | P2 |
| נגישות | חלקית | חלקית | `ui.js modal` (Esc, החזרת focus), 130 מאפייני `aria-*`, 20 `role` | `prefers-reduced-motion` ב־CSS ובמטבעות. קיצורי מקלדת (Space/Enter). לא נבדקו קורא מסך, focus-trap מלא וניגודיות. "לא אומת" | axe-core ב־Playwright (גל QA) | P2 |
| מובייל | קיימת | קיימת | CSS media queries, `vibrate` | QA: HUD צר ב־360px (חלקית תוקן?) "לא אומת" | גל QA | P2 |
| ביצועים | חלקית | חלקית | — | אין מדידה מתועדת. JS ≈740KB לא מוקטן (אין build), three.module מ־CDN, GLB ≈1.1–1.6MB לעולם, life 3.1MB (נטען ב־`preloadLife`). `history.js` טוען את `real.js` (36KB) ב־top-level await, כלומר **עם המנוע ולא בעצלות** כפי ש־ENGINE.md מתאר | PERFORMANCE_REPORT (גל QA): Lighthouse, FPS ב־SwiftShader, מספר בקשות. `import()` דינמי ל־real.js רק במצב היסטוריה | P2 |
| אודיו | קיימת ופועלת | קיימת | `audio.js` | סינתזה בלי קבצים | לשמר | — |

### 3.5 בדיקות

| סוג | קיים | מצב |
|---|---|---|
| יחידה: מנוע | `tests/engine.test.mjs` (30 בדיקות, אלפי משחקים אקראיים) | v2 30/30 (200/עולם) · v3 30/30 ב־15:10 (30/עולם בלבד) |
| יחידה: התקדמות | `tests/progress.test.mjs` | 31/31 (v2 ו־v3) |
| יחידה: ⚡ | `tests/energy.test.mjs` | 26/26 |
| סימולציית איזון | `tools/sim.mjs` → `tools/balance-report.md` | דוח v2.1 (600 משחקים לכל דמות×מדיניות). לא הורץ על v3 |
| E2E | `tests/game_e2e.py`, `lobby_e2e.py`, `lobby_v21.py`, `lobby_v3.py`, `lobby_real.py`, `lobby_smoke.py`, `lobby_shots.py` | Playwright + SwiftShader. **בדיקות הלובי רצות מול שרת ה־Production** עם כינויי `טסט` (45 מתוך 46 שחקנים בטבלה הם `טסט…`). לא הורצו בביקורת הזו |
| חסר | — | בדיקות חישוב עם תשובה ידועה (תלוש, ריבית דריבית, שפיצר), טעינת שמירת v2 אמיתית, נגישות, ביצועים, אבטחה (זיוף `rr_finish`), CI |

### 3.6 שרת (Supabase `xvqaxphyfqdzkddmoosu`)

| פריט | מצב |
|---|---|
| טבלאות `game.*` | `players`(46), `groups`(23), `group_members`(32), `challenges`(40), `results`(70: 12 playing, 58 finished), `energy_gifts`(6), `events`(8). RLS מופעל בכולן **בלי policies** = חסום לגישה ישירה. זה מכוון: הגישה רק דרך RPC |
| פונקציות `public.rr_*` | 23, כולן `SECURITY DEFINER`, `search_path=''`, ניתנות להרצה ע"י `anon` (מכוון. Advisor מסמן WARN ×23) |
| פונקציות לא בשימוש | `rr_start`, `rr_create_challenge` (v1), `rr_sync_progress` (נקרא פנימית מ־v2). `rr_register` משמש את v2 החי ואת `rr_register2` |
| Migrations | `game_schema`, `game_functions`, `v2_worlds_daily_progress`, `v2_rpcs`, `v21_checkpoint_daily_meta`, `v3_energy_gifts_referrals_feed`. **ה־migration של v3 כבר בפרודקשן.** הוא תוספתי ו־v2 החי ממשיך לעבוד |
| Advisors ביצועים | 3 FK בלי אינדקס (`challenges.created_by`, `groups.owner_id`, `players.referred_by`), INFO. זניח בנפח הנוכחי |
| משתמשים אמיתיים | כמעט אין: 45/46 כינויים מתחילים ב־`טסט`. סיכון נמוך ל־migrations, אבל הכלל "לא הרסני" נשאר |

## 4. אבטחה (תקציר, לקראת SECURITY_REVIEW)

| # | ממצא | חומרה | המלצה |
|---|---|---|---|
| S1 | `rr_finish` שומר סטטוס/חודשים/שווי/פסיבי מהלקוח בלי אימות. אפשר לזייף ניצחון בלוח יומי/שבועי/קבוצה | גבוהה (הוגנות) | T-15: replay בשרת מתוך `seed` + `actions` |
| S2 | `rr_checkpoint` מקבל state שרירותי (רק גודל ומונוטוניות) | בינונית | אותו replay. לחלופין לשמור רק `actions` |
| S3 | `rr_begin` מחזיר את ה־seed והמנוע ציבורי. אפשר לסמלץ את כל האתגר מראש ולשחק מושלם | בינונית (מובנה בעיצוב) | לתעד כמגבלה ידועה. פתרון אמיתי = השרת מחזיק את ה־RNG (שינוי ארכיטקטוני, דורש אישור) |
| S4 | `rr_sync_progress` מאמין לכוכבים | נמוכה–בינונית | לגזור כוכבים מתוצאות מאומתות |
| S5 | `rr_register2` + `p_ref` בלי הגבלה → חוות ⚡ | נמוכה | הגבלת קצב |
| S6 | ⚡ ב־localStorage | נמוכה (אין כסף) | מקובל |
| S7 | three.js מ־CDN בלי SRI ובלי CSP | נמוכה | `integrity` על importmap (נתמך בדפדפנים חדשים) או אירוח עצמי |
| S8 | XSS: הרבה `innerHTML` (41 ב־JS), עם `esc()` עקבי בלובי (79 קריאות). שמות קבוצה/כינוי נבדקים בשרת באורך בלבד | נמוכה (לא נמצא חור) | בדיקת fuzz עם `<img onerror>` בכינוי ובשם קבוצה |
| S9 | המפתח `sb_publishable_…` בקוד | אין: מפתח ציבורי לפי תכנון | — |
| S10 | AI | לא רלוונטי כרגע: אין שירות AI | אם יתווסף: proxy בצד שרת, מכסות, סינון prompt injection, בלי מפתח בדפדפן |

## 5. כפילויות וסיכוני עקביות

| # | כפילות / סתירה | איפה | סיכון | המלצה |
|---|---|---|---|---|
| D1 | **מודולי `js/finance/*` המתוכננים (T-07/T-08) מול נוסחאות קיימות במנוע** (`loanPct`, `loanPay`, `creditPay`, `assetCf`, ROI, `hedgeFee`, refi) | `engine.js`, תוכנית TASK_BOARD | גבוה: שני מנועים כלכליים סותרים (נוגד את §11 במפרט) | המודול החדש הוא ספריית נוסחאות טהורה **שהמנוע עובר להשתמש בה** (T-09), והנוסחאות הישנות נמחקות באותו PR. בדיקת "אותה תוצאה" לפני ההחלפה |
| D2 | שתי טבלאות מס: `life.js TAX` מול `real.js TAX_IL`, עם `setTaxTable()` שמשנה מצב גלובלי | `life.js`, `data/real.js`, `engine.js registerRealData` | בינוני: ערכים שונים אם real.js לא נטען, ושינוי באמצע ריצה בבדיקות | מקור אחד (`TAX_IL`). ב־`life.js` רק fallback שנבדק כזהה |
| D3 | שווי נקי/סך נכסים: `engine.netWorthOf` מול `ui.js renderSheet totA`. ENGINE.md (כולל פנסיה) מול הקוד (`netWorthTotal`) | `engine.js:~350`, `ui.js:330`, ENGINE.md v3 | בינוני: הדוח לא מסתכם (QA דיווח על זה ב־v2) | המנוע מחזיר את הסכומים. ה־UI מציג בלבד |
| D4 | חישוב ROI ב־3 מקומות: `engine.js` DESCRIBE.deal, `buyAsset`, `ui.js roiEq()` | — | נמוך–בינוני | `ui.js` משתמש ב־`d.roi` מהמנוע |
| D5 | פורמט כסף: `engine fmt/fmtM/fmtP/sgn` + `ui fmtC/money/N` + `toLocaleString` ב־lobby/main | — | נמוך: `fmtC` בונה על `fmt`, אבל `$` מחושב ב־3 מקומות | `fmtUsd()` במנוע |
| D6 | "אנרגיה" כפולה: ⚡ מטא (`energy.js`, הגבלת זריקות) מול 🔋 אנרגיה בתוך המשחק (`st.life.energy`, שחיקה) | `energy.js`, `life.js`, HUD | בינוני לשחקן (בלבול מושגים) | שמות שונים ב־UI: "⚡ זריקות" מול "🔋 כוח" (או "עייפות") |
| D7 | יומי: `E.dailyConfig` מול `game.day()` בשרת | `engine.js`, SQL | נמוך (קוד מת) | deprecate |
| D8 | תארים: `net.title` מול `titleFor` | `net.js`, `achievements.js` | נמוך (קוד מת) | למחוק |
| D9 | שמירות: `{v:2}` עטיפה מול `st.v=3`. מקומי מול checkpoint בשרת (מתואם ב־`seq`). 10 מפתחות `rr2-*` | `game.js`, `lobby.js` | נמוך–בינוני | לתעד (ARCHITECTURE §5). בדיקת "שמירה ישנה" |
| D10 | שער אושר ★★★: ברירת מחדל 60 קשיחה בלובי | `lobby.js:1201` | נמוך | רק מ־`starThresholds().happy` |
| D11 | נכסי GLB בשורש = עותק של `assets/w1` | `assets/*.glb` | נמוך (13% מגודל assets) | לא להעתיק |
| D12 | RPC ישנים `rr_start`, `rr_create_challenge` | SQL | נמוך | להשאיר עד החלטה, לא למחוק בלי אישור |

## 6. קוד לא פעיל, TODO ופיצ'רים לא גמורים

- אין `TODO/FIXME` בקוד (grep).
- קוד מת: `net.title`, `E.dailyConfig` (רק בבדיקות), `game.week().profession`, `rr_start`, `rr_create_challenge`, `assets/*.glb` בשורש, `legacy/v1.html`.
- לא גמור (v3, 15:10): `tools/sim.mjs` ודוח איזון ל־v3, בדיקת `replay()`, `js/finance/*` (עדיין לא קיים), סטיות חוזה ב־ENGINE.md (`netWorth`, `boardInfo`). (בין 15:03 ל־15:10 נוספו handlers ל־`life/edu/tax/index`, `lifeSummary`, שער אושר, `setPlan/invest/setAutoInvest/replay`.)
- `game.js` משתמש ב־`typeof E.x === 'function'` כמגן לפונקציות v3 שעוד לא קיימות (`setPlan`, `rollCost`, `summaryForServer`). זה מכוון לפיתוח מקבילי. לנקות לפני מיזוג.

## 7. סדר עדיפויות מומלץ

1. **P0** לאמת את המנוע v3 בקנה מידה: `engine.test.mjs 2000` ו־`sim.mjs` → balance-report v3 (הקריטריון ב־T-03: מי שעוקב אחרי הכפתור הבולט בורח ברוב המשחקים, ★★★ ≈10–15%). בלי זה אי אפשר למזג.
2. **P1** להחליט על הגדרות כספיות אחידות (D1–D3): מקור אחד לנוסחאות ולסכומים, והמנוע הוא הבעלים.
3. **P1** אימות תוצאות בשרת (S1/S2, T-15) על בסיס `replay()`.
4. **P1** בדיקות עם תשובה ידועה: תלוש, ריבית דריבית, משכנתא/שפיצר, מס שכירות (ברוטו).
5. **P1** מנטור: רמות ודוגמאות מספריות בתוך המנגנון הקיים.
6. **P2** ביצועים (דחיסת GLB, real.js עצל), נגישות (axe), הגבלת הפניות.
