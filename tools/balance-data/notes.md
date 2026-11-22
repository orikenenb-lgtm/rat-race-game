## Reading (engine lane, after T4 + T6 engine parts, the director's balance decisions and the T3 review fixes, 2026-11-22)

**Engine measured.** `7f5b5ef06ed5` (HEAD after the T3 review batch, measured on `git archive HEAD`, not the shared working tree). The
later commit `3d5afa2` (T6 client CRs: `endNow`, decision labels, `out.rival.dd`, after-win fields) is outcome-neutral, so these numbers
stand for it; its engine id is `e9d0b3c299cf`. The machine ran 2 matrix processes plus the test suites on 2 cores, so the A10 speed row
(3.3 games/s) is not a measurement of the engine (pre-T2 baseline 12.3 on an idle box).

**What changed since the previous report.**
* T6 deal competition (stream `rival`): a delay step on a card others want can lose the deal; buying now never loses. Archetypes are
  now the pure `js/systems/archetypes.js` policies (ghost players), with literal rule cards — saver never buys with a loan and never buys
  a flagged deal unchecked, gambler never inspects and always offers 15 %, diversified auto-invests 40 % of the surplus, founder buys a
  rent asset only after a business-kind one. Their in-time rates moved accordingly (saver 7–67 %, gambler 0–7 %).
* Director decision (a): rules-4 time limits `maxMonths4` — w1 doctor 76 → 82, w4 engineer 60 → 69 (★★ / ★★★ unchanged).
* Director decision (b) + T3 review M8: `CH.TRIGGER` (crisis signal 0.4 / tile 0.15 / index drop 0.4; career warn 0.35 / degree 0.4 /
  promo 0.25 from month 24), sealed entry odds for car / moving / friend (0.7 / 0.7 / 0.65; w3 friend 1), cooldowns 30, one friend and
  one crisis run. The stories table now measures **time-limited** games (the spec's mode) and the months each business really ran.
* T3 review M7: guide highlights a flagged deal's inspection, prices a setup's capital, and follows the careful plan rule (rest only when
  tired / recovering). M3: reporting side income is the better choice (the late annual return bills the accountant too).

**Balance decisions — met.**
* (a) guideTapper per character ≥ 50 % in every world: w1 doctor 59 % (was 47 %), w4 engineer 56 % (was 37 %); the lowest characters
  are now w2 pm 54 % and w4 engineer 56 %. smart stays ≤ 80 % in w2–w4 (75 / 66 / 73 %).
* (b) chain starts: career 59–74 % (≤ 80 %), crisis 67–83 % (≤ 85 %); car 29–43 %, move 39–48 %, friend 34–43 % (band 25–60 %).

**Not met / to note.**
* A1's pooled ≥ 65 %: w2 guide 60 %, w4 63 % (w1 67 %, w3 76 %) — the per-character floor holds everywhere. The T3-review guide
  highlights raised w4 guide 54 → 63 % (engineer 37 → 56 %) without touching smart; w2 fell 65 → 60 % with competition on.
* smart in w1 stays high (91 %); the director accepted the current smart levels.
* Chain items per 12 months fell to a median ≈ 1.0–1.2 (target 2–3) with fewer starts; the review's follow-up steps (promo six months in,
  a second renewal, a friend follow-up, a back-to-the-car nudge) are content work for the stories lane.
* A7: `tax:report` is now always the better option when offered (T3 §9.3 honesty over T2's "not always better"); `plan:study` stays
  dominant until the degree (review m13 open).
