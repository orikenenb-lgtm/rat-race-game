# ארגון הסוכנים — מירוץ העכברים v3

המסמך מתאר את הסוכנים שהופעלו **בפועל**. הסביבה תומכת בסוכני משנה מסוג general-purpose שרצים ברקע, וכל אחד מהם מחזיק את ההקשר שלו לאורך כל הפרויקט.
לא הופעלו 30 סוכנים נפרדים. רוב תפקידי הניהול מרוכזים אצל המתזמר, וכל ראש צוות מכסה כמה תפקידי ביצוע. הטבלה מפרטת את המיפוי לתפקידים שבמפרט (Agent 01–30).

| סוכן בפועל | תפקידים מהמפרט שהוא מכסה | בעלות על קבצים | סטטוס |
|---|---|---|---|
| **מתזמר** (הסשן הראשי) | 01 Chief Orchestrator, 02 Program Director, 07 Infrastructure PM, 11 Backend Lead, 24 Backend, 25 Database, 13 QA & Release Lead | `js/net.js`, `js/bus.js`, Supabase (סכמה `game`, פונקציות `rr_*`), git, deploy, `docs/AGENT_ORGANIZATION.md`, `docs/TASK_BOARD.md`, `docs/CHANGELOG.md`, `docs/RELEASE_READINESS.md` | פעיל |
| **ראש המנוע** | 04 Gameplay PM, 08 Gameplay Lead, 15 Game Mechanics, 16 Game Economy, 09 Financial Simulation Lead (אינטגרציה) | `js/engine.js`, `js/worlds/*`, `js/achievements.js`, `js/life.js`, `js/history.js`, `tools/sim.mjs`, `tests/engine.test.mjs`, `ENGINE.md` | פעיל (v1 → v2.1 → v3) |
| **מהנדס בנק והשקעות** | 18 Banking & Credit, 19 Investment Simulation | `js/finance/bank.js`, `js/finance/invest.js`, `tests/finance.test.mjs`, סעיפי בנק/השקעות ב-`docs/FINANCIAL_ENGINE.md` | פעיל |
| **מהנדס עסקים** | 20 Real Estate & Business | `js/finance/business.js`, `tests/business.test.mjs`, סעיף העסקים ב-`docs/FINANCIAL_ENGINE.md` | פעיל |
| **חוקר נתונים** | 17 Financial Education Specialist (נתונים ומקורות) | `js/data/real.js`, `docs-v3/sources.md` | הושלם |
| **ראש ממשק המשחק** | 06 Product & UX PM (במשחק), 10 Frontend Lead, 21 Frontend, 22 UI/UX, 30 Performance (רינדור) | `index.html`, `css/game.css`, `js/main.js`, `js/game.js`, `js/scene.js`, `js/ui.js`, `js/audio.js` | פעיל |
| **ראש הלובי והמטא** | 06 (לובי), 21, 22, 26 Multiplayer (קבוצות ואתגרים אסינכרוניים), 12 AI & Education Lead (ספריית שיעורים) | `js/lobby.js`, `js/progress.js`, `css/lobby.css`, `js/energy.js`, `js/library.js` | פעיל |
| **ראש תלת־ממד** | 23 3D & Animation | `assets/**`, `blender/*` | פעיל |
| **מבקר הקוד והאדריכל** | 14 Existing Code Auditor, 03 Chief Architect (תיעוד) | `docs/PROJECT_AUDIT.md`, `FEATURE_MATRIX.md`, `ARCHITECTURE.md`, `TOOLS_AND_SKILLS_AUDIT.md` | פעיל, קריאה בלבד בקוד |
| **בודק QA בפרסונות** (גל קודם) | 29 Test Automation (חלקי), חוויית שחקן | `/home/claude/qa/*` (`docs/QA-REPORT.md`) | הושלם ב-v2 (יופעל שוב בגל הבדיקות) |

**מתוכנן לגלים הבאים:**
- **Security Engineer (28):** אימות תוצאות בשרת. Edge Function תשחזר את המשחק המדורג מתוך יומן הפעולות וה-seed. בנוסף `SECURITY_REVIEW.md`.
- **Financial Education reviewer (17):** סקירת דיוק של כל הטקסטים הפיננסיים.
- **Test Automation (29):** אנשי QA בפרסונות, סוויטת רגרסיה מלאה ו-`TEST_REPORT.md`.
- **Performance (30):** `PERFORMANCE_REPORT.md`.
- **AI Mentor (27):** מנטור AI אמיתי דורש שירות בתשלום (Vercel AI Gateway או API של מודל), ולכן **ממתין לאישור הבעלים**. עד אז המנטור מבוסס חוקים.
- **Multiplayer (26):** חדרים בזמן אמת עם טיימר תור. אין כרגע מערכת קיימת, יש רק קבוצות ואתגרים אסינכרוניים. מערכת כזו תיכנן כשלב נפרד אחרי v3.

**כללי עבודה:**
- **בעלות:** לכל קובץ יש בעלים אחד. סוכן לא עורך קבצים של סוכן אחר.
- **חוזים:** ההסכמות בין הסוכנים כתובות ב-`ENGINE.md` (בסעיף "Changes v3") וב-`docs-v3/DESIGN-v3.md`.
- **בדיקות ושמות:** כל סוכן מריץ את הבדיקות שלו לפני שהוא מדווח. בשרת החי משתמשים רק בכינויים שמתחילים ב-`טסט`.
- **git ופריסה:** רק המתזמר עובד עם git. העבודה נעשית בענף `feature/financial-game-master-upgrade`. **אין מיזוג ל-main ואין פריסה לאתר החי בלי אישור מפורש של אורי.**
