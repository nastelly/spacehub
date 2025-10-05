// gt.js — Gravity Tractor simulation and deflection mapping
// Implements:
// - aT = G * mt / rh^2 * cos(alpha)
// - Δv = aT * τ
// - Δs = (3/2) * a^(5/2) * Δv / (n * μ_sun)
// - Δb ≈ κ * Δs
// If Δb ≥ 2 * b_imp → success

import { G_SI, KM_TO_M, YEAR_TO_S, M_TO_KM } from './physics.js';

// Compute gravity tractor acceleration along-track at asteroid (km/s^2)
export function tractorAcceleration_kmps2({ mt_kg, rh_km, alpha_deg }){
  const rh_m = rh_km * KM_TO_M;
  const a_si = G_SI * mt_kg / (rh_m*rh_m) * Math.cos((alpha_deg||0) * Math.PI/180);
  return a_si * M_TO_KM; // km/s^2
}

// Campaign Δv in km/s
export function deltaV_kmps({ mt_kg, rh_km, alpha_deg, tau_years }){
  const a = tractorAcceleration_kmps2({ mt_kg, rh_km, alpha_deg });
  const tau_s = tau_years * YEAR_TO_S;
  return a * tau_s; // km/s
}

// Orbital miss distance proxy from Δv.
export function deltaS_km({ a_AU, mu_sun_km3s2, deltaV_kmps }){
  // n = sqrt(mu / a^3)
  const AU_KM = 149597870.7;
  const a_km = a_AU * AU_KM;
  const n = Math.sqrt(mu_sun_km3s2 / (a_km*a_km*a_km)); // rad/s
  // Use Δs = (3/2) * a^(5/2) * Δv / (n * μ_sun)
  // Convert powers carefully: a^(5/2) = a_km^(2.5)
  const num = 1.5 * Math.pow(a_km, 2.5) * deltaV_kmps;
  const den = n * mu_sun_km3s2;
  return num / den; // km
}

export function deltaB_km({ kappa=1.0, deltaS_km }){ return kappa * deltaS_km; }

export function hoverThrust_N({ mt_kg, M_ast_kg, rh_km }){
  const rh_m = rh_km * KM_TO_M;
  return (G_SI * mt_kg * M_ast_kg) / (rh_m*rh_m);
}

export function assessDeflection({ deltaB_km, b_imp_km }){
  const success = deltaB_km >= 2 * b_imp_km;
  const margin_km = deltaB_km - 2 * b_imp_km;
  return { success, margin_km };
}
