// js/systems/chains.js — T3 "שרשראות סיפור": the six life chains as pure data (docs/next-level/specs/T3-stories-business.md §4–§5).
// No imports from engine.js. Texts are templates with {vars} filled by the engine's storyVars() from PUBLIC state only
// (never a seal, a deck, next year's inflation or any future draw — tests/t3.test.mjs U12 greps the keys against VAR_ALLOW).
//
// Step: { title, text, hint?, remember?, onCard? (shown as the tile-L card itself), options:[…] }
// Option: { id, label, dq:'personal'|'mixed'|'financial'|'none', fx?:{…}, hook?, odds?:{p, use:'entry'|'a'|'b', text, bad?},
//           next?:[{step|end|resolve, in, if?:'win'|'lose', news?}], path?, memo?, when?, default?, guide?, lesson?:[ids] }
//   fx (money × S = the base net salary unless the key ends in Abs): cash · line {amt, months, label, tag} (amt > 0 = a cost) ·
//   rentPct · carCut · carLinePct · happiness · energy · glow · grossMult · grossTemp {mult, months} · workLoad · planLock
//   {plan, months} · jobless · sideReport · study · set {flag: value}
//   hook = an engine-side effect for computed amounts (tests check every hook exists in the engine).
//   odds: the outcome is seal[use] < p → 'win' (p is the chance of the event the text describes; `bad: true` = that event is the bad one).
//   oddsS: {hit, miss} × S — the money of each branch (e.g. the announced follow-up repair), for the card totals and the evaluator.
//   default: exactly one per inbox step (applied when the item expires); guide: the director's guide-level pick on car/transport steps.

export const NAMES = { friend: ['יוסי', 'מיכל'], manager: 'רונית', garage: 'אבי' };

export const CHAINS = {
  /* ------------------------------------------------------------------ 5.1 car, repairs and transport */
  car: {
    id: 'car', title: 'רכב ותחבורה', worlds: ['w1', 'w2', 'w3', 'w4', 'h'], cooldown: 24, maxRuns: 2, entry: { card: 'car' },
    lessons: ['car_cost', 'total_cost'],
    steps: {
      s1: { title: 'הרכב התקלקל', onCard: true,
        text: 'אבי מהמוסך: תיבת הילוכים, {fix}. אפשר לתקן, לעבור לליסינג — או לוותר על רכב.',
        hint: 'במשחק: ברכב בגיל הזה, 1 מתוך 2 — עוד תקלה גדולה בשנה הקרובה.',
        options: [
          { id: 'fix', label: 'לתקן', dq: 'mixed', guide: true, fx: { cash: -0.4 }, path: 'fix', hook: 'carPaid',
            odds: { p: 0.5, use: 'entry', bad: true, text: 'במשחק: 1 מתוך 2 — עוד תקלה בשנה הקרובה' }, oddsS: { hit: -0.25, miss: 0 },
            next: [{ step: 's2fix', in: 8, if: 'win' }, { end: true, in: 12, if: 'lose', news: 'carOk' }], memo: 'תיקנת את הרכב ב־{paidNow}', lesson: ['car_cost'] },
          { id: 'new', label: 'רכב חדש בליסינג', dq: 'mixed', fx: { cash: -0.3, line: { amt: 0.12, months: 36, label: 'ליסינג רכב חדש', tag: 'car' }, glow: 6 }, path: 'lease', hook: 'leaseStart',
            next: [{ step: 's2lease', in: 12 }], memo: 'לקחת ליסינג ב־{leaseNew} בחודש', lesson: ['car_cost'] },
          { id: 'bus', label: 'אוטובוס ואופניים', dq: 'mixed', fx: { energy: -6, happiness: -3, carCut: 0.6, set: { noCar: true, commute: -1 } }, path: 'bus', hook: 'busStart',
            next: [{ step: 's2bus', in: 4 }], memo: 'ויתרת על הרכב', lesson: ['car_cost'] },
        ] },
      s2fix: { title: 'שוב במוסך', remember: 'זוכר? לפני {ago} חודשים תיקנת ב־{paid}.',
        text: 'עכשיו בלמים ומצמד: עוד {fix2}. בסך הכול הרכב עלה לך {spent} מאז.',
        options: [
          { id: 'fixAgain', label: 'לתקן שוב', dq: 'financial', default: true, guide: true, fx: { cash: -0.25 }, hook: 'carPaid', next: [{ end: true, in: 0 }], memo: 'תיקנת שוב ב־{paidNow}', lesson: ['total_cost'] },
          { id: 'swap', label: 'למכור ולקנות יד שנייה צעירה יותר', dq: 'financial', fx: { cash: -0.3, carLinePct: -20 }, next: [{ end: true, in: 0 }], memo: 'החלפת לרכב צעיר יותר', lesson: ['total_cost'] },
          { id: 'drop', label: 'למכור ולוותר על רכב', dq: 'financial', fx: { cash: 0.4, carCut: 0.6, set: { noCar: true, commute: -1 } }, hook: 'busStart', next: [{ end: true, in: 0 }], memo: 'מכרת את הרכב', lesson: ['total_cost'] },
        ] },
      s2lease: { title: 'הליסינג התייקר', remember: 'לפני שנה לקחת ליסינג ב־{lease} בחודש.',
        text: 'חברת הליסינג מעדכנת: הביטוח והטיפולים עלו — עוד {extra} בחודש.',
        options: [
          { id: 'keep', label: 'להמשיך כרגיל', dq: 'financial', default: true, hook: 'leaseKeep', next: [{ step: 's3leaseEnd', at: 'leaseEnd' }], lesson: ['total_cost'] },
          { id: 'exit', label: 'לצאת מהחוזה מוקדם', dq: 'financial', hook: 'leaseExit', next: [{ end: true, in: 0 }], memo: 'יצאת מהליסינג מוקדם', lesson: ['total_cost'] },
          { id: 'downsize', label: 'להחליף לרכב קטן יותר', dq: 'financial', hook: 'leaseDown', next: [{ step: 's3leaseEnd', at: 'leaseEnd' }], memo: 'עברת לרכב קטן יותר', lesson: ['total_cost'] },
        ] },
      s3leaseEnd: { title: 'הליסינג נגמר', remember: 'שלוש שנים עם הרכב מהליסינג.',
        text: 'החוזה נגמר. מחזירים את הרכב — ומה עכשיו?',
        options: [
          { id: 'return', label: 'להחזיר ולקנות יד שנייה', dq: 'mixed', default: true, guide: true, fx: { cash: -1.2 }, hook: 'leaseReturn', next: [{ end: true, in: 0 }] },
          { id: 'buyout', label: 'לקנות את הרכב במחיר הסופי', dq: 'mixed', fx: { cash: -1 }, hook: 'leaseBuyout', next: [{ end: true, in: 0 }] },
          { id: 'noCar', label: 'להחזיר ולהסתדר בלי רכב', dq: 'mixed', fx: { energy: -6, happiness: -3, set: { noCar: true, commute: -1 } }, hook: 'leaseNoCar', next: [{ end: true, in: 0 }] },
        ] },
      s2bus: { title: 'הבקרים ארוכים', remember: 'כבר {ago} חודשים בלי רכב — חסכת {saved}.',
        text: 'אבל כל בוקר מתחיל ב־40 דקות באוטובוס. אפשר לשפר את הדרך.',
        options: [
          { id: 'ebike', label: 'אופניים חשמליים', dq: 'mixed', fx: { cash: -0.25, energy: 4, set: { commute: 0 } }, next: [{ end: true, in: 0 }], memo: 'קנית אופניים חשמליים' },
          { id: 'share', label: 'מנוי לשיתוף רכבים', dq: 'mixed', fx: { line: { amt: 0.04, months: 0, label: 'שיתוף רכב', tag: 'transport' }, happiness: 2, set: { commute: 0, carShare: true } }, next: [{ end: true, in: 0 }], memo: 'נרשמת לשיתוף רכבים' },
          { id: 'stay', label: 'ככה זה טוב לי', dq: 'mixed', default: true, guide: true, next: [{ end: true, in: 0 }] },
        ] },
      carBack: { title: 'לחזור לרכב?', onCard: true, remember: 'לפני {ago} חודשים ויתרת על הרכב וחסכת מאז {saved}.',
        text: 'עבודה חדשה, ומישהו מציע רכב יד שנייה במצב טוב.',
        options: [
          { id: 'buy', label: 'לקנות יד שנייה', dq: 'mixed', fx: { cash: -1.5, line: { amt: 0.1, months: 0, label: 'רכב', tag: 'car' }, set: { noCar: false, commute: 0 } }, next: [{ end: true, in: 0 }], memo: 'חזרת לרכב' },
          { id: 'no', label: 'ממשיכים בלי', dq: 'mixed', guide: true, fx: { happiness: 1 }, next: [{ end: true, in: 0 }] },
        ] },
    },
  },

  /* ------------------------------------------------------------------ 5.2 home and cost of living */
  move: {
    id: 'move', title: 'דירה ויוקר מחיה', worlds: ['w1', 'w2', 'w3', 'w4', 'h'], cooldown: 24, maxRuns: 2, entry: { card: 'moving' },
    lessons: ['inflation', 'negotiation', 'lifestyle_creep', 'housing_share'],
    steps: {
      m1: { title: 'החוזה נגמר', onCard: true,
        text: 'בעל הבית רוצה {raise} יותר בחודש. השכירות היום {rent} — {share}% מהנטו שלך.',
        hint: 'כלל אצבע, לא חוק: דיור עד בערך שליש מהנטו.',
        options: [
          { id: 'bigger', label: 'דירה גדולה ומרווחת', dq: 'personal', fx: { cash: -0.3, rentAdd: 0.1, happiness: 5 }, path: 'bigger', next: [{ step: 'm2renew', at: 'renewal' }], memo: 'עברת לדירה גדולה יותר', lesson: ['lifestyle_creep'] },
          { id: 'stay', label: 'נשארים ומקבלים העלאה קטנה', dq: 'personal', fx: { rentAdd: 0.03 }, path: 'stay', next: [{ step: 'm2renew', at: 'renewal' }], memo: 'נשארת וקיבלת העלאה קטנה' },
          { id: 'smaller', label: 'דירה קטנה וזולה', dq: 'personal', fx: { cash: -0.2, rentAdd: -0.08, happiness: -4 }, path: 'smaller', next: [{ step: 'm2renew', at: 'renewal' }], memo: 'עברת לדירה קטנה יותר' },
          { id: 'periphery', label: 'לעבור לפריפריה', dq: 'personal', fx: { cash: -0.25, rentPct: -25, set: { area: 'periphery', commute: -3 } }, path: 'periphery', next: [{ step: 'm3commute', in: 3 }], memo: 'עברת לפריפריה' },
        ] },
      m2renew: { title: 'חידוש חוזה', remember: '{rememberMove}',
        text: 'בעל הבית מבקש {raisePct}% יותר (אינפלציה בשנה שעברה: {inflLast}%) — עוד {raise} בחודש.',
        hint: 'השכירות כבר {share}% מהנטו. כלל אצבע: עד שליש.',
        options: [
          { id: 'negotiate', label: 'להתמקח', dq: 'mixed', hook: 'renewNegotiate', odds: { p: 0.55, use: 'a', text: 'במשחק: בערך 1 מכל 2 בעלי בית מסכימים לחצי' }, next: [{ end: true, in: 0 }], lesson: ['negotiation'] },
          { id: 'accept', label: 'לקבל את ההעלאה', dq: 'mixed', default: true, hook: 'renewAccept', next: [{ end: true, in: 0 }], lesson: ['inflation'] },
          { id: 'roommates', label: 'לעבור עם שותפים', dq: 'personal', when: 'single', fx: { cash: -0.1, rentPct: -35, happiness: -4 }, next: [{ end: true, in: 0 }], lesson: ['housing_share'] },
          { id: 'smaller', label: 'לעבור לדירה קטנה יותר', dq: 'personal', fx: { cash: -0.2, rentPct: -10, happiness: -3 }, next: [{ end: true, in: 0 }], lesson: ['housing_share'] },
        ] },
      m3commute: { title: 'הדרך לעבודה', remember: 'לפני 3 חודשים עברת לפריפריה וחסכת {saved} בשכירות.',
        text: 'עכשיו שעה וחצי לכל כיוון. איך נוסעים?',
        options: [
          { id: 'train', label: 'רכבת', dq: 'mixed', default: true, guide: true, fx: { line: { amt: 0.03, months: 0, label: 'רכבת', tag: 'transport' }, set: { commute: -2 } }, next: [{ step: 'm2renew', at: 'renewal' }] },
          { id: 'car', label: 'לנסוע ברכב', dq: 'mixed', hook: 'commuteCar', next: [{ step: 'm2renew', at: 'renewal' }] },
          { id: 'hybrid', label: 'יומיים בשבוע מהבית', dq: 'mixed', fx: { grossMult: 0.95, set: { commute: -1 } }, note: 'במשחק המעסיק מסכים; במציאות זה תלוי בו.', next: [{ step: 'm2renew', at: 'renewal' }] },
        ] },
      homeRepair: { title: 'ועד הבית: שיפוץ הבניין', onCard: true,
        text: 'הבניין בן 40. האסיפה רוצה לשפץ חזית ומעלית. החלק שלך: {repair}.',
        options: [
          { id: 'pay', label: 'לשלם עכשיו', dq: 'mixed', fx: { cash: -0.8 }, next: [{ end: true, in: 0 }] },
          { id: 'spread', label: 'בתשלומים לוועד', dq: 'mixed', fx: { line: { amt: 0.08, months: 12, label: 'תשלומי ועד בית', tag: null } }, next: [{ end: true, in: 0 }] },
          { id: 'object', label: 'להתנגד באסיפה', dq: 'mixed', odds: { p: 0.3, use: 'entry', text: 'במשחק: בערך 7 מכל 10 פעמים הרוב מחליט לשפץ בכל זאת' }, oddsS: { hit: 0, miss: -0.9 },
            next: [{ end: true, in: 0, if: 'win', news: 'shelved' }, { step: 'h2', in: 6, if: 'lose' }] },
        ] },
      h2: { title: 'השיפוץ יוצא לדרך', remember: 'התנגדת באסיפה — אבל הרוב החליט.',
        text: 'החלק שלך עלה בינתיים ל־{repair2}.',
        options: [
          { id: 'pay', label: 'לשלם עכשיו', dq: 'financial', fx: { cash: -0.9 }, next: [{ end: true, in: 0 }] },
          { id: 'spread', label: 'בתשלומים לוועד', dq: 'financial', default: true, fx: { line: { amt: 0.09, months: 12, label: 'תשלומי ועד בית', tag: null } }, next: [{ end: true, in: 0 }] },
        ] },
    },
  },

  /* ------------------------------------------------------------------ 5.3 studies, career and burnout */
  career: {
    id: 'career', title: 'קריירה וכוח', worlds: ['w1', 'w2', 'w3', 'w4', 'h'], cooldown: 18, maxRuns: 3, entry: { trigger: true },
    lessons: ['burnout', 'rest_value', 'time_scarce', 'human_capital', 'ask_raise', 'job_offer'],
    steps: {
      warn: { title: 'אות אזהרה',
        text: '{months} חודשים בלי הפסקה. הכוח שלך {energy}/100.',
        hint: 'במשחק: הסיכוי להישחק בחודש הבא — {pBurn}%.',
        options: [
          { id: 'pushOn', label: 'להמשיך כרגיל', dq: 'mixed', default: true, next: [{ end: true, in: 0 }], lesson: ['burnout'] },
          { id: 'week', label: 'שבוע חופש', dq: 'mixed', fx: { cash: -0.3, energy: 12, happiness: 2 }, next: [{ end: true, in: 0 }], lesson: ['rest_value'] },
          { id: 'rest2', label: 'חודשיים של מנוחה ומשפחה', dq: 'mixed', fx: { planLock: { plan: 'rest', months: 2 } }, next: [{ end: true, in: 0 }], lesson: ['rest_value'] },
        ] },
      promo: { title: 'הצעה לקידום',
        text: 'רונית, המנהלת, מציעה לך לנהל צוות: +15% ברוטו — וגם יותר שעות, ישיבות וטלפונים בערב.',
        options: [
          { id: 'accept', label: 'לקבל', dq: 'personal', fx: { grossMult: 1.15, workLoad: 1 }, next: [{ end: true, in: 0 }], memo: 'קיבלת את הקידום', lesson: ['time_scarce'] },
          { id: 'four', label: 'לבקש 4 ימים בשבוע במקום', dq: 'personal', fx: { grossMult: 0.9, workLoad: -1, happiness: 3, energy: 6 }, next: [{ end: true, in: 0 }], memo: 'ביקשת 4 ימים בשבוע' },
          { id: 'stay', label: 'להישאר בתפקיד', dq: 'personal', default: true, fx: { happiness: 1 }, next: [{ end: true, in: 0 }] },
        ] },
      degree: { title: 'עם התואר ביד',
        text: 'סיימת ללמוד. אפשר לחפש עבודה שמשלמת על התואר — או לבקש העלאה כאן.',
        options: [
          { id: 'interview', label: 'לחפש עבודה חדשה', dq: 'financial', fx: { jobless: 1 }, odds: { p: 0.6, use: 'a', text: 'במשחק: 6 מכל 10 מוצאים משרה טובה יותר תוך חודש' }, hook: 'degreeInterview', next: [{ end: true, in: 0 }], lesson: ['human_capital', 'job_offer'] },
          { id: 'askHere', label: 'לבקש העלאה כאן', dq: 'financial', odds: { p: 'raise', use: 'a', text: 'במשחק: הסיכוי שיסכימו — {raiseP}%' }, hook: 'degreeAsk', next: [{ end: true, in: 0 }], lesson: ['ask_raise'] },
          { id: 'stay', label: 'להישאר בינתיים', dq: 'financial', default: true, next: [{ end: true, in: 0 }] },
        ] },
    },
  },

  /* ------------------------------------------------------------------ 5.4 a side hustle becomes a business */
  side: {
    id: 'side', title: 'העסק הצדדי', worlds: ['w1', 'w2', 'w3', 'w4', 'h'], cooldown: 0, maxRuns: 1, entry: { trigger: true },
    lessons: ['side_hustle', 'side_tax', 'biz_receivables', 'biz_owner_job'],
    steps: {
      s1: { title: 'ההכנסה הראשונה!',
        text: 'קיבלת {first} על העבודה בערבים. ומה עם מס הכנסה?',
        hint: 'בקצב הזה: חוב מס של בערך {due12} בשנה, ועוד 10% קנס למי שלא מדווח.',
        options: [
          { id: 'file', label: 'לפתוח תיק ולשלם מקדמות', dq: 'financial', fx: { sideReport: true }, next: [{ end: true, in: 0 }], lesson: ['side_tax'] },
          { id: 'later', label: 'אחר כך', dq: 'financial', default: true, hook: 'sideLater', next: [{ end: true, in: 0 }] },
        ] },
      s2: { title: 'הזמנה גדולה',
        text: 'בית קפה שכונתי רוצה 200 עוגות לחג. צריך חומרים עכשיו ב־{cost} — והתשלום בחודש הבא.',
        options: [
          { id: 'take', label: 'לקחת', dq: 'financial', hook: 'bigOrder', odds: { p: 0.2, use: 'a', bad: true, text: 'במשחק: 1 מכל 5 לקוחות כאלה משלם באיחור' }, next: [{ end: true, in: 0 }], lesson: ['biz_receivables'] },
          { id: 'advance', label: 'לבקש מקדמה של חצי', dq: 'financial', hook: 'bigOrderAdvance', odds: { p: 0.6, use: 'b', text: 'במשחק: 6 מכל 10 מסכימים למקדמה' }, next: [{ end: true, in: 0 }], lesson: ['biz_receivables'] },
          { id: 'decline', label: 'לוותר', dq: 'financial', default: true, next: [{ end: true, in: 0 }] },
        ] },
      s3: { title: 'להגדיל הימור?',
        text: 'העסק הצדדי מכניס בממוצע {avg} בחודש. אפשר לצמצם משרה ולתת לו יותר זמן.',
        hint: 'יש לך {cushion} חודשי הוצאות בצד.',
        options: [
          { id: 'partTime', label: 'לעבור לחצי משרה', dq: 'mixed', hook: 'sidePartTime', next: [{ end: true, in: 0 }], lesson: ['biz_owner_job'] },
          { id: 'keep', label: 'להמשיך ככה', dq: 'mixed', default: true, next: [{ end: true, in: 0 }] },
          { id: 'small', label: 'להשאיר אותו קטן', dq: 'mixed', hook: 'sideSmall', next: [{ end: true, in: 0 }] },
        ] },
      s4: { title: 'הערבים הפכו לעסק',
        text: 'אפשר לפתוח עסק אמיתי עם הציוד והלקוחות שכבר יש לך. איזה?',
        hint: 'עסק גדול (מכבסה, פיצרייה, אפליקציה) דורש הון — הוא במשבצת "העסק שלך".',
        options: [ // the engine expands `grad` into one option per SIDE_GRAD type allowed in the world (coffee first = default)
          { id: 'grad', label: '{bizName}', dq: 'mixed', hook: 'sideGrad', default: true, next: [{ end: true, in: 0 }], lesson: ['biz_owner_job'] },
          { id: 'small', label: 'להישאר עם עסק צדדי', dq: 'mixed', hook: 'sideSmall', next: [{ end: true, in: 0 }] },
        ] },
    },
  },

  /* ------------------------------------------------------------------ 5.5 a loan or partnership with a friend */
  friend: {
    id: 'friend', title: 'חבר מבקש עזרה', worlds: ['w1', 'w2', 'w3', 'w4', 'h'], cooldown: 18, maxRuns: 2, entry: { card: 'friend' },
    lessons: ['friend_loan', 'guarantor', 'sunk_cost', 'credit_score'],
    steps: {
      f1: { title: '{name} מבקש עזרה', onCard: true, remember: '{rememberFriend}',
        text: '{name}, חבר מילדות, פותח עסק ומבקש הלוואה של {amount} — או לפחות שתחתום לו ערבות בבנק.',
        options: [
          { id: 'lend', label: 'להלוות לו', dq: 'personal', fx: { cash: -1, happiness: 3 }, hook: 'friendLend', odds: { p: 0.4, use: 'entry', bad: true, text: 'במשחק: בערך 4 מכל 10 עסקים כאלה לא מחזירים בזמן' }, path: 'lend', next: [{ step: 'f2', in: 3 }], memo: 'הלווית ל{name} {amount}', lesson: ['friend_loan'] },
          { id: 'guarantee', label: 'לחתום ערבות', dq: 'personal', fx: { happiness: 2 }, hook: 'friendGuarantee', odds: { p: 0.35, use: 'entry', bad: true, text: 'אם הוא לא ישלם — הבנק גובה ממך {risk}. במשחק: 35 מכל 100' }, path: 'guarantee', next: [{ step: 'f2', in: 3 }], memo: 'חתמת ערבות ל{name}', lesson: ['guarantor'] },
          { id: 'no', label: 'לסרב בנימוס', dq: 'personal', fx: { happiness: -3 }, path: 'no', next: [{ end: true, in: 0 }], memo: 'סירבת ל{name}' },
        ] },
      f2: { title: '{name} שוב מתקשר', remember: '{rememberF2}',
        text: '"עוד {extra} ואני עובר את החורף." {f2line}',
        hint: 'הכסף הנוסף לא משנה את הסיכוי שהעסק יצליח.',
        options: [
          { id: 'more', label: 'לתת עוד', dq: 'personal', hook: 'friendMore', next: [{ resolve: true, at: 'friendAt' }], lesson: ['sunk_cost'] },
          { id: 'partner', label: 'להציע שותפות במקום', dq: 'personal', when: 'lent', hook: 'friendPartner', next: [{ resolve: true, at: 'friendAt' }], lesson: ['sunk_cost'] },
          { id: 'refuse', label: 'לא, מספיק', dq: 'personal', default: true, fx: { happiness: -2 }, next: [{ resolve: true, at: 'friendAt' }] },
        ] },
      f3a: { title: '{name} לא יכול להחזיר', remember: 'הלווית ל{name} {amount}.',
        text: 'העסק נסגר. {name} מציע להחזיר לאט, כמה מאות בחודש.',
        options: [
          { id: 'plan', label: 'לקבל החזר בתשלומים', dq: 'personal', default: true, hook: 'friendPlan', next: [{ end: true, in: 0 }] },
          { id: 'forgive', label: 'לוותר לו', dq: 'personal', fx: { happiness: 3 }, next: [{ end: true, in: 0 }] },
          { id: 'court', label: 'תביעה קטנה', dq: 'personal', fx: { cash: -0.05, happiness: -4 }, odds: { p: 0.5, use: 'a', text: 'במשחק: חצי מהתביעות כאלה מצליחות' }, hook: 'friendCourt', next: [{ end: true, in: 0 }] },
        ] },
      f3b: { title: 'הבנק גובה ממך', remember: 'חתמת ערבות ל{name}.',
        text: '{name} לא עמד בהלוואה. הבנק דורש ממך, הערב, {risk}.',
        options: [
          { id: 'pay', label: 'לשלם עכשיו', dq: 'financial', hook: 'friendPay', next: [{ end: true, in: 0 }], lesson: ['credit_score'] },
          { id: 'spread', label: 'הסדר תשלומים עם הבנק', dq: 'financial', default: true, hook: 'friendSpread', next: [{ end: true, in: 0 }], lesson: ['credit_score'] },
        ] },
    },
  },

  /* ------------------------------------------------------------------ 5.6 economic crisis and recovery (T2 cycle) */
  crisis: {
    id: 'crisis', title: 'משבר כלכלי', worlds: ['w1', 'w2', 'w3', 'w4'], cooldown: 36, maxRuns: 2, entry: { trigger: true }, exempt: true,
    lessons: ['emergency_fund', 'drawdown', 'panic_selling', 'time_in_market', 'unemployment'],
    steps: {
      c1: { title: 'כותרות: מיתון',
        text: 'המדד ירד {dd}% מהשיא. יש לך כרית ל־{cushion} חודשים{debtLine}. מה עושים עם ההשקעות?',
        hint: 'בקרן המדד: {idxValue} ({units} יחידות). הוראת קבע: {auto} בחודש.',
        options: [
          { id: 'keep', label: 'ממשיכים כרגיל', dq: 'financial', default: true, path: 'keep', next: [{ step: 'job', in: 1 }], lesson: ['time_in_market'] },
          { id: 'pause', label: 'לעצור את הוראת הקבע', dq: 'financial', when: 'auto', hook: 'crisisPause', path: 'pause', next: [{ step: 'job', in: 1 }], lesson: ['emergency_fund'] },
          { id: 'sell', label: 'למכור הכול', dq: 'financial', when: 'idx', hook: 'crisisSell', path: 'sell', next: [{ step: 'job', in: 1 }], lesson: ['panic_selling'] },
          { id: 'more', label: 'להגדיל את הוראת הקבע', dq: 'financial', when: 'more', hook: 'crisisMore', path: 'more', next: [{ step: 'job', in: 1 }], lesson: ['time_in_market'] },
        ] },
      job: { title: 'במשרד מדברים על קיצוצים',
        text: 'ההנהלה מציעה: 10% פחות שכר לחצי שנה — במקום פיטורים.',
        options: [
          { id: 'accept', label: 'להסכים לקיצוץ', dq: 'mixed', default: true, fx: { grossTemp: { mult: 0.9, months: 6 } }, next: [{ step: 'bizCut', in: 1 }], memo: 'הסכמת לקיצוץ' },
          { id: 'refuse', label: 'לסרב', dq: 'mixed', odds: { p: 0.3, use: 'a', bad: true, text: 'במשחק: 3 מכל 10 שמסרבים מפוטרים' }, hook: 'crisisRefuse', next: [{ step: 'bizCut', in: 1 }], lesson: ['unemployment'] },
          { id: 'look', label: 'להתחיל לחפש בשקט', dq: 'mixed', fx: { energy: -6 }, odds: { p: 0.5, use: 'b', text: 'במשחק: חצי מוצאים משהו טוב יותר' }, hook: 'crisisLook', next: [{ step: 'bizCut', in: 1 }] },
        ] },
      bizCut: { title: 'הלקוחות מקצצים',
        text: '{bizName}: הביקוש ירד. הקופה של העסק: {bizCash}.',
        options: [
          { id: 'price', label: 'מבצע: 5% פחות במחיר', dq: 'financial', hook: 'bizCutPrice', next: [{ step: 'recovery', at: 'recovery' }] },
          { id: 'staff', label: 'לצמצם עובד', dq: 'financial', when: 'staff', hook: 'bizCutStaff', next: [{ step: 'recovery', at: 'recovery' }] },
          { id: 'hold', label: 'להחזיק מעמד מהקופה', dq: 'financial', default: true, next: [{ step: 'recovery', at: 'recovery' }] },
        ] },
      recovery: { title: 'אחרי הסערה',
        text: 'המדד חזר ל־{back}% מהשיא. {pathLine}',
        hint: 'מי שהמשיך להשקיע קנה {unitsDuring} יחידות בזול — שוות היום {diff}.',
        options: [
          { id: 'ok', label: 'הבנתי', dq: 'none', default: true, next: [{ end: true, in: 0 }], lesson: ['time_in_market'] },
        ] },
    },
  },
};
export const CHAIN_IDS = Object.keys(CHAINS);

/** The standalone life cards' substitution order (§3.5) — the first eligible one that differs from the drawn card is shown. */
export const SUBST = ['health', 'course', 'parent', 'reserve', 'vacation', 'quiet']; // [TUNE] vacation moved behind the rotation (it was over-drawn as everyone's fallback)
/** Standalone-card cooldowns (months) and caps per game (§3.5). */
export const COOLDOWN = { baby: 18, parent: 18, reserve: 12, jobOffer: 18, layoff: 24, health: 12, vacation: 12, course: 12 }; // [TUNE] vacation 8 → 12 (§12.10: no standalone repeat within 12 months)
export const CAP = { wedding: 1, jobOffer: 2, layoff: 1 };
/** C9 decision classes of the standalone life cards (per card; a card's options all share it). */
export const LIFE_DQ = { wedding: 'personal', baby: 'personal', parent: 'personal', friend: 'personal', jobOffer: 'personal', vacation: 'personal', quiet: 'personal',
  moving: 'personal', health: 'mixed', layoff: 'mixed', car: 'mixed', course: 'financial', reserve: 'none' };

/** C1: the doodad that replaces a car repair once you gave up the car (amount = 400 × S / 9000, ≥ ₪300). */
export const NO_CAR_DOODAD = { n: 'תיקון לאופניים וכרטיס רב־קו', a: 400, need: true, d: 'בלי רכב — אבל גם לאופניים יש פנצ׳רים.' };

/** "זוכר?" cross-chain lines (§3.7). */
export const CROSS = {
  periphery: 'זוכר? עברת לפריפריה — ובלי רכב הדרך לעבודה ארוכה.',
  cut: 'ההנהלה לא שכחה שהסכמת לקיצוץ בזמן המיתון.',
  forced: 'שים לב: לפני {n} חודשים הבנק כבר נתן לך הלוואה כפויה.',
};
/** One-line news for chain endings (no decision). */
export const NEWS = {
  carOk: 'שנה עברה — והרכב שתיקנת מחזיק מעמד. המזל היה איתך.',
  shelved: 'האסיפה גנזה את השיפוץ. בינתיים.',
  lendOk: '{name} החזיר {amount} — והזמין אותך לפתיחה.',
  guaranteeOk: 'הערבות שוחררה. פיו.',
  partnerOk: 'השותפות עם {name} מכניסה {cf} בחודש.',
  partnerBad: 'העסק של {name} נסגר. גם החלק שלך.',
  sideAsleep: 'העסק הצדדי נרדם — שלושה חודשים בלי ערבים של עבודה.',
  promo6: 'חצי שנה בתפקיד: הנטו עלה ב־{netUp}, והכוח בממוצע {energyAvg}.',
  burnout: 'הגוף עצר בשבילך. בפעם הבאה אפשר לעצור קודם.',
  noDecision: 'לא החלטת — {label}.',
};
/** End-of-chain titles for the end screen (lifeSummary.stories). */
export const PATH_TEXT = {
  car: { fix: 'תיקנת את הרכב', lease: 'עברת לליסינג', bus: 'ויתרת על הרכב' },
  move: { bigger: 'דירה גדולה יותר', stay: 'נשארת בדירה', smaller: 'דירה קטנה יותר', periphery: 'עברת לפריפריה', owner: 'שיפוץ הבניין' },
  career: { warn: 'אות אזהרה', promo: 'הצעה לקידום', degree: 'תואר ביד' },
  side: { side: 'עסק צדדי' },
  friend: { lend: 'הלוואה לחבר', guarantee: 'ערבות לחבר', no: 'סירבת לחבר' },
  crisis: { keep: 'המשכת להשקיע במשבר', pause: 'עצרת את הוראת הקבע', sell: 'מכרת במשבר', more: 'הגדלת במשבר' },
};
/** Template keys a chain text may use — all derived from public state (U12). */
export const VAR_ALLOW = ['S', 'fix', 'fix2', 'paid', 'paidNow', 'spent', 'ago', 'saved', 'lease', 'leaseNew', 'extra', 'rent', 'raise', 'raisePct', 'share', 'inflLast',
  'energy', 'months', 'pBurn', 'cushion', 'due12', 'first', 'avg', 'cost', 'amount', 'risk', 'dd', 'idxValue', 'units', 'auto', 'unitsDuring', 'diff', 'back', 'pathLine',
  'name', 'rememberMove', 'rememberFriend', 'rememberF2', 'f2line', 'repair', 'repair2', 'debtLine', 'bizName', 'bizCash', 'raiseP', 'cf', 'netUp', 'energyAvg', 'label', 'n'];
