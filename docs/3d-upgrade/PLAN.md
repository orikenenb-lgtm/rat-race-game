# תוכנית שדרוג התלת־ממד — מנהל פרויקט

ענף: `feature/3d-world-upgrade` (מ־`main` = v4 שבאוויר). בריף: `BRIEF.md`. מחקר: `research/A2-state-saves-ui.md`, `research/B1-3d-engine.md`, `research/A3-baseline.md`.

## החלטות ארכיטקטורה (מנהל ראשי)
1. **לא מחליפים מנוע.** three.js r170 + `js/scene.js` + `js/render/*` נשארים. הבעיה שאורי ראה היא דפדפן בלי WebGL (נמדד), לא באג.
2. **שום שינוי ב־`js/engine.js`, `js/worlds/*`, `js/systems/*`, `js/finance/*`, `js/life.js`, `js/rng.js`, `js/data/*`, `js/practice.js`, `js/history.js`, `js/achievements.js`.** הקבצים האלה נעולים ב־`verify-result/engine_pin.js`. כל שינוי בהם שובר אימות של משחקים מדורגים עד פריסה מחדש של השרת. כל תוכן תצוגה (שמות קצרים למשבצות, תיאורים, סגנון עולם) נכנס לצד הרינדור (`js/render/*`). בדיקה חדשה מוודאת ש־`build-edge --check` עובר.
3. **אין נתוני תצוגה בשמירה.** העדפות (מצלמה, איכות, 2D/3D) → `rr2-settings` בדפוס read-merge-write. מצב העיר נגזר תמיד מ־`E.cityModels(S)`. אין שינוי ב־`SAVE_VERSION` / `WRAP_V`.
4. **בלי שינוי כלכלה, ניקוד, איזון או החלטות המנהל של 23/11** (אין סכומים לכל אפשרות במתקדם/מומחה).
5. שכבת התצוגה קוראת מצב, מציגה ושולחת פעולות דרך `game.js`; לא מחזיקה עותק של כסף או בעלות.

## גלים ובעלות על קבצים
| גל | צוות | משימה | קבצים בבעלות | פערים |
|---|---|---|---|---|
| 1 | ג — לוח, עולם ועיר (+ מצלמה ותור) | משבצות קריאות ולחיצות, סימון משבצת נוכחית ויעד, מצב עיר ריק מכוון, הפרדת תפאורה מנכסים, סנכרון עיר אחרי כל החלטה, watchdog לאנימציות, מצלמה: "מבט ראשי" ובלי איפוס סיבוב | `js/scene.js`, `js/render/{board2d,kit3d,vocab,null,flatten,assetinfo}.js`, `js/render/tiles.js` (חדש), `js/game.js`, `js/ui.js`, `css/game-play.css` | B1 G5–G10, A2 G-03, G-05, G-08 |
| 1 (worktree נפרד) | ב — תאימות ו־fallback | הודעות לפי סיבה אמיתית, בדיקת WebGL2, פרטים טכניים, אובדן context, אירוח עצמי של three ופונטים + ייחוס | `js/render/{select,overlay,quality}.js`, `index.html`, `vendor/`, `ATTRIBUTION.md`, `css/stability.css`, `tests/render_api.test.mjs`, קטע ההודעות ב־`js/game.js` בלבד | B1 G1–G4, G11–G13, A2 G-11 |
| 2 | ד — HUD, עברית ונייד | פאנל "יעד העולם" (מה חסר לניצחון), נכסים/חובות, חוב חדש, safe areas, 44px, הכרזת נחיתה | `js/ui.js`, `css/*`, `js/game.js` (HUD) | A2 G-04, G-07, G-10, G-12 |
| 3 | ו — ביצועים | מדידה לפני/אחרי, רמות איכות, FPS | probes, `js/render/quality.js` | §17 |
| 4 | ז — אינטגרציה וביקורת | ביקורת עצמאית, מסעות שחקן, רגרסיה מלאה, דוח | — | §22–24 |

כל משימה: עובד מימוש, ואחריו עובד ביקורת ובדיקות עצמאי שלא כתב את הקוד. המחקר (שלושה עובדים) כבר רץ.

## תנאי קבלה משותפים
- כל חבילות ה־tier 0/1 עוברות; `build-edge --check` עובר (המנוע לא השתנה).
- game_e2e (מחשב, טלפון, 2D), stability, t5_render, t6_e2e, lobby_real, a11y --strict עוברים.
- צילומי מסך מחשב וטלפון לפני/אחרי.
- אין שגיאות console חדשות. אין שינוי במספרים של המשחק.
