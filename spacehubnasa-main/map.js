
import { estimateImpact } from './impact.js';
import { diameterFromH_km, massFromDiameter, kineticEnergy_J, energyToMt, classifyBySize, locationRisk, torinoScale, classifyImpactZone } from './hazard.js';
import { gravitationalFocusingRadius } from './physics.js';
import { deltaV_kmps, deltaS_km, deltaB_km, tractorAcceleration_kmps2, hoverThrust_N, assessDeflection } from './gt.js';
import { monteCarloImpactProbability } from './bplane.js';

let map, impactPoint = [20, 20]; 
let ringsLayerIds = [];
let marker;

const MAPTILER_KEY = '';
const MAP_STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/topo-v2/style.json?key=${MAPTILER_KEY}`
  : 'https://demotiles.maplibre.org/style.json';

export function initImpactMap() {
  map = new maplibregl.Map({
    container: 'impactMap',
    style: MAP_STYLE_URL,
    center: impactPoint,
    zoom: 2.2,
    attributionControl: false
  });
  window.map = map;

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');

  map.on('load', () => {
    map.getContainer().style.backgroundColor = '#0d0d0d';

    const cc = map.getCanvasContainer();
    ['pointerdown','pointerup','click','dblclick','contextmenu'].forEach(evt => {
      cc.addEventListener(evt, (e) => e.stopPropagation(), { passive: true });
    });

    try {
      if (!map.getTerrain() && map.getSource('terrain')) {
        map.setTerrain({ source: 'terrain', exaggeration: 1.0 });
      }
    } catch {}

    placeMarker(impactPoint);
    const latLonEl = document.getElementById('impLatLon');
    if (latLonEl) latLonEl.value = `${impactPoint[1].toFixed(4)}, ${impactPoint[0].toFixed(4)}`;
    probeEnvironment(impactPoint).then(env=>{
      const box = document.getElementById('impactEnv');
      if (box) box.textContent = env.summary;
    });

    // клик по карте — новая точка
    map.on('click', async (e) => {
      impactPoint = [e.lngLat.lng, e.lngLat.lat];
      if (latLonEl) latLonEl.value = `${impactPoint[1].toFixed(4)}, ${impactPoint[0].toFixed(4)}`;
      placeMarker(impactPoint);
      const env = await probeEnvironment(impactPoint);
      const box = document.getElementById('impactEnv');
      if (box) box.textContent = env.summary;
    });

    // если модалка уже открыта — ресайзим после отрисовки
    setTimeout(()=>{ try{ map.resize(); }catch{} }, 80);
  });
}

function placeMarker(lonlat) {
  if (marker) marker.remove();
  marker = new maplibregl.Marker({ color: '#ffb703' }).setLngLat(lonlat).addTo(map);
}

// Programmatically set the impact point and update UI/marker
export function setImpactPoint(lonlat){
  impactPoint = lonlat;
  placeMarker(impactPoint);
  const latLonEl = document.getElementById('impLatLon');
  if (latLonEl) latLonEl.value = `${impactPoint[1].toFixed(4)}, ${impactPoint[0].toFixed(4)}`;
  try { map && map.easeTo({ center: impactPoint, duration: 600 }); } catch {}
}

export async function ensureEnvProbe() {
  return await probeEnvironment(impactPoint);
}

async function probeEnvironment([lon, lat]) {
  // elevation (meters) using terrain if available
  let elev = 0;
  try {
    const q = map.queryTerrainElevation?.([lon, lat], { exaggerated: false });
    elev = (q == null) ? 0 : q;
  } catch { elev = 0; }

  const pad = 6;
  const pt = map.project([lon,lat]);
  const features = map.queryRenderedFeatures([[pt.x - pad, pt.y - pad], [pt.x + pad, pt.y + pad]]);
  const isWater = features.some(f => (f.layer?.id || '').toLowerCase().includes('water'));
  const isUrban = features.some(f => {
    const lid = (f.layer?.id || '').toLowerCase();
    const klass = ((f.properties?.class || f.properties?.type || '') + '').toLowerCase();
    return (lid.includes('landuse') || lid.includes('landcover') || lid.includes('settlement')) &&
           /(residential|commercial|industrial|urban|settlement|city)/.test(klass);
  });

  let mult = 1.0;
  const notes = [];
  if (isWater) { mult *= 0.85; notes.push('Ocean impact: tsunami risk (not modeled).'); }
  else {
    if (elev >= 1500) { mult *= 0.85; notes.push('High relief (≥1500 m): partial shielding.'); }
    else if (elev <= 50) { mult *= 1.05; notes.push('Low elevation (≤50 m): slightly larger footprint.'); }
    if (isUrban) { mult *= 1.10; notes.push('Urban area: higher vulnerability.'); }
  }

  const summary = `Env @ ${lat.toFixed(4)}, ${lon.toFixed(4)} — elevation: ${Math.round(elev)} m, `
    + (isWater ? 'water' : (isUrban ? 'urban land' : 'land'))
    + `. Radius modifier ×${mult.toFixed(2)}. ${notes.join(' ')}`;

  return { elevation: elev, isWater, isUrban, modifier: mult, summary,
           modifiers: { radiusMultiplier: mult } };
}

export function runImpactScenario(env = { radiusMultiplier: 1.0 }) {
  const d_m  = +document.getElementById('impDiam').value || 100;
  const v_kms= +document.getElementById('impSpeed').value || 17;
  const rho  = +document.getElementById('impRho').value || 3000;
  const angle= +document.getElementById('impAngle').value || 45;

  // ВАЖНО: angle_deg
  const res = estimateImpact({ d_m, v_kms, rho, angle_deg: angle });

  const m = env.radiusMultiplier ?? 1.0;
  const rings = { r1: res.rings_km.r1 * m, r3: res.rings_km.r3 * m, r5: res.rings_km.r5 * m };

  drawRings(impactPoint, rings);

  // Hazard classification & impact probability via simplified B-plane Monte Carlo
  const mass_kg = massFromDiameter(d_m, rho);
  const E_J = kineticEnergy_J(mass_kg, v_kms);
  const E_Mt = energyToMt(E_J);
  const zone = classifyImpactZone(env);
  const zoneRisk = locationRisk(zone);
  const v_inf_kms = Math.max(0.1, v_kms - 11); // crude v_inf estimate from entry speed
  const b_imp_km = gravitationalFocusingRadius(v_inf_kms);
  const sigma = +document.getElementById('bpSigma').value || 1500; // km
  // Use current feed approach as nominal miss; otherwise assume 2*b_imp
  const ca = (window.currentApproach || {});
  const miss_km = Math.max(0, +ca.miss_km || 2 * b_imp_km);
  const stateList = [{ r_rel_km: [miss_km, 0, 0], v_rel_kms: [0, v_inf_kms, 0] }];
  const { P_impact: P_base } = monteCarloImpactProbability(stateList, v_inf_kms, 3000, [sigma, sigma]);
  const torino = torinoScale(P_base, E_Mt);

  const box = document.getElementById('impactResult');

  // Gravity tractor: compute Δv, Δs, Δb and success
  const gtMt = +document.getElementById('gtMt').value || 2000;
  const gtRh = +document.getElementById('gtRh').value || 1.0; // km (hover height over asteroid surface; treat as distance for acceleration)
  const gtTau= +document.getElementById('gtTau').value || 1.0; // years
  const gtAlp= +document.getElementById('gtAlpha').value || 0; // deg
  const gtAau= +document.getElementById('gtAau').value || 1.1; // AU
  const gtKap= +document.getElementById('gtKappa').value || 0.8;
  const muSun = 1.32712440018e11; // km^3/s^2

  const aT = tractorAcceleration_kmps2({ mt_kg: gtMt, rh_km: gtRh, alpha_deg: gtAlp });
  const dV = deltaV_kmps({ mt_kg: gtMt, rh_km: gtRh, alpha_deg: gtAlp, tau_years: gtTau });
  const dS = deltaS_km({ a_AU: gtAau, mu_sun_km3s2: muSun, deltaV_kmps: dV });
  const dB = deltaB_km({ kappa: gtKap, deltaS_km: dS });
  const { success, margin_km } = assessDeflection({ deltaB_km: dB, b_imp_km });
  const gtBox = document.getElementById('gtResult');
  if (gtBox){
    const T_hover = hoverThrust_N({ mt_kg: gtMt, M_ast_kg: mass_kg, rh_km: gtRh });
    gtBox.innerHTML = `a_T = ${(aT*1e6).toFixed(2)} mm/s² • Δv = ${dV.toFixed(5)} km/s • Δs = ${Math.round(dS).toLocaleString()} km<br>Δb ≈ ${Math.round(dB).toLocaleString()} km • Final miss ≈ ${Math.round(miss_km + dB).toLocaleString()} km → ${success ? '<b>deflection SUCCESS</b>' : '<b>insufficient</b>'}<br>Hover thrust ≈ ${Math.round(T_hover).toLocaleString()} N`;
  }

  // Recompute impact probability with GT via shifted b-plane mean (xi ← xi + Δb)
  const { P_impact: P_withGT } = monteCarloImpactProbability([
    { r_rel_km: [miss_km + dB, 0, 0], v_rel_kms: [0, v_inf_kms, 0] }
  ], v_inf_kms, 3000, [sigma, sigma]);

  // Report consolidated hazard block with baseline and GT
  const riskClass = classifyBySize(d_m);
  if (box) {
    let entryLine = '';
    try {
      const pe = window.predictedEntry;
      if (pe && Number.isFinite(pe.time_s)) {
        const tMin = pe.time_s / 60;
        const tStr = tMin < 90 ? `${tMin.toFixed(1)} min` : `${(pe.time_s/3600).toFixed(2)} h`;
        entryLine = `<br>Entry: <b>${pe.lat.toFixed(3)}, ${pe.lon.toFixed(3)}</b> • ETA: <b>${tStr}</b>`;
      }
    } catch {}
    box.innerHTML =
      `Energy ≈ <b>${res.energy_Mt.toFixed(2)} Mt TNT</b> • ${res.makesCrater ? `Crater ≈ <b>${res.crater_km.toFixed(2)} km</b>` : 'Airburst likely'}<br>`
      + `Overpressure radii: 1 psi ≈ <b>${rings.r1.toFixed(1)} km</b>, 3 psi ≈ <b>${rings.r3.toFixed(1)} km</b>, 5 psi ≈ <b>${rings.r5.toFixed(1)} km</b>`
      + `<br>Zone: <b>${zone}</b> • Risk: <b>${zoneRisk}</b> • Severity: <b>${riskClass}</b>`
      + `<br>Torino (baseline): <b>${torino}</b> • P_impact: <b>${P_base.toFixed(4)}</b>`
      + `<br>With GT: P_impact → <b>${P_withGT < 1e-4 ? '&lt; 0.0001' : P_withGT.toFixed(4)}</b> due to Δs = <b>${Math.round(dS).toLocaleString()} km</b>`
      + `<br><span class="impact-note">b_imp ≈ ${b_imp_km.toFixed(0)} km • b₀ ≈ ${Math.round(miss_km).toLocaleString()} km • b_final ≈ ${Math.round(miss_km + dB).toLocaleString()} km</span>`
      + entryLine
      + `<br><i>${zone === 'ocean' ? 'Ocean impact. Estimated 20–50 m tsunami potential. Regional threat.' : (zone === 'urban' ? 'Urban impact. Mass casualty risk. Severe damage.' : 'Land impact. Regional hazard.')}</i>`;
  }

  // Console narrative
  try { console.log(`Impact probability dropped from ${P_base.toFixed(4)} to ${P_withGT < 1e-4 ? '< 0.0001' : P_withGT.toFixed(4)} due to Δs = ${Math.round(dS).toLocaleString()} km`); } catch {}
}

export function clearImpactLayers() {
  if (!map) return;
  ringsLayerIds.forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  });
  ringsLayerIds = [];
  if (marker) { marker.remove(); marker = null; }
}

function drawRings(centerLonLat, rings) {
  clearImpactLayers();
  const circles = [
    { id: 'ring-1psi', km: rings.r1, color: '#3b82f6' },
    { id: 'ring-3psi', km: rings.r3, color: '#f59e0b' },
    { id: 'ring-5psi', km: rings.r5, color: '#ef4444' },
  ];
  circles.forEach(c => {
    const geojson = circlePolygon(centerLonLat, c.km, 256);
    map.addSource(c.id, { type: 'geojson', data: geojson });
    map.addLayer({ id: c.id, type: 'fill', source: c.id, paint: { 'fill-color': c.color, 'fill-opacity': 0.12 } });
    ringsLayerIds.push(c.id);
  });
  placeMarker(centerLonLat);
  map.fitBounds(geoBounds(centerLonLat, rings.r1), { padding: 30, duration: 600 });
}

// геодезический круг
function circlePolygon([lon, lat], radiusKm, steps=128) {
  const coords = [];
  const R = 6371.0088;
  const latRad = toRad(lat), lonRad = toRad(lon);
  const angDist = radiusKm / R;
  for (let i=0; i<=steps; i++){
    const brng = 2*Math.PI*i/steps;
    const sinLat = Math.sin(latRad)*Math.cos(angDist) + Math.cos(latRad)*Math.sin(angDist)*Math.cos(brng);
    const dLat = Math.asin(sinLat);
    const dLon = lonRad + Math.atan2(
      Math.sin(brng)*Math.sin(angDist)*Math.cos(latRad),
      Math.cos(angDist)-Math.sin(latRad)*sinLat
    );
    coords.push([ toDeg(dLon), toDeg(dLat) ]);
  }
  return { type:'Feature', geometry:{ type:'Polygon', coordinates:[coords] }, properties:{} };
}
function geoBounds(center, km){ const R=6371.0088, dDeg=(km/R)*(180/Math.PI); const [lon,lat]=center; return [[lon-dDeg,lat-dDeg],[lon+dDeg,lat+dDeg]]; }
const toRad = d => d*Math.PI/180; const toDeg = r => r*180/Math.PI;
