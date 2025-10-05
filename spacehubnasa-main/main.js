
import * as THREE from 'https://cdn.skypack.dev/three@0.128.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.128.0/examples/jsm/controls/OrbitControls.js';
import { initImpactMap, runImpactScenario, clearImpactLayers, ensureEnvProbe, setImpactPoint } from './map.js';
import { tractorAcceleration_kmps2, deltaV_kmps } from './gt.js';
import { predictImpact } from './predict.js';

const NASA_API_KEY = 'Azho9k9xC9zDYd6QBGbvUbsrb8bHndqPKDWKbLld';

const canvas = document.getElementById('orreryCanvas');
const neoTooltip = document.getElementById('neoTooltip');

const currentTimeEl = document.getElementById('current-time');
const timeSpeedEl   = document.getElementById('timespeed');

const btnFastBack   = document.getElementById('fastbackward-button');
const btnBack       = document.getElementById('backward-button');
const btnNow        = document.getElementById('now-button');
const btnForward    = document.getElementById('forward-button');
const btnFastFwd    = document.getElementById('fastforward-button');

const fromInput = document.getElementById('fromDate');
const toInput   = document.getElementById('toDate');
const loadBtn   = document.getElementById('loadNeo');

const openImpactBtn  = document.getElementById('openImpact');
const impactModal    = document.getElementById('impactModalBackdrop');
const closeImpactBtn = document.getElementById('closeImpact');
const runImpactBtn   = document.getElementById('runImpact');
const clearImpactBtn = document.getElementById('clearImpact');

async function fetchJSON(url){ const r = await fetch(url); if(!r.ok) throw new Error(`HTTP ${r.status}: ${url}`); return r.json(); }
function pad2(n){ return (n<10?'0':'')+n; }
function ymd(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function logMap(x, inMin, inMax, outMin, outMax){
  const l1 = Math.log(inMin), l2 = Math.log(inMax);
  const t  = Math.max(0, Math.min(1, (Math.log(x)-l1)/(l2-l1)));
  return outMin + (outMax-outMin)*t;
}

const neoModal      = document.getElementById('neoModal');
const neoModalTitle = document.getElementById('neoModalTitle');
const neoModalBody  = document.getElementById('neoModalBody');
const neoModalClose = document.getElementById('neoModalClose');
const neoModalJPL   = document.getElementById('neoModalJPL');

function showNeoModal(){ neoModal.style.display = 'flex'; canvas.style.pointerEvents = 'none'; }
function hideNeoModal(){ neoModal.style.display = 'none'; canvas.style.pointerEvents = 'auto'; }
neoModalClose.addEventListener('click', hideNeoModal);

let neoBackdropDown = null;
neoModal.addEventListener('pointerdown', (e)=>{
  if (e.target === neoModal) neoBackdropDown = { x:e.clientX, y:e.clientY, t:performance.now() }; else neoBackdropDown = null;
});
neoModal.addEventListener('pointerup', (e)=>{
  if (!neoBackdropDown) return;
  if (e.target !== neoModal) { neoBackdropDown = null; return; }
  const dx = Math.abs(e.clientX - neoBackdropDown.x);
  const dy = Math.abs(e.clientY - neoBackdropDown.y);
  const dt = performance.now() - neoBackdropDown.t;
  if (dx < 5 && dy < 5 && dt < 600) hideNeoModal();
  neoBackdropDown = null;
});

let mapReady = false;
function openImpact(){
  impactModal.style.display = 'flex';
  canvas.style.pointerEvents = 'none';
  if (!mapReady) { initImpactMap(); mapReady = true; }
  setTimeout(()=> { try { window.map && window.map.resize(); } catch{} }, 80);
}
function closeImpact(){
  impactModal.style.display = 'none';
  canvas.style.pointerEvents = 'auto';
}
openImpactBtn.addEventListener('click', openImpact);
closeImpactBtn.addEventListener('click', closeImpact);

let backdropDown = null;
impactModal.addEventListener('pointerdown', (e) => {
  if (e.target === impactModal) backdropDown = { x: e.clientX, y: e.clientY, t: performance.now() };
  else backdropDown = null;
});
impactModal.addEventListener('pointerup', (e) => {
  if (!backdropDown) return;
  if (e.target !== impactModal) { backdropDown = null; return; }
  const dx = Math.abs(e.clientX - backdropDown.x);
  const dy = Math.abs(e.clientY - backdropDown.y);
  const dt = performance.now() - backdropDown.t;
  if (dx < 5 && dy < 5 && dt < 600) closeImpact();
  backdropDown = null;
});

runImpactBtn.onclick = async () => {
  const env = await ensureEnvProbe();
  document.getElementById('impactEnv').textContent = env.summary;
  runImpactScenario(env.modifiers);
};
clearImpactBtn.onclick = () => {
  clearImpactLayers();
  document.getElementById('impactResult').textContent = '';
  document.getElementById('impactEnv').textContent = '';
  document.getElementById('impLatLon').value = '0, 0';
};

function setupIconFallbacks(){
  const pairs = [
    [btnFastBack, '<<'],
    [btnBack, '<'],
    [btnNow, 'Now'],
    [btnForward, '>'],
    [btnFastFwd, '>>']
  ];
  pairs.forEach(([btn,label])=>{
    if(!btn) return;
    const img = btn.querySelector('.time-control-icon');
    if(!img){ btn.textContent = label; return; }
    img.addEventListener('error', ()=>{ img.style.display='none'; btn.textContent = label; });
  });
}

function setupAutoRecompute(){
  const ids = ['gtMt','gtRh','gtTau','gtAlpha','gtAau','gtKappa','bpSigma','impDiam','impSpeed','impRho','impAngle'];
  const debounce = (fn, ms)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const trigger = debounce(async ()=>{ try{ const env = await ensureEnvProbe(); runImpactScenario(env.modifiers); }catch{} }, 200);
  ids.forEach(id=>{ const el = document.getElementById(id); if(el){ el.addEventListener('input', trigger); el.addEventListener('change', trigger); } });
}

setupIconFallbacks();
setupAutoRecompute();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.0001, 5000);
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.07;

scene.add(new THREE.AmbientLight(0xffffff, 0.25));
const earthLight = new THREE.PointLight(0x87cefa, 2.0, 5);
earthLight.position.set(0,0,0); scene.add(earthLight);

camera.position.set(0, 0.12, 0.42);
controls.target.set(0,0,0); controls.update();

window.addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const EARTH_R = 0.02;
try { window.EARTH_R_WORLD = EARTH_R; } catch {}
let earth;
try {
  const tex = await new THREE.TextureLoader().loadAsync('assets/body_textures/8k_earth_daymap.jpg');
  earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 64, 64), new THREE.MeshPhongMaterial({ map: tex }));
} catch {
  earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 64, 64), new THREE.MeshPhongMaterial({ color: 0x3a7bd5 }));
}
scene.add(earth);

const neoGroup = new THREE.Group(); scene.add(neoGroup);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
canvas.addEventListener('mousemove', (e)=>{
  mouse.x =  (e.clientX / innerWidth)  * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(neoGroup.children);
  if (hits.length){
    const d = hits[0].object.userData;
    neoTooltip.innerHTML = `
      <div style="font-weight:700;margin-bottom:4px">${d.name}</div>
      <div>Date: ${d.caDate}</div>
      <div>Miss distance: ${Math.round(d.miss_km).toLocaleString()} km</div>
      <div>Velocity: ${(+d.v_kms).toFixed(2)} km/s</div>
      <div>H: ${d.H ?? '—'} | Size: ${d.est_diam ?? '—'}</div>
    `;
    neoTooltip.style.left = (e.clientX+12)+'px';
    neoTooltip.style.top  = (e.clientY+12)+'px';
    neoTooltip.style.display = 'block';
  } else neoTooltip.style.display = 'none';
});

canvas.addEventListener('click', async (e)=>{
  mouse.x =  (e.clientX / innerWidth)  * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(neoGroup.children);
  if (!hits.length) return;
  const d = hits[0].object.userData;
  const obj = hits[0].object;
  try { window.currentApproach = d; } catch {}
  try{
    const lookupUrl = `https://api.nasa.gov/neo/rest/v1/neo/${d.id}?api_key=${encodeURIComponent(NASA_API_KEY)}`;
    const neo = await fetchJSON(lookupUrl);

    const od = neo.orbital_data || {};
    const className = od.orbit_class?.orbit_class_description || od.orbit_class?.orbit_class_type || '—';
    const sstr = neo.designation || neo.name || d.id;
    const jplUrl = `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(sstr)}`;
    neoModalJPL.href = jplUrl;

    neoModalTitle.textContent = neo.name || `Asteroid ${d.id}`;
  
    let infoHtml = `
      <div class="kv"><div>ID (JPL SPK):</div><div>${neo.neo_reference_id || d.id}</div></div>
      <div class="kv"><div>Designation:</div><div>${neo.designation || '—'}</div></div>
      <div class="kv"><div>Absolute mag (H):</div><div>${neo.absolute_magnitude_h ?? '—'}</div></div>
      <div class="kv"><div>Hazardous:</div><div>${neo.is_potentially_hazardous_asteroid ? 'Yes' : 'No'}</div></div>
      <div class="kv"><div>Estimated diameter:</div><div>${
        neo.estimated_diameter?.meters
          ? `${Math.round(neo.estimated_diameter.meters.estimated_diameter_min)}–${Math.round(neo.estimated_diameter.meters.estimated_diameter_max)} m`
          : '—'
      }</div></div>

      <div style="margin-top:6px;font-weight:700">Orbital data</div>
      <div class="kv"><div>Class:</div><div>${className}</div></div>
      <div class="kv"><div>a (AU):</div><div>${od.semi_major_axis ?? '—'}</div></div>
      <div class="kv"><div>e:</div><div>${od.eccentricity ?? '—'}</div></div>
      <div class="kv"><div>i (deg):</div><div>${od.inclination ?? '—'}</div></div>
      <div class="kv"><div>Ω (deg):</div><div>${od.ascending_node_longitude ?? '—'}</div></div>
      <div class="kv"><div>ω (deg):</div><div>${od.perihelion_argument ?? '—'}</div></div>
      <div class="kv"><div>M (deg):</div><div>${od.mean_anomaly ?? '—'}</div></div>
      <div class="kv"><div>Epoch (JD):</div><div>${od.epoch_jd ?? '—'}</div></div>

      <div style="margin-top:6px;font-weight:700">This approach (from feed)</div>
      <div class="kv"><div>Date:</div><div>${d.caDate}</div></div>
      <div class="kv"><div>Miss distance:</div><div>${Math.round(d.miss_km).toLocaleString()} km</div></div>
      <div class="kv"><div>Velocity:</div><div>${(+d.v_kms).toFixed(2)} km/s</div></div>`;

    try {
      const meshPos = obj.position;
      const meters = neo.estimated_diameter?.meters;
      let mass_kg;
      if (meters) {
        const dAvg = (meters.estimated_diameter_min + meters.estimated_diameter_max) / 2; // m
        const rho = 3000; 
        const r = dAvg / 2;
        mass_kg = (4/3) * Math.PI * r*r*r * rho;
      }
      const pred = predictImpact({
        meshPosition: { x: meshPos.x, y: meshPos.y, z: meshPos.z },
        earthRadiusUnits: EARTH_R,
        v_kms: +d.v_kms || 17,
        mass_kg
      });
      try { window.predictedEntry = pred; } catch {}
      const tMin = pred.time_s / 60;
      const tHr = pred.time_s / 3600;
      infoHtml += `
        <div style="margin-top:6px;font-weight:700">Predicted impact (simplified)</div>
        <div class="kv"><div>ETA:</div><div>${tMin < 90 ? `${tMin.toFixed(1)} min` : `${tHr.toFixed(2)} h`}</div></div>
        <div class="kv"><div>Entry angle:</div><div>${pred.angle_deg.toFixed(1)}°</div></div>
        <div class="kv"><div>Landing (lat, lon):</div><div>${pred.lat.toFixed(3)}, ${pred.lon.toFixed(3)}</div></div>
      `;

      try {
        setImpactPoint([pred.lon, pred.lat]);
        const meters2 = neo.estimated_diameter?.meters;
        if (meters2) {
          const dAvg2 = (meters2.estimated_diameter_min + meters2.estimated_diameter_max)/2;
          document.getElementById('impDiam').value = Math.max(10, Math.round(dAvg2));
        }
        document.getElementById('impSpeed').value = Math.max(11, (+d.v_kms).toFixed(1));
        document.getElementById('impAngle').value = Math.round(pred.angle_deg);
      } catch {}
    } catch (predErr) { console.warn('Prediction failed:', predErr); }

    neoModalBody.innerHTML = infoHtml;

    const meters = neo.estimated_diameter?.meters;
    if (meters) {
      const dAvg = (meters.estimated_diameter_min + meters.estimated_diameter_max)/2;
      document.getElementById('impDiam').value = Math.max(10, Math.round(dAvg));
    }
    document.getElementById('impSpeed').value = Math.max(11, (+d.v_kms).toFixed(1));

    showNeoModal();
  }catch(err){
    console.error(err);
    alert('Could not retrieve full asteroid data.');
  }
});

let timeOffsetDays = 0;
function updateDateInputs(){
  const base = new Date(); base.setHours(12,0,0,0); base.setDate(base.getDate()+timeOffsetDays);
  const start = new Date(base); start.setDate(start.getDate()-1);
  const end   = new Date(base); end.setDate(end.getDate()+1);
  fromInput.value = ymd(start); toInput.value = ymd(end);
}
function updateTimeLabels(){
  const d = new Date(); d.setDate(d.getDate()+timeOffsetDays);
  currentTimeEl.textContent = d.toUTCString();
  timeSpeedEl.textContent   = `Window: ${fromInput.value} → ${toInput.value}`;
}
btnFastBack.onclick = ()=> shiftDays(-7);
btnBack.onclick     = ()=> shiftDays(-1);
btnNow.onclick      = ()=> { timeOffsetDays = 0; updateDateInputs(); updateTimeLabels(); loadNEOs(); };
btnForward.onclick  = ()=> shiftDays(+1);
btnFastFwd.onclick  = ()=> shiftDays(+7);
function shiftDays(k){ timeOffsetDays += k; updateDateInputs(); updateTimeLabels(); loadNEOs(); }

const API_FEED = 'https://api.nasa.gov/neo/rest/v1/feed';
loadBtn.onclick = ()=> loadNEOs();

async function loadNEOs(){
  try{
    loadBtn.disabled = true;
    neoGroup.clear();
    const start = fromInput.value, end = toInput.value;

    const d1=new Date(start), d2=new Date(end);
    if ((d2-d1)/86400000 > 7){ alert('Date window must be ≤ 7 days (NASA NeoWs).'); loadBtn.disabled = false; return; }

    const feed = await fetchJSON(`${API_FEED}?start_date=${start}&end_date=${end}&api_key=${encodeURIComponent(NASA_API_KEY)}`);
    const entries = [];
    for (const [, list] of Object.entries(feed.near_earth_objects || {})){
      for (const neo of list){
        const ca = (neo.close_approach_data||[]).find(c => c.orbiting_body === 'Earth'); if(!ca) continue;
        entries.push({
          id: neo.id, name: neo.name, H: neo.absolute_magnitude_h,
          est_diam: neo.estimated_diameter?.meters
            ? `${Math.round(neo.estimated_diameter.meters.estimated_diameter_min)}–${Math.round(neo.estimated_diameter.meters.estimated_diameter_max)} m` : null,
          caDate: ca.close_approach_date_full || ca.close_approach_date,
          miss_km: +ca.miss_distance.kilometers,
          v_kms: +ca.relative_velocity.kilometers_per_second
        });
      }
    }

    for (const d of entries){
      const r = logMap(d.miss_km, 1e4, 5e7, 0.05, 1.4);
      const ang = Math.random()*Math.PI*2; const tilt = (Math.random()-0.5)*0.35;
      const x = r*Math.cos(ang), y = r*tilt, z = r*Math.sin(ang);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      dot.position.set(x,y,z); dot.userData = d; neoGroup.add(dot);
    }
    drawRangeRings();
  } catch (e){
    console.error(e); alert('Failed to load NeoWs. Check dates and API key in code.');
  } finally { loadBtn.disabled = false; }
}

function drawRangeRings(){
  const radiiKm = [40000, 400000, 4e6, 4e7];
  const group = new THREE.Group();
  radiiKm.forEach(km=>{
    const r = logMap(km, 1e4, 5e7, 0.05, 1.4);
    const geo = new THREE.RingGeometry(r*0.995, r*1.005, 128);
    const mat = new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide, transparent:true, opacity:0.25 });
    const ring = new THREE.Mesh(geo, mat); ring.rotation.x = Math.PI/2; group.add(ring);
  });
  const old = scene.getObjectByName('rangeRings'); if (old) scene.remove(old);
  group.name = 'rangeRings'; scene.add(group);
}

(function initDates(){
  const today = new Date(); today.setHours(12,0,0,0);
  const start = new Date(today); start.setDate(start.getDate()-1);
  const end   = new Date(today); end.setDate(end.getDate()+1);
  fromInput.value = ymd(start); toInput.value = ymd(end);
  currentTimeEl.textContent = today.toUTCString();
  timeSpeedEl.textContent = `Window: ${fromInput.value} → ${toInput.value}`;
})();
loadNEOs();

function animate(){ requestAnimationFrame(animate); earth.rotation.y += 0.0018; controls.update(); renderer.render(scene, camera); }
animate();
