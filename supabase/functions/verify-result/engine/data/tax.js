// js/data/tax.js — Israeli 2026 payroll & investment tax parameters, split out of js/data/real.js so the engine can load
// them eagerly while the 36 KB market series stay lazy (history mode only). Source of truth = the data lead's TAX_IL;
// tests/engine.test.mjs asserts this object is deep-equal to real.js TAX_IL. Sources: docs-v3/sources.md.
export const TAX_IL = {
  year: 2026,
  // Monthly gross ₪ (employment income). Progressive: each rate applies only to the slice inside its bracket.
  // 2026 law (published 31-03-2026, retroactive to 01-2026) widened the 20% and 31% brackets.
  brackets: [
    { upTo: 7010, rate: 0.10 },
    { upTo: 10060, rate: 0.14 },
    { upTo: 19000, rate: 0.20 },
    { upTo: 25100, rate: 0.31 },
    { upTo: 46690, rate: 0.35 },
    { upTo: 60130, rate: 0.47 },
    { upTo: null, rate: 0.50 }, // 47% + 3% surtax (מס יסף) above 60,130/month
  ],
  creditPointValue: 242,       // ₪/month per credit point (2,904 ₪/year), unchanged 2025-2026
  defaultCreditPoints: 2.25,   // resident man; resident woman gets 2.75 (+ points per child, not modelled)
  bituachLeumi: {              // employee share, Bituach Leumi (national insurance) only
    reducedUpTo: 7703,         // ₪/month reduced-rate threshold, 2026
    employeeReduced: 0.0104,
    employeeFull: 0.07,
    maxInsurable: 51910,       // ₪/month ceiling 2026: no BL/health above this
  },
  health: {                    // employee health tax (מס בריאות), same threshold
    reducedUpTo: 7703,
    reduced: 0.0323,
    full: 0.0517,
  },
  pension: { employee: 0.06, employer: 0.065, severance: 0.06 }, // mandatory minimums (total 18.5%)
  capitalGains: 0.25,          // on real (inflation-adjusted) gain from securities; game may apply on nominal for simplicity
  rentalTrack: 0.10,           // 10% track on gross residential rent, no deductions
  rentalExemptUpTo: 5654,      // ₪/month residential rent fully exempt (exemption track), 2026
  notes: 'Simplified MONTHLY parameters for 2026, salaried Israeli resident. Not modelled: surtax on capital income, ' +
    'pension tax credits/deductions, credit points for children/degree/periphery, employer BL (4.51%/7.6%), ' +
    'betterment tax (מס שבח) details, purchase tax. Sources: docs-v3/sources.md.',
};
