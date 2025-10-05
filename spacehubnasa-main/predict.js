const EARTH_RADIUS_KM = 6371.0088;
import { eciToEcef, ecefToLatLonDeg } from './physics.js';

function raySphereT(o, d, R) {
  const od = o.x * d.x + o.y * d.y + o.z * d.z;
  const oo = o.x * o.x + o.y * o.y + o.z * o.z;
  const r2 = R * R;
  const disc = od * od - (oo - r2);
  if (disc < 0) return null;
  const sqrtDisc = Math.sqrt(disc);
  const t1 = -od - sqrtDisc;
  const t2 = -od + sqrtDisc;
  if (t1 > 0) return t1;
  if (t2 > 0) return t2;
  return null;
}

function normalize(v) {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

function scale(v, s) { return { x: v.x * s, y: v.y * s, z: v.z * s }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }

function xyzToLatLon(p, R) {
  const lat = Math.asin(Math.max(-1, Math.min(1, p.y / R)));
  const lon = Math.atan2(p.z, p.x);
  return { latDeg: lat * 180 / Math.PI, lonDeg: lon * 180 / Math.PI };
}

export function predictImpact({ meshPosition, earthRadiusUnits, v_kms, angle_deg, mass_kg }) {
  const origin = { x: meshPosition.x, y: meshPosition.y, z: meshPosition.z };
  const dir = normalize({ x: -origin.x, y: -origin.y, z: -origin.z });
  const tUnits = raySphereT(origin, dir, earthRadiusUnits);
  const R = earthRadiusUnits;
  if (tUnits == null) {
    const r = Math.hypot(origin.x, origin.y, origin.z) || R;
    const p = scale(origin, R / r);
    const { latDeg, lonDeg } = xyzToLatLon(p, R);
    return { time_s: 0, lat: latDeg, lon: lonDeg, path_km: 0, angle_deg: angle_deg ?? 45 };
  }
  const hitPoint = add(origin, scale(dir, tUnits));
  let angDeg = angle_deg;
  if (angDeg == null) {
    const normal = normalize(hitPoint);
    const d = Math.abs(dir.x * normal.x + dir.y * normal.y + dir.z * normal.z);
    const angleWithNormal = Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
    angDeg = Math.max(0, 90 - angleWithNormal);
  }
  const unitsToKm = EARTH_RADIUS_KM / earthRadiusUnits;
  const s_km = tUnits * unitsToKm;
  const g = 0.00981;
  const g_parallel = g * Math.sin((angDeg || 45) * Math.PI / 180);
  const v0 = Math.max(0.001, v_kms || 0.001);
  const s = Math.max(0, s_km);
  let t_s;
  if (g_parallel > 1e-6) {
    const disc = v0 * v0 + 2 * g_parallel * s;
    t_s = (Math.sqrt(Math.max(0, disc)) - v0) / g_parallel;
  } else {
    t_s = s / v0;
  }
  if (!Number.isFinite(t_s) || t_s < 0) t_s = s / v0;
  const r_hit_eci_km = { x: hitPoint.x * unitsToKm, y: hitPoint.y * unitsToKm, z: hitPoint.z * unitsToKm };
  const r_ecef = eciToEcef([r_hit_eci_km.x, r_hit_eci_km.y, r_hit_eci_km.z], t_s);
  const { lat, lon } = ecefToLatLonDeg(r_ecef);
  return { time_s: t_s, lat, lon, path_km: s_km, angle_deg: angDeg };
}
