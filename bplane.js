

import { unit, cross, dot, sub, norm, sampleGaussian2D, gravitationalFocusingRadius } from './physics.js';

const MU_EARTH_KM3_S2 = 398600.4418; // km^3/s^2 (for local hyperbolic mapping)

// Compute Earth-relative hyperbolic frame and B-plane axes for incoming asymptote.
// Inputs: r_rel (km), v_rel (km/s)
// Returns { v_inf (km/s), S (unit), T_hat, R_hat } and a mapping to (xi,zeta) via projection.
function bPlaneFrame(r_rel, v_rel){
  const vinfVec = v_rel; // Assume far-field already: relative velocity at CA approximates v_inf direction
  const v_inf = norm(vinfVec);
  const S = unit(vinfVec);            // incoming asymptote unit vector
  const h = cross(r_rel, v_rel);      // specific angular momentum vector (km^2/s)
  const k = unit(h);
  const T_hat = unit(cross(k, S));    // T-axis in B-plane (perpendicular to S and orbital plane normal)
  const R_hat = unit(cross(S, T_hat));// completes right-handed triad
  return { v_inf, S, T_hat, R_hat };
}

export function toBPlane(r_rel_km, v_rel_kms){
  const { T_hat, R_hat } = bPlaneFrame(r_rel_km, v_rel_kms);
  const xi   = dot(r_rel_km, T_hat);
  const zeta = dot(r_rel_km, R_hat);
  return { xi, zeta };
}

function twoBodyStep(r_km, v_kms, dt_s){
  const r = r_km; const v = v_kms;
  const rmag = norm(r);
  const a_vec = rmag > 0 ? r.map(c => -MU_EARTH_KM3_S2 * c / (rmag*rmag*rmag)) : [0,0,0];
  const v_half = [ v[0] + 0.5*dt_s*a_vec[0], v[1] + 0.5*dt_s*a_vec[1], v[2] + 0.5*dt_s*a_vec[2] ];
  const r_new  = [ r[0] + dt_s*v_half[0],   r[1] + dt_s*v_half[1],   r[2] + dt_s*v_half[2]   ];
  const rmag2  = norm(r_new);
  const a_vec2 = rmag2 > 0 ? r_new.map(c => -MU_EARTH_KM3_S2 * c / (rmag2*rmag2*rmag2)) : [0,0,0];
  const v_new  = [ v_half[0] + 0.5*dt_s*a_vec2[0], v_half[1] + 0.5*dt_s*a_vec2[1], v_half[2] + 0.5*dt_s*a_vec2[2] ];
  return { r: r_new, v: v_new };
}

// Propagate under Earth gravity for dt seconds using multiple substeps for stability.
export function propagateNearEarth(r0_km, v0_kms, dt_s){
  const steps = Math.max(1, Math.ceil(Math.abs(dt_s)/120)); // 2-min steps
  const sgn = Math.sign(dt_s) || 1;
  let r = [...r0_km], v = [...v0_kms];
  for (let i=0; i<steps; i++){
    const { r: rn, v: vn } = twoBodyStep(r, v, sgn * Math.abs(dt_s/steps));
    r = rn; v = vn;
  }
  return { r, v };
}

// Monte Carlo impact probability on B-plane
// Args:
// - stateList: array of { r_rel_km:[x,y,z], v_rel_kms:[vx,vy,vz] } samples at close approach epoch
// - sigmas: 1-sigma dispersions in km on (xi,zeta) for cloning (optional, default small)
// - N: number of clones
// - v_inf_kms: characteristic v_inf for focusing radius
// Returns { P_impact, hits, N, b_imp_km }
export function monteCarloImpactProbability(stateList, v_inf_kms, N=2000, sigmas=[10,10]){
  if (!stateList?.length) return { P_impact: 0, hits: 0, N: 0, b_imp_km: 0 };
  const b_imp_km = gravitationalFocusingRadius(v_inf_kms);
  let hits = 0;
  const sx = sigmas[0] ?? 10, sz = sigmas[1] ?? 10;

  for (let k=0; k<N; k++){
    // Pick a nominal CA sample, then perturb in B-plane
    const s = stateList[k % stateList.length];
    const { xi, zeta } = toBPlane(s.r_rel_km, s.v_rel_kms);
    const [dx, dz] = sampleGaussian2D([0,0], [sx, sz]);
    const xi_k = xi + dx;
    const zt_k = zeta + dz;
    if ((xi_k*xi_k + zt_k*zt_k) <= b_imp_km*b_imp_km) hits += 1;
  }
  const P_impact = hits / N;
  return { P_impact, hits, N, b_imp_km };
}
