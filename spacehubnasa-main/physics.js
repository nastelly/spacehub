// physics.js — shared astrophysics/orbital helpers and math utilities
// Units note: unless stated otherwise, distances are in kilometers, velocities in km/s, times in seconds.

// Physical constants
export const G_SI = 6.67430e-11;                 // m^3 kg^-1 s^-2
export const MU_EARTH_SI = 3.986004418e14;       // m^3 s^-2
export const MU_SUN_SI   = 1.32712440018e20;     // m^3 s^-2
export const R_E_KM      = 6378.1363;            // km (equatorial mean)
export const V_ESC_E_KMS = 11.186;               // km/s (Earth escape at surface)
export const OMEGA_EARTH = 7.2921159e-5;         // rad/s (Earth rotation rate)

export const KM_TO_M  = 1000;
export const M_TO_KM  = 1/1000;
export const DAY_TO_S = 86400;
export const YEAR_TO_S = 365.25 * DAY_TO_S;

// Vector math (3D)
export function dot(a, b){ return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
export function norm(a){ return Math.hypot(a[0], a[1], a[2]); }
export function add(a, b){ return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
export function sub(a, b){ return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
export function scale(a, s){ return [a[0]*s, a[1]*s, a[2]*s]; }
export function cross(a, b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
export function unit(a){ const n = norm(a) || 1; return [a[0]/n, a[1]/n, a[2]/n]; }

// Rotations (right-handed, active). R3 rotates around +Z.
export function R3(theta){ const c=Math.cos(theta), s=Math.sin(theta); return [ [ c, -s, 0 ], [ s, c, 0 ], [ 0, 0, 1 ] ]; }
export function matVec(M, v){ return [ M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2], M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2], M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2] ]; }

// Random sampling (Gaussian)
let spare = null; // Box–Muller spare
export function randn(){
  if (spare != null){ const v = spare; spare = null; return v; }
  let u=0,v=0; while(u===0) u=Math.random(); while(v===0) v=Math.random();
  const mag = Math.sqrt(-2.0*Math.log(u));
  const z0 = mag*Math.cos(2*Math.PI*v);
  const z1 = mag*Math.sin(2*Math.PI*v);
  spare = z1; return z0;
}
export function sampleGaussian1D(mean, sigma){ return mean + sigma * randn(); }
export function sampleGaussian2D([mx,mz], [sx,sz]){ return [ sampleGaussian1D(mx, sx), sampleGaussian1D(mz, sz) ]; }

// Gravitational focusing radius for Earth (b-plane impact radius)
export function gravitationalFocusingRadius(v_inf_kms){
  // b_imp = R_E * sqrt(1 + (v_esc / v_inf)^2)
  return R_E_KM * Math.sqrt(1 + (V_ESC_E_KMS / Math.max(0.01, v_inf_kms))**2);
}

// Simple ECI→ECEF rotation with Earth spin. Precession-nutation matrix left as identity for MVP.
export function eciToEcef(r_eci_km, t_since_ref_s){
  const theta = OMEGA_EARTH * t_since_ref_s; // Greenwich angle advance since reference
  return matVec(R3(theta), r_eci_km);
}

// Latitude/longitude from ECEF vector
export function ecefToLatLonDeg(r_ecef_km){
  const x=r_ecef_km[0], y=r_ecef_km[1], z=r_ecef_km[2];
  const rxy = Math.hypot(x,y);
  const lat = Math.atan2(z, rxy) * 180/Math.PI;
  const lon = Math.atan2(y, x)   * 180/Math.PI;
  return { lat, lon };
}
