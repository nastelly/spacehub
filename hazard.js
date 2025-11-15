

import { R_E_KM } from './physics.js';

export function diameterFromH_km(H, pV=0.14){
  if (H == null) return null;
  const d_km = 1329 * 10**(-H/5) / Math.sqrt(Math.max(1e-6, pV));
  return d_km;
}

export function massFromDiameter(d_m, rho=3000){
  const r = d_m/2; return rho * (4/3) * Math.PI * r*r*r; 
}

export function kineticEnergy_J(mass_kg, v_kms){
  const v = v_kms * 1000; return 0.5 * mass_kg * v * v;
}

export function energyToMt(E_J){ return E_J / 4.184e15; }

export function classifyBySize(d_m){
  if (d_m <= 20) return 'airburst, low risk';
  if (d_m < 150) return 'regional catastrophe';
  if (d_m >= 300) return 'continental/global risk';
  return 'significant local/regional damage';
}

export function locationRisk(impactZone){
  if (impactZone === 'ocean') return 'tsunami';
  if (impactZone === 'urban') return 'mass casualty';
  if (impactZone === 'desert') return 'minimal';
  return 'moderate';
}

export function torinoScale(P_impact, E_Mt){
  if (P_impact < 1e-6) return 0;
  const hazard = Math.log10(Math.max(1e-9, P_impact)) + Math.log10(Math.max(1e-6, E_Mt));
  const x = Math.max(0, Math.min(10, Math.round(2 + 2.2 * hazard)));
  return x;
}

export function classifyImpactZone(env){
  if (!env) return 'land';
  if (env.isWater) return 'ocean';
  if (env.isUrban) return 'urban';
  return 'land';
}
