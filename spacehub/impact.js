// impact.js — physically-informed MVP using cube-root blast scaling + Holsapple-style crater estimate
// Sources used:
// - Glasstone & Dolan, "The Effects of Nuclear Weapons" — cube-root blast scaling (overpressure vs yield). 
// - Holsapple (LPI) theory notes — π-group scaling for transient crater size in gravity/strength regimes.
// - Chelyabinsk airburst studies for airburst heuristics (height-of-burst amplifies 1–3 psi footprint).

// NOTE: This is an engineering estimate for outreach/education, not a hazard tool.

const TNT_J = 4.184e9;      // 1 kg TNT
const MT_J  = TNT_J * 1e9;  // 1 Mt TNT in Joules

export function estimateImpact({ d_m, v_kms, rho, angle_deg }) {
  const r = d_m/2;
  const volume = (4/3) * Math.PI * r**3;   // m^3
  const m = rho * volume;                  // kg
  const v = v_kms * 1000;                  // m/s
  const E = 0.5*m*v*v;                     // J
  const E_Mt = E / MT_J;                   // Mt TNT (equivalent)

  // Heuristic: shallow angle & modest size → большей вероятности воздушный взрыв
  // (inspired by Chelyabinsk: ~20 m, ~19 km/s, ~18° entry → airburst at ~30 km)
  const likelyAirburst = (d_m < 60 && angle_deg < 30) || (d_m < 40);

  // Crater size (very rough π-scaling inspired; gravity-dominated regime for larger bodies)
  // Dc ≈ C * (d_m)^0.78 * (v_kms)^0.44 with small density factor (~(rho/3000)^0.26). Calibration C≈0.012 for km.
  // This emulates order-of-magnitude from Holsapple notes and common public calculators.
  const Cc = 0.012;
  const Dc_km = likelyAirburst ? 0 : Cc * (d_m**0.78) * (Math.max(v_kms, 11)**0.44) * ((rho/3000)**0.26);

  const k1g = 4.0;   // ~1 psi
  const k3g = 2.6;   // ~3 psi
  const k5g = 2.0;   // ~5 psi

  // Airburst (высота подрыва увеличивает дальнюю зону 1–3 psi; ориентируемся на Chelyabinsk ~0.4–0.5 Mt с окнами на десятки км)
  // Вводим коэффициенты усиления дальнего поля (очень грубо и консервативно):
  const airAmp1 = 2.4, airAmp3 = 1.8, airAmp5 = 1.4;

  const cbrt = Math.cbrt(Math.max(E_Mt, 1e-6)); // чтобы нули не ломали

  const R1_km_ground = k1g * cbrt;
  const R3_km_ground = k3g * cbrt;
  const R5_km_ground = k5g * cbrt;

  const R1_km_air = R1_km_ground * airAmp1;
  const R3_km_air = R3_km_ground * airAmp3;
  const R5_km_air = R5_km_ground * airAmp5;

  const makesCrater = !likelyAirburst;

  const rings_km = makesCrater
    ? { r1: R1_km_ground, r3: R3_km_ground, r5: R5_km_ground }
    : { r1: R1_km_air,    r3: R3_km_air,    r5: R5_km_air    };

  return {
    energy_Mt: E_Mt,
    crater_km: Dc_km,
    rings_km,
    makesCrater
  };
}
