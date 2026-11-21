// T5 §6 — "פרטי הנכס": the data behind a tapped city item. Pure: it only READS a metrics() object (E.metrics(S)) and the
// level object game.js built — no finance arithmetic, no DOM (the in-game UI lane renders the modal from this).
// Keys are the cityModels() keys: 'a<id>' (assets), 'h:<model>' (holdings group), 'v<id>' (angel), 'f' (foundation), 'L:*' (life).
import { levelText, levelHint, normLevel, activityOf, ACTIVITY_TEXT, ACTIVITY_EMOJI, KIND_FALLBACK } from './vocab.js';

const LIFE = { 'L:home': 'הבית של המשפחה', 'L:wedding': 'חתונה', 'L:uni': 'לימודים', 'L:pension': 'קרן הפנסיה', 'L:index': 'קרן מחקה מדד', 'L:side': 'העסק הצדדי', 'L:hospital': 'מנוחה והחלמה' };

/**
 * → null (unknown key) | { key, type, title, kindLabel, rows: [{id, label, value, kind:'money'|'signed'|'count'|'text'}], business, level,
 *   levelText, levelHint, activity: {key, text, emoji} | null, sheetRow } — values are the metrics numbers as-is (T5-I2 labels).
 */
export function assetInfo(key, m, { level = null } = {}) {
  if (!key || !m) return null;
  const L = normLevel(level);
  const act = activityOf(L);
  const base = { key, level: L, levelText: levelText(L), levelHint: levelHint(L), activity: act ? { key: act, text: ACTIVITY_TEXT[act], emoji: ACTIVITY_EMOJI[act] } : null, sheetRow: key };
  if (/^a\d+$/.test(key)) {
    const a = (m.assets || []).find((x) => x.id === key); if (!a) return null;
    const rows = [
      { id: 'cf', label: 'תזרים חודשי', value: a.cf, kind: 'signed' },
      { id: 'value', label: 'שווי', value: a.value, kind: 'money' },
      { id: 'debt', label: 'חוב', value: a.debt, kind: 'money' },
      { id: 'equity', label: 'הון עצמי', value: a.equity, kind: 'money' },
    ];
    let business = null;
    if (a.business) {
      const b = a.business;
      business = { type: b.type, manager: !!b.manager, incomeKind: b.incomeKind, ownerEnergy: b.ownerEnergy, headline: b.headline || '' };
      if (b.headline) rows.push({ id: 'headline', label: 'בחודש שעבר', value: b.headline, kind: 'text' });
      rows.push({ id: 'incomeKind', label: 'סוג הכנסה', value: b.manager ? 'פסיבית (יש מנהל)' : 'פעילה (אתה עובד בעסק)', kind: 'text' });
      if (b.ownerEnergy) rows.push({ id: 'energy', label: 'כוח בחודש', value: -Math.abs(b.ownerEnergy), kind: 'energy' });
    }
    return { ...base, type: 'asset', title: a.name, kindLabel: a.kindLabel, rows, business };
  }
  if (key.startsWith('h:')) {
    const model = key.slice(2); const hs = (m.holdings || []).filter((h) => h.model === model); if (!hs.length) return null;
    const rows = [];
    for (const h of hs) { rows.push({ id: 'qty:' + h.ticker, label: `כמות · ${h.name}`, value: h.qty, kind: 'count', unit: h.unit }); rows.push({ id: 'value:' + h.ticker, label: `שווי · ${h.name}`, value: h.value, kind: 'money' }); }
    return { ...base, type: 'holding', title: hs.length === 1 ? hs[0].name : hs.map((h) => h.name).join(' · '), kindLabel: KIND_FALLBACK.holding, rows, business: null };
  }
  if (/^v\d+$/.test(key)) {
    const v = (m.angels || []).find((x) => x.id === key); if (!v) return null;
    return { ...base, type: 'angel', title: v.name, kindLabel: KIND_FALLBACK.angel, business: null,
      rows: [{ id: 'amount', label: 'השקעה', value: v.amount, kind: 'money' }, { id: 'paper', label: 'שווי על הנייר', value: v.paper, kind: 'money' }, { id: 'status', label: 'מצב', value: v.status === 'active' ? 'פעילה' : 'הסתיימה', kind: 'text' }] };
  }
  if (key === 'f') {
    const wi = m.worldIndicators || {};
    return { ...base, type: 'foundation', title: 'הקרן שלך', kindLabel: KIND_FALLBACK.foundation, business: null, rows: [{ id: 'impact', label: 'השפעה', value: wi.impact ?? 0, kind: 'count' }] };
  }
  if (LIFE[key]) return { ...base, type: 'life', title: LIFE[key], kindLabel: KIND_FALLBACK.life, rows: [], business: null, sheetRow: null };
  return null;
}
