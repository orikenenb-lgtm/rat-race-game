// T2 — mentor levels (מתחיל / מתקדם / מומחה): data + pure wording helpers. No engine imports, no DOM, no randomness.
// guide = one highlighted option (the evaluator's top pick) · hint = no highlight, hints on request (counted) · pro = no
// highlight, no hints, no verdict pill during play (full review at the end).

export const LEVELS = ['guide', 'hint', 'pro'];

/** Hebrew copy for the lobby picker and the HUD menu (spec §17). */
export const LEVEL_TEXT = Object.freeze({
  guide: Object.freeze({ id: 'guide', label: 'מתחיל', desc: 'המנטור מסמן אפשרות ומסביר למה. טוב לעולם הראשון.' }),
  hint: Object.freeze({ id: 'hint', label: 'מתקדם', desc: 'אין כפתור מסומן. אפשר לבקש רמז — והרמזים נספרים.' }),
  pro: Object.freeze({ id: 'pro', label: 'מומחה', desc: 'בלי סימונים ובלי רמזים. ניתוח מלא של כל ההחלטות בסוף.' }),
});

const RANKED = ['daily', 'weekly', 'challenge'];
/** Starting level for a game config: ranked = hint (fixed), tutorial = guide, otherwise o.mentor or w1 guide / others hint. */
export function defaultLevel(cfg = {}) {
  if (RANKED.includes(cfg.mode)) return 'hint';
  if (cfg.tutorial) return 'guide';
  if (LEVELS.includes(cfg.mentor)) return cfg.mentor;
  return (cfg.worldId || 'w1') === 'w1' && cfg.mode !== 'history' ? 'guide' : 'hint';
}

/** Words that state a verdict before the decision. Never shown at hint/pro (post-decision feedback is allowed). */
export const VERDICT_WORDS = /ההמלצה|משתלמ|מומלץ|הבחירה הנכונה|כדאי לך/;

/** Neutral replacement texts for option labels that would leak the answer at hint/pro. */
const NEUTRAL = { 'biz:suggest': 'הגדרות אוטומטיות של העסק' };

/**
 * Wording filter. At guide the text is returned as is. At hint/pro: a known option id gets its neutral label; any other
 * text loses the verdict clause (the part from the verdict word to the end of its clause).
 */
export function neutralLabel(id, text, level) {
  if (level === 'guide' || text == null) return text;
  if (id && NEUTRAL[id]) return NEUTRAL[id];
  let t = String(text);
  if (!VERDICT_WORDS.test(t)) return t;
  // drop the clause that carries the verdict: from a separator (— , : ·) before the word to the next separator / end
  t = t.replace(/\s*[—–\-:,·]?\s*[^—–\-:,·.!?]*(?:ההמלצה|משתלמ|מומלץ|הבחירה הנכונה|כדאי לך)[^—–\-:,·.!?]*[.!?]?/g, '').trim();
  return t || '—';
}
