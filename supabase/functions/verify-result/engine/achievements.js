// Achievements — definitions + pure checks. No imports from the engine (the engine calls us with metrics in payload).
//
// checkAchievements(state, eventType, payload) → [achievementDef] newly earned *in this game* (not yet in state.ach).
//   eventType: 'buy' | 'pass' | 'sell' | 'tradeBuy' | 'tradeSell' | 'doodad' | 'market' | 'crisis' | 'mystery' | 'quiz' |
//              'payday' | 'autoLoan' | 'repay' | 'refi' | 'upgrade' | 'trim' | 'hedge' | 'insurancePaid' | 'angel' |
//              'exit' | 'give' | 'end'
//   payload:   always has {m: metrics(state), world}; plus event specifics (asset, cf, gain, lowBuy, mult, end …)
// checkMetaAchievements(progress) → [achievementDef] for cross-game goals. progress = {stars:{w1..w4}, achievements:[ids], worldsPlayed:[ids]}

export const ACHIEVEMENTS = [
  // ---- any world
  { id: 'first_asset', name: 'הנכס הראשון', desc: 'קנית נכס שמכניס כסף כל חודש.', icon: 'seed' },
  { id: 'no_trap', name: 'לא מתאהב', desc: 'ויתרת על "נכס" שמוציא כסף כל חודש.', icon: 'shield' },
  { id: 'golden', name: 'עסקת זהב', desc: 'תפסת עסקת זהב נדירה.', icon: 'gold' },
  { id: 'cushion', name: 'כרית ביטחון', desc: 'עברת משבר בלי הלוואת חירום.', icon: 'pillow' },
  { id: 'credit_free', name: 'סגרת את האשראי', desc: 'פרעת חוב כרטיס אשראי עד הסוף.', icon: 'card' },
  { id: 'flip_double', name: 'פי שניים', desc: 'מכרת נכס ברווח גדול מההון ששמת בו.', icon: 'arrows' },
  { id: 'buy_low', name: 'קנה בזול, מכור ביוקר', desc: 'קנית מניה בזול ומכרת אותה בפי 3 לפחות.', icon: 'chart' },
  { id: 'quiz', name: 'תלמיד של אבא עשיר', desc: 'ענית נכון על שאלת אבא עשיר.', icon: 'cap', hidden: true },
  { id: 'millionaire', name: 'מיליונר', desc: 'שווי נקי של מיליון שקל ומעלה.', icon: 'crown' },
  { id: 'zero_debt_win', name: 'נקי מחובות', desc: 'ניצחת בלי הלוואות ובלי חוב אשראי.', icon: 'feather' },
  { id: 'no_bank_win', name: 'בלי בנק', desc: 'ניצחת בלי לקחת אף הלוואה בנקאית במשחק.', icon: 'piggy', hidden: true },
  { id: 'comeback', name: 'קאמבק', desc: 'ניצחת אחרי שהיה לך חודש עם תזרים שלילי.', icon: 'phoenix', hidden: true },
  { id: 'strong_will', name: 'כוח רצון', desc: 'ויתרת על 4 פיתויים במשחק אחד.', icon: 'shield' },
  { id: 'no_installments', name: 'בלי אשראי', desc: 'ניצחת בלי לקנות אף פעם באשראי או במנוי.', icon: 'scissors' },
  // ---- v3 "החיים האמיתיים" (any world)
  { id: 'balanced', name: 'עשיר ושמח', desc: 'יצאת מהמירוץ עם אושר 70 ומעלה.', icon: 'sun' },
  { id: 'negotiator', name: 'סוחר ממולח', desc: 'שתי הצעות מחיר נמוכות התקבלו במשחק אחד.', icon: 'handshake' },
  { id: 'scholar', name: 'השקעתי בעצמי', desc: 'סיימת ללמוד וקיבלת העלאה קבועה.', icon: 'cap' },
  { id: 'cushion3', name: 'כרית של 3 חודשים', desc: 'יצאת מהמירוץ עם קרן חירום של 3 חודשי הוצאות לפחות.', icon: 'pillow' },
  { id: 'good_call', name: 'החלטה טובה, מזל רע', desc: 'איכות ההחלטות שלך הייתה 75 ומעלה, גם כשהמזל היה נגדך.', icon: 'compass' },
  { id: 'no_panic', name: 'לא מכרתי בפאניקה', desc: 'החזקת בקרן המדד גם כשהיא ירדה 20% — ולא מכרת בהפסד.', icon: 'anchor' },
  { id: 'steady_hand', name: 'יד יציבה', desc: 'במכונת הזמן: ניצחת את "קנה והחזק" בלי למכור בהפסד.', icon: 'anchor', world: 'h' },
  // ---- w1 השכונה
  { id: 'three_apts', name: 'בעל בית', desc: 'שלוש דירות בבעלותך בבת אחת.', icon: 'house', world: 'w1' },
  { id: 'w1_fast', name: 'שועל השכונה', desc: 'יצאת מהשכונה בפחות מ־30 חודשים.', icon: 'fox', world: 'w1' },
  { id: 'lucky_exit', name: 'יצאת בזמן — הפעם היה מזל', desc: 'מכרת קריפטו ברווח של פי 2 לפני שקרס. מזל, לא אסטרטגיה.', icon: 'moon', world: 'w1', hidden: true },
  // ---- w2 העיר הגדולה
  { id: 'rate_lock', name: 'נעלתי ריבית', desc: 'קיבעת ריבית במשבצת הבנק.', icon: 'lock', world: 'w2' },
  { id: 'contractor', name: 'קבלן ראשי', desc: 'שלושה שדרוגים במשחק אחד.', icon: 'hammer', world: 'w2' },
  { id: 'trimmer', name: 'חותך שומנים', desc: 'קיצצת הוצאה של סגנון חיים.', icon: 'scissors', world: 'w2' },
  { id: 'tower_lord', name: 'קו הרקיע', desc: 'שלושה מגדלים בבעלותך.', icon: 'tower', world: 'w2' },
  // ---- w3 הנמל הגלובלי
  { id: 'hedger', name: 'מגודר', desc: 'גידרת את העסק מפני הדולר.', icon: 'umbrella', world: 'w3' },
  { id: 'natural_hedge', name: 'גידור טבעי', desc: 'יבואן ויצואן בתיק אחד — הדולר כבר לא מפחיד.', icon: 'scale', world: 'w3' },
  { id: 'gold_crisis', name: 'זהב במשבר', desc: 'מכרת זהב באמצע משבר כדי לכסות את החור.', icon: 'gold', world: 'w3' },
  { id: 'insured', name: 'הביטוח שילם', desc: 'ביטוח המשלוחים חסך לך הפסד.', icon: 'anchor', world: 'w3' },
  // ---- w4 עמק העתיד
  { id: 'angel5', name: 'מלאך', desc: 'השקעת בחמישה סטארט־אפים במשחק אחד.', icon: 'wings', world: 'w4' },
  { id: 'unicorn', name: 'חד־קרן', desc: 'אקזיט של פי 20 ומעלה. כן, זה בעיקר מזל — בגלל זה מפזרים.', icon: 'unicorn', world: 'w4', hidden: true },
  { id: 'impact25', name: 'עושה שינוי', desc: '25 נקודות השפעה.', icon: 'heart', world: 'w4' },
  { id: 'impact100', name: 'משנה עולם', desc: '100 נקודות השפעה.', icon: 'globe', world: 'w4' },
  { id: 'pledge', name: 'נתינה קבועה', desc: 'פתחת הוראת קבע לתרומה חודשית.', icon: 'calendar', world: 'w4' },
  // ---- meta (progress across games)
  { id: 'explorer', name: 'מטייל', desc: 'שיחקת בכל ארבעת העולמות.', icon: 'map', meta: true },
  { id: 'stars6', name: 'משקיע', desc: 'צברת 6 כוכבים.', icon: 'star', meta: true },
  { id: 'legend', name: 'אגדה', desc: '★★★ בכל העולמות.', icon: 'trophy', meta: true },
];

const BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
export const achievementById = (id) => BY_ID[id] || null;

/** Tests: (state, type, payload) → boolean. Only evaluated for achievements not yet earned. */
const TESTS = {
  first_asset: (s, t, p) => t === 'buy' && p.cf > 0,
  no_trap: (s, t, p) => t === 'pass' && p.cf < 0,
  golden: (s, t, p) => t === 'buy' && !!p.golden,
  cushion: (s, t, p) => t === 'crisis' && !p.loan,
  credit_free: (s, t) => t === 'creditPaid',
  flip_double: (s, t, p) => t === 'sell' && p.asset && p.profit >= p.asset.down && p.asset.down > 0,
  buy_low: (s, t, p) => t === 'tradeSell' && p.lowBuy != null && p.gain > 0 && p.price >= p.lowBuy * 3,
  quiz: (s, t, p) => t === 'quiz' && p.right,
  millionaire: (s, t, p) => p.m && p.m.netWorth >= 1_000_000,
  zero_debt_win: (s, t, p) => t === 'end' && p.end.status === 'won' && s.loans === 0 && s.credit === 0,
  no_bank_win: (s, t, p) => t === 'end' && p.end.status === 'won' && s.stats.loansTaken === 0 && s.stats.autoLoan === 0,
  comeback: (s, t, p) => t === 'end' && p.end.status === 'won' && s.stats.negMonths > 0,
  no_installments: (s, t, p) => t === 'end' && p.end.status === 'won' && !s.flags.usedCredit,
  three_apts: (s, t) => t === 'buy' && s.assets.filter((a) => a.k === 're').length >= 3,
  w1_fast: (s, t, p) => t === 'end' && s.worldId === 'w1' && p.end.status === 'won' && p.end.months < 30,
  lucky_exit: (s, t, p) => t === 'tradeSell' && !!p.crypto && p.avg > 0 && p.price >= p.avg * 2,
  strong_will: (s, t) => t === 'resist' && s.stats.resisted >= 4,
  rate_lock: (s, t) => t === 'refi',
  contractor: (s, t) => t === 'upgrade' && s.stats.upgrades >= 3,
  trimmer: (s, t) => t === 'trim',
  tower_lord: (s, t) => t === 'buy' && s.worldId === 'w2' && s.assets.filter((a) => a.k === 'tower').length >= 3,
  hedger: (s, t, p) => t === 'hedge' || (t === 'buy' && !!(p.asset && p.asset.hedge)),
  natural_hedge: (s, t) => t === 'buy' && s.worldId === 'w3' && s.assets.some((a) => a.sens < 0) && s.assets.some((a) => a.sens > 0),
  gold_crisis: (s, t, p) => t === 'tradeSell' && p.tk === 'GOLD' && !!p.crisis,
  insured: (s, t) => t === 'insurancePaid',
  angel5: (s, t) => t === 'angel' && s.stats.angels >= 5,
  unicorn: (s, t, p) => t === 'exit' && p.mult >= 20,
  impact25: (s, t, p) => s.worldId === 'w4' && (s.world.impact || 0) >= 25,
  impact100: (s, t, p) => s.worldId === 'w4' && (s.world.impact || 0) >= 100,
  pledge: (s, t, p) => t === 'give' && !!p.pledge,
  balanced: (s, t, p) => t === 'end' && p.end.status === 'won' && !!s.life && s.life.happiness >= 70,
  negotiator: (s) => !!s.life && s.life.negWins >= 2,
  scholar: (s) => !!s.life && s.life.study.done,
  cushion3: (s, t, p) => t === 'end' && p.end.status === 'won' && (s.savings || 0) >= 3 * p.m.expenses,
  good_call: (s, t, p) => t === 'end' && !!p.end.learning && p.end.learning.decisionQuality >= 75 && p.end.learning.luck.total < 0,
  no_panic: (s, t, p) => t === 'end' && !!s.life && s.lessons && s.lessons.includes('drawdown') && (s.holdings.IDX || {}).qty > 0 && !s.life.idxSold,
  steady_hand: (s, t, p) => t === 'end' && p.end.status === 'won' && s.worldId === 'h' && !!s.life && !s.life.idxSold,
};

/** Newly earned in-game achievements for this event. Pure (never mutates state). */
export function checkAchievements(state, eventType, payload = {}) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (a.meta || state.ach.includes(a.id)) continue;
    if (a.world && a.world !== state.worldId) continue;
    const test = TESTS[a.id];
    if (test && test(state, eventType, payload)) out.push(a);
  }
  return out;
}

/** Cross-game achievements from the player's saved progress. */
export function checkMetaAchievements(progress = {}) {
  const stars = progress.stars || {};
  const have = new Set(progress.achievements || []);
  const total = Object.values(stars).reduce((s, x) => s + (x || 0), 0);
  const played = new Set(progress.worldsPlayed || Object.keys(stars));
  const out = [];
  const add = (id) => { if (!have.has(id)) out.push(BY_ID[id]); };
  if (['w1', 'w2', 'w3', 'w4'].every((w) => played.has(w))) add('explorer');
  if (total >= 6) add('stars6');
  if (['w1', 'w2', 'w3', 'w4'].every((w) => (stars[w] || 0) >= 3)) add('legend');
  return out;
}

/** Title by total stars (shown next to the nickname everywhere). */
export const TITLES = [
  { min: 0, name: 'עכבר' }, { min: 2, name: 'חוסך' }, { min: 4, name: 'משקיע' },
  { min: 7, name: 'טייקון' }, { min: 10, name: 'מיליונר' }, { min: 12, name: 'אגדה' },
  // worlds wave 0 (DESIGN §1.3): new titles past 12 ★ — the existing ones keep their names and thresholds
  { min: 16, name: 'בעל אימפריה קטנה' }, { min: 21, name: 'איל הון' }, { min: 27, name: 'מגנט' }, { min: 36, name: 'אגדה כלכלית' },
];
export function titleFor(totalStars) { let t = TITLES[0]; for (const x of TITLES) if (totalStars >= x.min) t = x; return t.name; }
