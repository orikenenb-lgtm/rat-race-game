# QA report v2 (independent persona playtest) — saved by orchestrator from the QA agent's message
Shots: /home/claude/qa/shots/ · scripts/logs: /home/claude/qa/tools/

## Blockers
- B1 "חזרה למשחק" banner left roll disabled — fixed in latest game.js; add regression assert (#roll enabled after banner resume, incl. pending card).
- B2 Ranked game restarts from turn 0 with same seed when local save missing (wipe / 2nd device) → challenges replayable with knowledge. Fix: server checkpoint (orchestrator adds rr_checkpoint + rr_begin returns checkpoint).
- B3 Credit 5%/mo is CHEAPER than bank loan 10%/mo (w1; w2 loan 6%+rate) — contradicts the lesson "credit is the most expensive debt". "לשלם" with too little cash takes a ₪5,000-rounded loan at 10% (e.g. ₪3,800 vacation, ₪2,046 cash → ₪500/mo vs ₪190/mo installments). tipFor blames forced toys on careful players. Fix: credit most expensive (e.g. loan 2%/mo, credit 4%/mo) + re-sim; tipFor ignores forced expenses.
- B4 MOON: engine never applied card price for kind:'crypto' (orchestrator has now fixed tradePending: card prices apply to all tickers except bond/gold/usd). With prices applied: crash ₪0.05 then "new coin ₪1" ×20, ₪4 ×80; buying at ₪1 EV ≈ ×7; careful+MOON raises driver win 59%→77%; `moon_landing` achievement rewards it. Fix: "new coin" card = new ticker or wipes old holdings; crash more likely than pump (EV<1); replace moon_landing with "יצאת בזמן — הפעם היה מזל"-style.
- B5 Tutorial starter deal can cost ₪500/mo loan to earn ₪450 (if cash spent first). Crisis right after → auto-loan ₪10,000 (₪1,000/mo) with no warning. Fix: starter down = min(5000, cash); no crisis in first 3 turns of tutorial; crisis/doodad/expense cards show "חסרים ₪X — הבנק ייתן הלוואה של ₪Y (עולה ₪Z בחודש)".
- B6 Bidi: end screen negative net worth "₪79,790−" (lobby renderEnd stat cells not isolated); ROI box reads backwards ("בשנה 108% = ₪5,000 ÷ 12 × ₪450") → wrap equation in <bdi dir="ltr">, keep words outside; ui.iso() regex `₪[\d,.]+` swallows trailing comma/period → use `₪\d{1,3}(?:,\d{3})*(?:\.\d+)?`; "10%–15%" renders reversed.

## Top 10 retention/fun issues
1. w1 bankrupts the target audience: highlighted-button tapper 100% bankrupt (teacher/driver ~turn 28–31), impulsive teen 97–99%, careful driver 41–45%; same teen wins 43–75% in w3/w4. Causes: highlighted button is always "buy" even on money-losing deals (penthouse via ₪40K loan: −₪900 −₪4,000/mo); unlimited w1 bank credit (₪300K loans by month 13); 10%/mo loans; forced toys paid by auto-loans. Measured: highlighting "לוותר" whenever cashflow − loan cost ≤ 0 → tapper win 0%→92% teacher, 0%→54% driver. Also show ONE net number on the buy button ("בסוף החודש: −₪4,900"). First-ever bankruptcy → mentor bail-out + explanation instead of game over.
2. First 60 seconds random: tutorial first card is the starter deal only 49% (17% forced expense, 17% market/trade, 16% payday). Coach step 3 bubble covers the deal numbers. Fix: tutorial (free only) forces first roll onto an O tile.
3. On phones the mentor is invisible during decisions (card bottom sheet z6 covers mentor bar z3); mentor text cut at 3 lines. Fix: show ev.mentor as a 1–2 line speech bubble at the top of the card; tap expands mentor bar.
4. "Tempting expenses" can't be refused ("אין ברירה — זה כבר קרה" next to w2 mentor "אתה קונה את זה, או שזה קונה אותך?"). Fix: wants get "לוותר" (needs like car repair/fines stay mandatory); end screen "ויתרת על ₪X פיתויים" + achievement; rebalance.
5. Sharing a free game doesn't create a challenge (bare homepage link). Fix: `?duel=w1.teacher.<seed>` starts same seed as friendly duel + Wordle-style line "🐭 השכונה · מורה · 29 חודשים ★☆☆".
6. Boards compare only months; ties broken by finish time; rank shown below 6–7 achievement cards. Fix: tie-break net worth then passive; rank right under stars; (later) decision comparison.
7. Games long (w1 teacher 53 turns, driver 61, doctor 82, w2 63–76 for careful play); daily 40 months ≈ 65 turns = 8–12 min; 4–15% of cards do nothing to you (BANK dividend w/o shares, "עונת חגים" w/o businesses, "נזילה!" w/o apartments, unaffordable mega-deals). Fix: auto-resolve irrelevant cards as 1-s toast; offer turbo after 2nd game; daily ≈ 24 months sprint.
8. World mechanics barely change outcomes (careful ablations): w3 never hedging/insuring is faster (35 vs 37) & more in time (96% vs 89%); w2 always-variable beats "lock when low" by 5 months; w4 skipping startups costs 4 months; gold no effect. Fix: w3 ±15% dollar shocks that can sink an unhedged importer + cheaper hedge; w2 +3% rate shock on bank tile punishing over-borrowed variable; w4 rarer but bigger exits.
9. Loss screen doesn't explain the loss / blames the wrong thing. Fix: "הדליפות שלך": total interest paid (stats.interestPaid), forced loans, toys, money-losing assets; tip from the biggest leak; "עוד פעם — אותו לוח" (same seed, free).
10. Social modes drop new players into w3/w4 with no onboarding (daily w3 today, weekly w4). Fix: 2 coach marks the first time a player enters any world (incl. via daily); weekly in w1/w2; w1 in daily rotation ≥2×/week.

## Confusion / learning / polish
- Trade window: buy/sell disabled until qty chosen (first tap does nothing) → default qty 10 (or 1 unit step); show unrealised gain "+₪31,000 אם תמכור עכשיו".
- w1 deal card shows cashflow and loan cost separately; w2 buy label "(+₪9,340)" ignores the ₪1,750 loan → show net.
- Statement sheet: cash not listed under assets (assets − liabilities ≠ net worth shown).
- Picking a character on the world page silently deletes the existing save → confirm.
- Free-mode intro says "כולם מקבלים אותן קוביות" (only true in challenges). repairNone says "יום אחד יהיו לך נכסים" to a player owning businesses. ROI coach "10–15% interesting" contradicts 50–150% deals & 120%/yr loans — teach ROI vs loan cost.
- Group page needs manual refresh to see new challenges → auto-refresh.
- Hebrew: "הריבית ירד" → ירדה/עלתה (ui.js fromTo); "1 יבואנים · 0 יצואנים"; "≥" in goal text mirrored → words; mentor always masculine.
- After recovery-code restore, profile shows 0 games/wins/best next to ★1 (not synced).
- Daily board order of ties changes between loads.
- Learning: loans "10% בחודש" ≈ 10× real; w1 bank lends unlimited (₪300K to a ₪9K teacher) — teach "the bank checks you can repay"; market buy-out offers ×1.6/×2 of purchase price even for money-losing assets (penthouse −₪900/mo got +₪232K offer) → base on value & cashflow; w2 quiz rewards fixing the rate but game punishes it; w3 hedging lesson inverted; checks/donations can be bank-funded with neutral labels; moon_landing.
- Polish: HUD stat boxes on 390px are 6–7px too narrow (clip on 360px); scene renders every frame forever (incl. under the lobby) → render on demand / 30fps idle / pause under lobby; lobby waits for full 3D + w1 models (~2.2MB) → show lobby first; 6–7 achievement cards push lesson/rank below sticky buttons → collapse "+5 הישגים".

## Works great — don't break
Map, world art, star trail, end celebration; worlds distinct within a turn; lobby "המשימה הבאה"; world page with per-character star targets; group flow (create → code/link/WhatsApp → friend joins in 2 taps; share texts with group link); determinism, save-every-action, resume, exactly-once ranked submit, zero console errors; statement sheet maths; deal cards (w2 rate table, w3 dollar table, w4 meters with honest odds); near-miss lines; banked stars; titles/pawns.

## Verdicts
נועם 14: again 4/10, share 3/10 · מיכל 42: again 6/10 (8 after B3/B4/#4), share 4/10 · 4 friends: again 6/10, share 7/10.
