// "מכונת הזמן" — the history-mode world. Not in WORLDS (no map pin, no daily rotation); getWorld('h') returns it.
// Rules = השכונה (w1) cards, but the index fund, interest rate, CPI, home prices and the dollar follow REAL monthly
// data from js/data/real.js for the chosen scenario (see js/history.js). Goal: beat a buy-and-hold index investor.
import { MENTOR, tilesFor, ring, INDEX_TICKER } from './common.js';
import w1 from './w1.js';

const board = ring(['OMOLIODMO', 'IOD?OMLOE', 'OMIODOLMO', 'KOIMXOTOI']);

export default {
  id: 'h', order: 99, name: 'מכונת הזמן', mechanic: 'history', hidden: true,
  tagline: 'שוק אמיתי, חודש אחרי חודש. תנצח משקיע שרק קנה והחזיק?',
  goalLabel: 'לסיים עם שווי גבוה משל משקיע "קנה והחזק"',
  lesson: 'רוב המשקיעים לא מנצחים קרן מדד פשוטה. מי שמוכר בפאניקה בתחתית — מפסיד הכי הרבה. מי שנשאר מושקע וממשיך להפקיד — קוטף את ההתאוששות. בתרחישים כאן השוק חזר; בהיסטוריה היו גם שווקים, כמו יפן אחרי 1990, שלקח להם עשרות שנים.',
  theme: { ...w1.theme, sky: ['#d9e2f2', '#9fb3d1'], fog: '#cfd8e6', board: '#efe9dc', center: '#e7dfcc', accent: '#c8a24a', decor: 'trees' },
  board,
  tiles: tilesFor(board, { M: { name: 'כותרות', color: '#334155' }, X: { name: 'משבר' } }),
  // loans follow the real Bank of Israel rate: monthly % = (BoI + 4.5) / 12
  loan: { unit: 5000, autoUnit: 1000, pct: 0.375, rateLinked: true, rateMult: 1 / 12, cap: 1.5, bankrupt: 10 },
  creditPct: 1.5,
  rate: { min: 0, max: 20 },
  goal: { type: 'benchmark' },
  maxMonths: 48,
  stars: { t2: 999, t3: 999 },
  start: { rate: 4 },
  models: { ...w1.models, side: 'business' },
  bizOffers: ['coffee', 'laundromat'],
  kinds: { ...w1.kinds, side: { label: 'עסק צדדי', debtLabel: 'הלוואה' } },
  tickers: { IDX: { ...INDEX_TICKER, name: 'קרן מחקה מדד (נתונים אמיתיים)', model: 'stock' } },
  historyDiv: 0.0015, // monthly distribution of the index fund (before 25% tax)
  characters: [
    { id: 'h1', gender: 'f', name: 'שכירה צעירה', icon: 'book', age: 27, family: { partner: 'together', kids: 0 }, desc: 'משכורת ממוצעת, חיסכון ראשון בבנק. מה עושים איתו כשהעולם משתגע?', salary: 11000, cash: 120000,
      expenses: [['שכירות', 4200], ['רכב', 1100], ['אוכל ושוטף', 3000], ['ביטוחים ושונות', 1100]] },
    { id: 'h2', gender: 'f', name: 'זוג עם ילד', icon: 'heart', age: 33, family: { partner: 'married', kids: 1 }, desc: 'שתי משכורות, ילד בגן, ו־₪250 אלף בצד. מחכים לדירה — או משקיעים?', salary: 19000, cash: 250000,
      expenses: [['שכירות', 5800], ['רכב', 1800], ['אוכל ושוטף', 4500], ['גן', 2600], ['ביטוחים ושונות', 1500]] },
  ],
  deals: w1.deals.filter((c) => !c.tk && !c.crypto),
  goldenChance: w1.goldenChance,
  golden: w1.golden.filter((c) => !c.tk),
  doodads: w1.doodads,
  market: [], // M tiles show the month's real headline + an index-fund trade window (engine)
  crises: w1.crises,
  mystery: w1.mystery.filter((c) => c.kind !== 'shares'),
  mentor: {
    ...MENTOR,
    start: 'מכונת הזמן: {who}. כל משבצת משכורת היא חודש אמיתי. המטרה: לנצח משקיע שפשוט קנה קרן מדד והחזיק.',
    trade_IDX: 'זה המדד האמיתי של אותו חודש. כולם יודעים מה קרה אחר כך — אבל מי שחי את זה, לא ידע.',
    won: 'ניצחת את המשקיע הפסיבי! עשית את זה עם סבלנות, לא עם ניחושים.',
    lostTime: 'הפעם המשקיע ה"משעמם" ניצח. הוא לא עשה כלום — וזה בדיוק העניין.',
  },
};
