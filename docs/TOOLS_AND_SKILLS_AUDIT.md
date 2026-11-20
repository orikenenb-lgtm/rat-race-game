# TOOLS_AND_SKILLS_AUDIT — כלים, סקילים וחיבורים

> חוק ברזל 13: לא טוענים שכלי הופעל אם לא הופעל. לכן כל שורה מסומנת לפי מקור הידיעה:
> **[אומת]** = המבקר הריץ או בדק בעצמו בסשן הזה (2026-11-20). **[ראיה]** = יש ראיה בקבצים, אבל ההפעלה עצמה הייתה בסשן אחר. **[דיווח]** = לפי דיווח המתזמר בלבד, בלי ראיה בקבצים.

## 1. כלים שהופעלו בפרויקט עד עכשיו

| כלי | למה | מה הופעל בפועל | מקור |
|---|---|---|---|
| **Blender 5.2 CLI על המחשב של אורי** (דרך Desktop Commander) | מודלי v1 ו־w1 | `blender -b --factory-startup --python build_assets.py` (כותרת `blender/build_w1.py`), `blender/assets_w1.blend` ב־git | [ראיה] + [דיווח] על הגרסה 5.2 ועל Desktop Commander |
| **Blender bpy 5.3 בקונטיינר** | מודלי w2–w4, כלי משחק, `life/`, `history/`, יד וקוביות, תמונות כרטיס | `python3 build_life.py` ועוד (`blender/build_*.py`, `rr_lib.py`, `report_*.json`, `preview_*.png`). `import bpy` → `5.3.0` | [אומת] זמינות + [ראיה] |
| **Supabase MCP** | סכמה `game`, RPC, migrations, advisors | 6 migrations (`game_schema` … `v3_energy_gifts_referrals_feed`). בסשן הזה המבקר הריץ `list_tables`, `list_migrations`, `execute_sql` (SELECT בלבד) ו־`get_advisors` (security, performance) | [אומת] |
| **Supabase (שירות)** | backend: זהות, קבוצות, לוחות, checkpoints | פרויקט `xvqaxphyfqdzkddmoosu`. לפי זיכרון המשתמש: פרויקט ייעודי בתשלום (~$10 לחודש) | [אומת] פעיל |
| **GitHub** | קוד וענפים | בהתחלה `gh` על המחשב, אחר כך repo שצורף לסשן ו־`git push`. Remote `orikenenb-lgtm/rat-race-game`, ענף `feature/financial-game-master-upgrade` קיים. `gh` 2.89 בקונטיינר. ה־proxy חוסם את `GET /repos/.../pages` (403) | [אומת] repo וענף + [דיווח] על הזרימה |
| **GitHub Pages** | אירוח | `https://orikenenb-lgtm.github.io/rat-race-game/` מחזיר 200 ומגיש v2 | [אומת] |
| **Playwright (Python 1.63) + Chromium עם SwiftShader** | E2E של המשחק והלובי, צילומי מסך מחשב/טלפון | `tests/game_e2e.py`, `lobby_*.py` (דגלי `--use-angle=swiftshader`), עותקי בדיקה עם stubs (`make_testcopy.sh`). QA בפרסונות ב־`/home/claude/qa/tools/*.mjs`, `back.py` | [אומת] התקנה + [ראיה]. המבקר **לא** הריץ E2E (לא לשבש עבודה מקבילה ולא לכתוב לשרת החי) |
| **Node 22** | בדיקות יחידה, סימולציית איזון | המבקר הריץ: `engine.test.mjs` (v2 30/30, v3 19/30), `progress.test.mjs` (31/31), `energy.test.mjs` (26/26). `tools/sim.mjs` → `balance-report.md` (v2.1) | [אומת] |
| **WebSearch / WebFetch + curl** | נתונים אמיתיים ומקורות מס | FRED, Yahoo, CBS API, BoI SDMX, Kol-Zchut, Bizportal, BTL (`docs-v3/sources.md`). סקריפטים ב־`/tmp/rrbuild/{build,gen,validate}.mjs` | [ראיה]. המבקר הריץ רק curl לאתר החי |
| **claude-artifacts publisher** | v1 (קובץ HTML יחיד) | `legacy/v1.html` נשמר. הפרסום עצמו לא נראה בקבצים | [דיווח] |
| **סוכני משנה (general-purpose)** | ראשי צוותים: מנוע, ממשק, לובי, תלת־ממד, נתונים, בנק, עסקים, מבקר, QA | ראו `docs/AGENT_ORGANIZATION.md`. **לא 30 סוכנים**. כל סוכן מכסה כמה תפקידים | [ראיה] |
| **memory (קריאה)** | הקשר על הבעלים והפרויקט | המבקר קרא את `/areas/rat-race-game.md` | [אומת] |

**לא בשימוש, למרות שהם זמינים:**

| כלי | למה לא |
|---|---|
| **Vercel MCP** | זמין, אבל חשבון Vercel מקושר לחשבון GitHub אחר. האירוח הוא GitHub Pages ולא מחליפים (חוק 12). [דיווח] |
| Sentry, n8n, Stytch, Inkbox | מופיעים רק כ־`authenticate` (לא מחוברים) |

## 2. מה עוד זמין ושווה לשקול

הערכה: **כדאי עכשיו** · **אחר כך** · **לא**. 💰 = עלות, דורש אישור אורי (חוק 11).

| כלי / סקיל | מה הוא נותן לפרויקט | עלות | המלצה |
|---|---|---|---|
| **Supabase Edge Functions** (`deploy_edge_function` ב־MCP) | אימות תוצאות בשרת: מריצים את `engine.replay()` (אותו קוד ב־Deno) | כלול בתוכנית Supabase הקיימת (לבדוק מכסת קריאות) | **כדאי עכשיו** (T-15). פריסה לפרודקשן = באישור המתזמר |
| Supabase `get_advisors`, `list_migrations`, `search_docs` | בקרה אחרי כל migration | — | **כדאי עכשיו**, אחרי כל DDL |
| Supabase branching (`create_branch`) | לבדוק migrations על עותק לפני פרודקשן | 💰 לרוב בתשלום לפי שעות | **אחר כך**, רק אם T-15 משנה סכמה |
| **Vercel AI Gateway** (`list_ai_gateway_models`, budgets) | מנטור AI אמיתי (T-18): הסבר מותאם לרמה, ניתוח החלטה בשפה חופשית | 💰 תשלום לפי טוקנים, וחשבון Vercel במקום אחר | **אחר כך, באישור**. חלופה באותה עלות: Edge Function ב־Supabase שקוראת ל־API של מודל, עם מפתח בסוד השרת, מכסה למשתמש ו־fallback לחוקים |
| **axe-core** (npm, בתוך Playwright) | בדיקות נגישות אוטומטיות (§9, §14.9) | חינם | **כדאי עכשיו** (גל QA) |
| **Lighthouse** (`npx lighthouse` עם Chromium) | זמן טעינה, גודל, בקשות (§13) | חינם | **כדאי עכשיו** (PERFORMANCE_REPORT). `npx` זמין, Lighthouse לא הותקן |
| **gltf-transform / Meshopt** (npm) או Draco ב־Blender export | דחיסת GLB (life 3.1MB, עולם 1.1–1.6MB) | חינם | **כדאי** (ראש תלת־ממד). דורש `EXT_meshopt_compression` + `MeshoptDecoder` ב־scene.js (שינוי קטן) |
| GitHub Actions (CI) | הרצת `node tests/*.test.mjs` על כל push | חינם ל־repo ציבורי | **כדאי** אחרי המיזוג. ה־proxy חוסם חלק מ־API, אז ייתכן שאורי יצטרך להפעיל דרך `gh` במחשב שלו |
| Three.js 3D Viewer MCP (`show_threejs_scene`) | תצוגה מקדימה אינטראקטיבית של מודל לאורי | חינם | **אחר כך** (נוח לאישור מודלים) |
| remote-browser MCP / Claude in Chrome | בדיקה ידנית של האתר החי | חינם | **לא** צריך. Playwright מכסה |
| remote-devices (`device_bash` וכו') | הרצה על המחשב של אורי (Blender 5.2, git) | חינם | **רק לפי צורך**. היום bpy בקונטיינר מספיק |
| **Figma** (skills `figma:*`) | מוקאפים ושפה עיצובית | חשבון Figma (לא ידוע אם יש) | **לא עכשיו**. אין קובץ Figma לפרויקט, והעיצוב הקיים עובד (QA: "Works great — don't break"). לשקול רק לרי־דיזיין גדול |
| Skills: `engineering:architecture`, `engineering:testing-strategy`, `engineering:code-review`, `design:accessibility-review`, `design:ux-copy` | צ'קליסטים מובנים לגלים הבאים | חינם | **כדאי** לסוכני QA/Security/Fin-Ed |
| `anthropic-skills:frontend-design`, `dataviz` | ויזואליזציות במשחק (גרף ריבית דריבית, תזרים) | חינם | **אחר כך** (ממשק) |
| claude-artifacts | פרסום דוחות (אודיט, release readiness) כעמוד פרטי | חינם | **אופציונלי** |
| Canva / Adobe | חומרי שיווק ושיתוף | 💰 חשבונות | **לא** (מחוץ לתחום) |
| Lovable / base44 / Wix | בוני אפליקציות | 💰 | **לא**: ישכפלו stack קיים (חוק 2 ו־12) |
| Era Context, Gmail, Calendar, Drive | נתוני כסף ומיילים אמיתיים של המשתמש | — | **אסור**: המפרט אוסר לחבר חשבונות פיננסיים אמיתיים |

## 3. כללים לשימוש בכלים (לכל הסוכנים)

1. **Supabase:** רק המתזמר מריץ DDL/DML ו־`apply_migration`. אחרים: SELECT ו־advisors בלבד. migrations תוספתיים בלבד, בלי DROP, בלי שינוי חתימות של `rr_*` ש־v2 החי קורא להן (`rr_register`, `rr_begin`, `rr_checkpoint`, `rr_finish`, `rr_sync_progress2`, `rr_daily`, `rr_weekly`, קבוצות).
2. **בדיקות מול השרת החי:** רק כינויים שמתחילים ב־`טסט` (כבר 45/46 שחקנים). לפני שחרור לשקול ניקוי באישור, או סינון `טסט%` מהלוחות.
3. **Git:** רק המתזמר. ענף `feature/financial-game-master-upgrade`. אין push ל־main ואין deploy בלי אישור אורי.
4. **סודות:** בקוד רק המפתח הציבורי `sb_publishable_…`. מפתח AI עתידי ייכנס רק כסוד של Edge Function.
5. **שירותים בתשלום:** AI Gateway / API מודל, Supabase branching, Figma או כל שירות חדש — רק באישור.
