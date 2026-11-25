# עולמות ומפות — GROUPS

> בקשת הבעלים (2026-11-25): "תחלק את המפות לעולמות — כל עולם 4 עד 5 מפות מקסימום".
> נתיב UI / התקדמות. מקור האמת היחיד: `js/worlds-groups.js`.

## בקצרה (עברית)

- כל שלב במשחק (w1…w25) נקרא עכשיו **מפה**. המפות מחולקות ל־**6 עולמות**:

| # | עולם | המפות (בסדר) | מה לומדים שם |
|---|------|--------------|--------------|
| 1 | הצעדים הראשונים | השכונה · העיר הגדולה · הנמל הגלובלי · עמק העתיד | היסודות: נכס מול התחייבות, ריבית, דולר וסבלנות |
| 2 | עולם העסקים | עיר התיירות · אזור התעשייה · רשתות המסחר · מטרופולין הנדל"ן · מדבר האנרגיה | לנהל עסק: עונות, מכונות, סניפים, בנייה בשלבים ותשתית |
| 3 | הכסף הגדול | מרכז הפיננסים · מגדלי הענן · אצטדיון הכוכבים · ארץ השדות | תיק השקעות, גיוס הון, מכירות פומביות וגידור |
| 4 | הענקים | התאגיד הבינלאומי · גבעת המעבדות · רובע הבנקים · האימפריה | תאגידים: חברות־בנות בחו״ל, פטנטים, בנק וערבויות |
| 5 | השווקים | חוף הסערות · פעמון הבורסה · רחוב הקרנות · בית ההשקעות הפרטי | ביטוח, הנפקה, קרנות ורכישות במינוף |
| 6 | הפסגה | העיר החדשה · בית המסחר העולמי · אוצר המדינה · מגדל העולם | עיר חדשה, מסחר עולמי, תקציב מדינה וקונגלומרט |

- **איך נפתחות מפות:** בקו ישר. מסיימים מפה (יציאה מהמירוץ בכל קצב, ★, או יציאה במצב תרגול) → נפתחת המפה הבאה באותו עולם.
  מסיימים את המפה האחרונה בעולם → נפתחת המפה הראשונה בעולם הבא. מפה שעוד לא נבנתה מסומנת "בקרוב" ולא חוסמת: אם המפה הבאה עוד לא בנויה, נפתחת המפה הבנויה הבאה.
- **אף אחד לא מאבד כלום:** כל מפה שהייתה פתוחה לשחקן לפני השינוי נשארת פתוחה (גם אם בסדר החדש היא "מוקדמת מדי"). w1–w4 לא השתנו, אז שחקנים חיים לא מרגישים הבדל בהתחלה.
  מצב בעלים / "לפתוח הכול" עדיין פותח את כל המפות הבנויות.
- **מה רואים:** במסך הבית המפה מחולקת ל־6 פרקים — לכל עולם: מספר ושם, שורה של מה לומדים בו, "X/Y מפות הושלמו", מצב (פתוח / ✓ הושלם / 🔒 נפתח אחרי … / 🔜 בקרוב), ורשימת המפות שלו.
  במסך הסיום: "למפה הבאה: <שם> ←"; כשעוברים לעולם חדש: "🔓 נפתח עולם חדש: <עולם> — מפה ראשונה: <מפה>". בבחירת דמות ובכרזה במשחק: "מפה N · <שם העולם>".
  בכל מקום שבו "עולם" היה שלב אחד — עכשיו כתוב "מפה" (לובי, סיום, הודעות, טעינה, יעד המפה, לוח המפה, הדרכה). "עולם" נשאר רק ל־6 הקבוצות.

## Technical notes

### One source of truth
- `js/worlds-groups.js` (pure, no imports): `WORLD_GROUPS` (6 × {id g1…g6, n, name, icon, learn, maps}), `ORDER` (the 25 ids in play order),
  `PLANNED` (name / tagline / diff for maps not in `js/worlds/meta.js` yet — meta wins once the engine lane registers a map),
  `groupOf`, `mapNo` (position in its world), `mapIndex` (position in ORDER), `mapLabel` ("מפה 2 · הכסף הגדול"), `nextMap` / `prevMap(id, built)`,
  `crossesWorld`, and `openMaps({finished, built, kept})` — the rule itself.
- The file lives outside `js/worlds/` on purpose (UI lane file; `js/worlds/**` is the engine lane).

### The rule (`js/progress.js`)
- `built(id)` = a playable meta entry (`playableMeta()`); a planned map is never open and is skipped by `nextMap`.
- `openMaps`: walk ORDER over built maps; the first is open; a map is open if it is in `kept`, or the built map before it is open **and** finished
  (`worldFinished`: ★ — also banked from a daily —, a recorded best = an escape at any speed, or `cleared` = a practice escape).
  A finished map that is not open itself (daily-banked stars) opens nothing until the chain reaches it — the same semantics as before.
- `isUnlocked(id)`: admin / `unlockAll` → every built map; an id in ORDER → `openMaps`; a playable meta id that no world lists → the old
  `isUnlockedBy` (defensive fallback; `tests/groups.test.mjs` asserts there is none).
- **No re-lock (migration, once):** a stored save without `groupsV ≥ 1` gets `P.kept` = every map its OLD `meta.unlock` graph had open (finished
  maps counted as ★, exactly as the old `isUnlocked` saw them), then `groupsV = 1`. Runs in `load()` and `_reset()`. After that the old graph
  opens nothing new (a `groupsV` save follows the linear rule only). `kept` is local only (never synced — the server profile has no unlock field).
- Results: `recordGame` / `recordLearnGame` add `unlockedGroup` (the new world's id when the newly opened map is in another world; `null` inside a
  world and on duplicates). `unlockedWorlds()` is in ORDER.
- New API: `worldMap()` (ORDER, planned maps included, each with `group`, `mapNo`, `order` = position in ORDER, `metaOrder`, `finished`, `prev`,
  `lockText` = "לצאת מ<previous built map>" or "תיפתח אחרי <previous map>, כשתהיה מוכנה"), `mapGroups()` (done / total / built / open / soon),
  `nextMapOf`, `prevMapOf`, `newWorldOf(from, to)`, `mapName`. `nextGoal()` names the next map, or "עולם חדש: <world>" when it crosses.

### UI
- `js/lobby.js`: the map is `div.map-grid.map-worlds` → 6 × `section.mw[aria-labelledby]` (h3 "עולם N <name>", `.mw-learn`, `.mw-count`
  "X/Y מפות הושלמו", `.mw-st` state) → `ol.mw-maps` → `li` → the existing `.map-card` (button) / `.map-card.is-soon` (group, not a button).
  The card number is the map's number inside its world. Fork chips ("🔀 מסלול לבחירה") are gone (no forks any more). End screen: next = next
  built map; news card `.end-unlock.is-world` when crossing; buttons "למפה הבאה: <name> ←". Picker / locked / loading / soon views get a
  `.wv-kicker` "מפה N · <world>" above the unchanged `h1`. The P0b repair toast uses the same words.
- `js/ui.js`: the in-game banner `<small>` is `mapLabel`; the first-entry line is "מפה חדשה נפתחה", or "עולם חדש: <world>" on a world's first
  map; "יעד המפה" / "לוח המפה". `js/hudgoal.js`, `js/onboard.js`, `js/render/worldview1216.js`, `js/game.js`, `js/net.js`: "עולם" → "מפה" where it
  means one level. `css/lobby.css`: `.mw*`, `.wv-kicker`, the trail wraps under the heading. `index.html`: modulepreload for the new module.

### Not changed here — for the engine lane to align later
- `js/worlds/meta.js` `unlock` (the tiered DAG) and `tier` are untouched; the client no longer reads `unlock` for progression. Still read by
  `tools/validate-worlds.mjs` (V-tier / reachability), `tests/worlds_config.test.mjs`, `tests/w9…w18.test.mjs` (`m.unlock` + `isUnlockedBy`) and
  `unlockText`. Suggested alignment: `unlock` of each map = `[{any:[prevMap(id, built)], count:1, stars:1}]` from `js/worlds-groups.js`
  (`tier` = world number or ORDER position), a validator check that every playable meta id is in `ORDER` and that each group has 4–5 maps,
  and the CATALOG-25 tables / dependency graph rewritten as "map N of world K". Until then the two agree on w1–w5 only.
- Engine-side wording still saying "עולם" for one level: `js/systems/mentor.js` ("טוב לעולם הראשון"). Also `js/main.js` (the no-lobby
  fallback picker: "בחר עולם", "בחירת עולם") is in no lane's list — left as is.
- Planned maps w19–w25 (and w18 until it is committed) take their names / lines from `PLANNED`; when meta gains an entry, meta wins.
