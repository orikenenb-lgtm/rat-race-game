// Mechanic module registry contract (worlds wave 0, DESIGN §4.2). A world attaches its module objects as `w.mech = [module, …]` (the world
// file imports them, so a world's rules and its modules load together, lazily, and travel together in the verifier's per-world pack).
// This file holds no module: it names the hooks the engine calls and checks a module's shape (tools/validate-worlds.mjs, tests).
export const HOOKS = ['init', 'defaults', 'monthly', 'asset', 'expense', 'liability', 'deal', 'market', 'crisis', 'tiles', 'act', 'actions', 'indicators', 'cityModels', 'recapHint', 'goalValue', 'goalAccrual'];
/** → [] when the module object is well formed, else a list of problems. */
export function checkModule(M) {
  const errs = [];
  if (!M || typeof M !== 'object') return ['not an object'];
  if (typeof M.id !== 'string') errs.push('id');
  if (!M.draws || typeof M.draws.month !== 'number' || typeof M.draws.init !== 'number' || typeof M.draws.landing !== 'object') errs.push('draws {init, month, landing}');
  for (const k of Object.keys(M)) if (!['id', 'draws', 'lessons', 'mentorKeys', 'sealed', ...HOOKS].includes(k)) errs.push('unknown hook ' + k);
  for (const [ch, T] of Object.entries(M.tiles || {})) {
    for (const f of ['create', 'describe', 'choose']) if (typeof T[f] !== 'function') errs.push(`tile ${ch}.${f}`);
    if (typeof T.safe !== 'string') errs.push(`tile ${ch}.safe (the option a room timeout may apply)`);
    if (M.draws && M.draws.landing && M.draws.landing[ch] == null) errs.push(`draws.landing.${ch}`);
  }
  for (const [n, f] of Object.entries(M.act || {})) if (typeof f !== 'function' || n.length > 20) errs.push('act ' + n);
  if (M.asset && (typeof M.asset.create !== 'function' || typeof M.asset.cf !== 'function')) errs.push('asset {create, cf}');
  return errs;
}
export const mechsOf = (w) => (w && Array.isArray(w.mech) ? w.mech : []);
