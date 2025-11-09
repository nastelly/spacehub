
import * as THREE from 'https://cdn.skypack.dev/three@0.128.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.128.0/examples/jsm/controls/OrbitControls.js';
import { initImpactMap, runImpactScenario, clearImpactLayers, ensureEnvProbe, setImpactPoint } from './map.js';
import { predictImpact } from './predict.js';
import { simulateAsteroidImpact, generateWithGoogleGenAI } from './gemiClient.js';

const NASA_API_KEY = 'Azho9k9xC9zDYd6QBGbvUbsrb8bHndqPKDWKbLld';


const canvas = document.getElementById('orreryCanvas');
const neoTooltip = document.getElementById('neoTooltip');
const currentTimeEl = document.getElementById('current-time');
const timeSpeedEl = document.getElementById('timespeed');
const fromInput = document.getElementById('fromDate');
const toInput = document.getElementById('toDate');
const loadBtn = document.getElementById('loadNeo');


const btnFastBack = document.getElementById('fastbackward-button');
const btnBack = document.getElementById('backward-button');
const btnNow = document.getElementById('now-button');
const btnForward = document.getElementById('forward-button');
const btnFastFwd = document.getElementById('fastforward-button');


const openImpactBtn = document.getElementById('openImpact');
const impactModal = document.getElementById('impactModalBackdrop');
const closeImpactBtn = document.getElementById('closeImpact');
const runImpactBtn = document.getElementById('runImpact');
const clearImpactBtn = document.getElementById('clearImpact');
const simulateAIBtn = document.getElementById('simulateWithAI');
const clarifyBtn = document.getElementById('clarifyFormulasBtn');

// Gemini modal
const geminiModal = document.getElementById('geminiModalBackdrop');
const geminiModalBody = document.getElementById('geminiModalBody');
const geminiModalClose = document.getElementById('geminiModalClose');

// NEO modal
const neoModal = document.getElementById('neoModal');
const neoModalTitle = document.getElementById('neoModalTitle');
const neoModalBody = document.getElementById('neoModalBody');
const neoModalClose = document.getElementById('neoModalClose');
const neoModalJPL = document.getElementById('neoModalJPL');

// Three.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.0001, 5000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.25));
const earthLight = new THREE.PointLight(0x87cefa, 2.0, 5);
earthLight.position.set(0, 0, 0);
scene.add(earthLight);

camera.position.set(0, 0.12, 0.42);
controls.target.set(0, 0, 0);
controls.update();

// Global variables
const EARTH_R = 0.02;
let earth, neoGroup, mapReady = false;
let timeOffsetDays = 0;
let impactPoint = [20, 20];
window.EARTH_R_WORLD = EARTH_R;

// Initialize the application
async function init() {
    await createEarth();
    setupEventListeners();
    setupNEOGroup();
    initDates();
    loadNEOs();
    animate();
}

// Create Earth
async function createEarth() {
    try {
        const tex = await new THREE.TextureLoader().loadAsync('assets/body_textures/8k_earth_daymap.jpg');
        earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 64, 64), new THREE.MeshPhongMaterial({ map: tex }));
    } catch {
        earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 64, 64), new THREE.MeshPhongMaterial({ color: 0x3a7bd5 }));
    }
    scene.add(earth);
}

// NEO objects group
function setupNEOGroup() {
    neoGroup = new THREE.Group();
    scene.add(neoGroup);
}

// Setup all event listeners
function setupEventListeners() {
    // Window resize
    window.addEventListener('resize', onWindowResize);

    // Time controls
    btnFastBack.onclick = () => shiftDays(-7);
    btnBack.onclick = () => shiftDays(-1);
    btnNow.onclick = () => resetTime();
    btnForward.onclick = () => shiftDays(1);
    btnFastFwd.onclick = () => shiftDays(7);

    // Load NEOs
    loadBtn.onclick = () => loadNEOs();

    // Modal controls
    openImpactBtn.addEventListener('click', openImpactModal);
    closeImpactBtn.addEventListener('click', closeImpactModal);
    // runImpactBtn.addEventListener('click', runImpactSimulation);
    clearImpactBtn.addEventListener('click', clearImpactSimulation);
    simulateAIBtn.addEventListener('click', runAISimulation);

    // Gemini modal
    geminiModalClose.addEventListener('click', closeGeminiModal);

    // NEO modal
    neoModalClose.addEventListener('click', closeNeoModal);
    setupModalBackdrop(neoModal, closeNeoModal);
    setupModalBackdrop(impactModal, closeImpactModal);
    setupModalBackdrop(geminiModal, closeGeminiModal);

    // Canvas interactions
    setupCanvasInteractions();
}

// Setup canvas interactions
function setupCanvasInteractions() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Hover tooltips
    canvas.addEventListener('mousemove', (e) => {
        updateMousePosition(e, mouse);
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(neoGroup.children);
        
        if (hits.length) {
            showNeoTooltip(e, hits[0].object.userData);
        } else {
            hideNeoTooltip();
        }
    });

    // Click on asteroids
    canvas.addEventListener('click', (e) => {
        updateMousePosition(e, mouse);
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(neoGroup.children);
        if (hits.length) {
            onAsteroidClick(hits[0].object);
        }
    });
}

function updateMousePosition(e, mouse) {
    mouse.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / innerHeight) * 2 + 1;
}

function showNeoTooltip(e, data) {
    neoTooltip.innerHTML = `
        <div style="font-weight:700;margin-bottom:4px">${data.name}</div>
        <div>Date: ${data.caDate}</div>
        <div>Miss distance: ${Math.round(data.miss_km).toLocaleString()} km</div>
        <div>Velocity: ${(+data.v_kms).toFixed(2)} km/s</div>
        <div>H: ${data.H ?? '—'} | Size: ${data.est_diam ?? '—'}</div>
    `;
    neoTooltip.style.left = (e.clientX + 12) + 'px';
    neoTooltip.style.top = (e.clientY + 12) + 'px';
    neoTooltip.style.display = 'block';
}

function hideNeoTooltip() {
    neoTooltip.style.display = 'none';
}

// Asteroid click handler
async function onAsteroidClick(object) {
    const data = object.userData;
    window.currentApproach = data;
    
    try {
        const neo = await fetchNEOData(data.id);
        showNeoModal(neo, data, object.position);
    } catch (error) {
        console.error('Error loading asteroid data:', error);
        alert('Failed to load asteroid data');
    }
}

// Fetch NEO data from NASA API
async function fetchNEOData(id) {
    const url = `https://api.nasa.gov/neo/rest/v1/neo/${id}?api_key=${encodeURIComponent(NASA_API_KEY)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function fetchJSON(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.json();
}

// Show NEO modal
function showNeoModal(neo, approachData, meshPosition) {
    const od = neo.orbital_data || {};
    const className = od.orbit_class?.orbit_class_description || od.orbit_class?.orbit_class_type || '—';
    const sstr = neo.designation || neo.name || approachData.id;
    
    neoModalJPL.href = `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(sstr)}`;
    neoModalTitle.textContent = neo.name || `Asteroid ${approachData.id}`;
    
    // Impact prediction
    let predictionHtml = '';
    try {
        const meters = neo.estimated_diameter?.meters;
        let mass_kg;
        if (meters) {
            const dAvg = (meters.estimated_diameter_min + meters.estimated_diameter_max) / 2;
            const rho = 3000;
            const r = dAvg / 2;
            mass_kg = (4 / 3) * Math.PI * r * r * r * rho;
        }
        
        const pred = predictImpact({
            meshPosition: { x: meshPosition.x, y: meshPosition.y, z: meshPosition.z },
            earthRadiusUnits: EARTH_R,
            v_kms: +approachData.v_kms || 17,
            mass_kg
        });
        
        window.predictedEntry = pred;
        const tMin = pred.time_s / 60;
        const tHr = pred.time_s / 3600;
        
        predictionHtml = `
            <div style="margin-top:6px;font-weight:700">🎯 Impact Prediction</div>
            <div class="kv"><div>Time to entry:</div><div>${tMin < 90 ? `${tMin.toFixed(1)} min` : `${tHr.toFixed(2)} h`}</div></div>
            <div class="kv"><div>Entry angle:</div><div>${pred.angle_deg.toFixed(1)}°</div></div>
            <div class="kv"><div>Impact location:</div><div>${pred.lat.toFixed(3)}, ${pred.lon.toFixed(3)}</div></div>
        `;
        
        // Auto-fill impact form
        autoFillImpactForm(neo, approachData, pred);
        
    } catch (predErr) {
        console.warn('Prediction failed:', predErr);
        predictionHtml = '<div style="color: #ef4444;">Prediction error</div>';
    }

    neoModalBody.innerHTML = `
        <div class="kv"><div>ID (JPL SPK):</div><div>${neo.neo_reference_id || approachData.id}</div></div>
        <div class="kv"><div>Designation:</div><div>${neo.designation || '—'}</div></div>
        <div class="kv"><div>Absolute magnitude (H):</div><div>${neo.absolute_magnitude_h ?? '—'}</div></div>
        <div class="kv"><div>Potentially hazardous:</div><div>${neo.is_potentially_hazardous_asteroid ? 'Yes' : 'No'}</div></div>
        <div class="kv"><div>Estimated diameter:</div><div>${
            neo.estimated_diameter?.meters
                ? `${Math.round(neo.estimated_diameter.meters.estimated_diameter_min)}–${Math.round(neo.estimated_diameter.meters.estimated_diameter_max)} m`
                : '—'
        }</div></div>

        <div style="margin-top:6px;font-weight:700">📊 Orbital Data</div>
        <div class="kv"><div>Class:</div><div>${className}</div></div>
        <div class="kv"><div>a (AU):</div><div>${od.semi_major_axis ?? '—'}</div></div>
        <div class="kv"><div>e:</div><div>${od.eccentricity ?? '—'}</div></div>
        <div class="kv"><div>i (deg):</div><div>${od.inclination ?? '—'}</div></div>
        <div class="kv"><div>Ω (deg):</div><div>${od.ascending_node_longitude ?? '—'}</div></div>
        <div class="kv"><div>ω (deg):</div><div>${od.perihelion_argument ?? '—'}</div></div>
        <div class="kv"><div>M (deg):</div><div>${od.mean_anomaly ?? '—'}</div></div>
        <div class="kv"><div>Epoch (JD):</div><div>${od.epoch_jd ?? '—'}</div></div>

        <div style="margin-top:6px;font-weight:700">🛰️ Close Approach Data</div>
        <div class="kv"><div>Date:</div><div>${approachData.caDate}</div></div>
        <div class="kv"><div>Miss distance:</div><div>${Math.round(approachData.miss_km).toLocaleString()} km</div></div>
        <div class="kv"><div>Velocity:</div><div>${(+approachData.v_kms).toFixed(2)} km/s</div></div>
        
        ${predictionHtml}
    `;

    openNeoModal();
}

// Auto-fill impact form
function autoFillImpactForm(neo, approachData, prediction) {
    const meters = neo.estimated_diameter?.meters;
    if (meters) {
        const dAvg = (meters.estimated_diameter_min + meters.estimated_diameter_max) / 2;
        document.getElementById('impDiam').value = Math.max(10, Math.round(dAvg));
    }
    document.getElementById('impSpeed').value = Math.max(11, (+approachData.v_kms).toFixed(1));
    document.getElementById('impAngle').value = Math.round(prediction.angle_deg);
    setImpactPoint([prediction.lon, prediction.lat]);
}

// Time management
function shiftDays(days) {
    timeOffsetDays += days;
    updateDateInputs();
    updateTimeLabels();
    loadNEOs();
}

function resetTime() {
    timeOffsetDays = 0;
    updateDateInputs();
    updateTimeLabels();
    loadNEOs();
}

function updateDateInputs() {
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    base.setDate(base.getDate() + timeOffsetDays);
    
    const start = new Date(base);
    start.setDate(start.getDate() - 1);
    
    const end = new Date(base);
    end.setDate(end.getDate() + 1);
    
    fromInput.value = ymd(start);
    toInput.value = ymd(end);
}

function updateTimeLabels() {
    const d = new Date();
    d.setDate(d.getDate() + timeOffsetDays);
    currentTimeEl.textContent = d.toUTCString();
    timeSpeedEl.textContent = `Window: ${fromInput.value} → ${toInput.value}`;
}

// Date formatting
function ymd(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n) {
    return (n < 10 ? '0' : '') + n;
}

// Load NEO data
async function loadNEOs() {
    try {
        loadBtn.disabled = true;
        neoGroup.clear();
        
        const start = fromInput.value;
        const end = toInput.value;
        
        // Date range validation
        const d1 = new Date(start), d2 = new Date(end);
        if ((d2 - d1) / 86400000 > 7) {
            alert('Date range must be ≤ 7 days (NASA NeoWs limit).');
            return;
        }

        const feed = await fetchJSON(`${API_FEED}?start_date=${start}&end_date=${end}&api_key=${encodeURIComponent(NASA_API_KEY)}`);
        const entries = [];
        
        for (const [, list] of Object.entries(feed.near_earth_objects || {})) {
            for (const neo of list) {
                const ca = (neo.close_approach_data || []).find(c => c.orbiting_body === 'Earth');
                if (!ca) continue;
                
                entries.push({
                    id: neo.id,
                    name: neo.name,
                    H: neo.absolute_magnitude_h,
                    est_diam: neo.estimated_diameter?.meters
                        ? `${Math.round(neo.estimated_diameter.meters.estimated_diameter_min)}–${Math.round(neo.estimated_diameter.meters.estimated_diameter_max)} m`
                        : null,
                    caDate: ca.close_approach_date_full || ca.close_approach_date,
                    miss_km: +ca.miss_distance.kilometers,
                    v_kms: +ca.relative_velocity.kilometers_per_second
                });
            }
        }

        createNEOVisualizations(entries);
        drawRangeRings();
        
    } catch (error) {
        console.error('Error loading NEOs:', error);
        alert('Failed to load NEO data. Check API key and dates.');
    } finally {
        loadBtn.disabled = false;
    }
}

// Create NEO visualizations
function createNEOVisualizations(entries) {
    for (const data of entries) {
        const r = logMap(data.miss_km, 1e4, 5e7, 0.05, 1.4);
        const ang = Math.random() * Math.PI * 2;
        const tilt = (Math.random() - 0.5) * 0.35;
        const x = r * Math.cos(ang);
        const y = r * tilt;
        const z = r * Math.sin(ang);
        
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.006, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        
        dot.position.set(x, y, z);
        dot.userData = data;
        neoGroup.add(dot);
    }
}

function logMap(x, inMin, inMax, outMin, outMax) {
    const l1 = Math.log(inMin);
    const l2 = Math.log(inMax);
    const t = Math.max(0, Math.min(1, (Math.log(x) - l1) / (l2 - l1)));
    return outMin + (outMax - outMin) * t;
}

// Range rings
function drawRangeRings() {
    const radiiKm = [40000, 400000, 4e6, 4e7];
    const group = new THREE.Group();
    
    radiiKm.forEach(km => {
        const r = logMap(km, 1e4, 5e7, 0.05, 1.4);
        const geo = new THREE.RingGeometry(r * 0.995, r * 1.005, 128);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x888888,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.25
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
    });
    
    const old = scene.getObjectByName('rangeRings');
    if (old) scene.remove(old);
    
    group.name = 'rangeRings';
    scene.add(group);
}

// Impact simulation
async function runImpactSimulation() {
    const env = await ensureEnvProbe();
    document.getElementById('impactEnv').textContent = env.summary;
    runImpactScenario(env.modifiers);
}

function clearImpactSimulation() {
    clearImpactLayers();
    document.getElementById('impactResult').textContent = '';
    document.getElementById('impactEnv').textContent = '';
    document.getElementById('impLatLon').value = '0, 0';
}

// AI simulation
async function runAISimulation() {
    try {
        simulateAIBtn.disabled = true;
        simulateAIBtn.textContent = '🤖 Analyzing...';
        
        const env = await ensureEnvProbe();
        const asteroidData = {
            name: "Simulated Asteroid",
            diameter: +document.getElementById('impDiam').value || 100,
            velocity: +document.getElementById('impSpeed').value || 17,
            density: +document.getElementById('impRho').value || 3000,
            angle: +document.getElementById('impAngle').value || 45
        };
        
        const impactLocation = {
            lat: impactPoint[1],
            lon: impactPoint[0],
            isWater: env.isWater,
            elevation: env.elevation
        };
        
        const simulation = await simulateAsteroidImpact(asteroidData, impactLocation);
        showAISimulationResults(simulation, env);
        
    } catch (error) {
        console.error('AI simulation failed:', error);
        alert('AI simulation error: ' + error.message);
    } finally {
        simulateAIBtn.disabled = false;
        simulateAIBtn.textContent = ' Analyze with Gemini AI';
    }
}

function showAISimulationResults(simulation, env) {
    const resultsDiv = document.getElementById('impactResult');
    
    const html = `
        <div style="border: 2px solid #10b981; border-radius: 10px; padding: 15px; margin: 10px 0; background: #064e3b20;">
            <h3 style="color: #10b981; margin-top: 0;">🤖 Gemini AI Analysis</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div><strong>Blast energy:</strong><br>${simulation.energy_mt} Mt TNT</div>
                <div><strong>Crater diameter:</strong><br>${simulation.crater_diameter_km} km</div>
                <div><strong>Earthquake magnitude:</strong><br>${simulation.earthquake_magnitude}</div>
                <div><strong>Tsunami height:</strong><br>${env.isWater ? simulation.tsunami_height_m + ' m' : 'not applicable'}</div>
            </div>
            
            <div style="margin-top: 15px;">
                <strong>Blast zones:</strong>
                <ul style="margin: 5px 0; padding-left: 20px;">
                    <li>Total destruction: ${simulation.blast_zones.total_destruction_km} km</li>
                    <li>Severe damage: ${simulation.blast_zones.severe_damage_km} km</li>
                    <li>Moderate damage: ${simulation.blast_zones.moderate_damage_km} km</li>
                    <li>Thermal radius: ${simulation.blast_zones.thermal_radius_km} km</li>
                </ul>
            </div>
            
            <div style="margin-top: 10px;">
                <strong>Effects description:</strong><br>${simulation.effects_description}
            </div>
            
            <div style="margin-top: 10px;">
                <strong>Casualty estimate:</strong><br>${simulation.casualty_estimate}
            </div>
            
            <div style="margin-top: 10px;">
                <strong>Recommendations:</strong>
                <ul style="margin: 5px 0; padding-left: 20px;">
                    ${simulation.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        </div>
    `;
    
    // Remove previous AI analysis if exists
    if (resultsDiv.innerHTML.includes('🤖 Gemini AI Analysis')) {
        const existingAI = resultsDiv.querySelector('div[style*="border: 2px solid #10b981"]');
        if (existingAI) existingAI.remove();
    }
    
    resultsDiv.innerHTML = html + resultsDiv.innerHTML;
}

// Formula clarification
async function clarifyFormulas() {
    const prompt = buildClarifyPrompt();
    try {
        geminiModalBody.textContent = '🔄 Requesting explanation from Gemini AI...';
        openGeminiModal();
        
        const explanation = await generateWithGoogleGenAI(prompt);
        geminiModalBody.textContent = explanation;
    } catch (error) {
        geminiModalBody.textContent = `❌ Error: ${error.message}`;
    }
}

function buildClarifyPrompt() {
    const params = {
        diameter_m: +document.getElementById('impDiam').value || 100,
        velocity_kms: +document.getElementById('impSpeed').value || 17,
        density: +document.getElementById('impRho').value || 3000,
        angle_deg: +document.getElementById('impAngle').value || 45,
        gt: {
            mass_kg: +document.getElementById('gtMt').value || 2000,
            hover_km: +document.getElementById('gtRh').value || 1.0,
            tau_years: +document.getElementById('gtTau').value || 1.0,
            alpha_deg: +document.getElementById('gtAlpha').value || 0
        }
    };
    
    return `Explain the physical formulas for asteroid impact simulation with parameters: ${JSON.stringify(params)}.

Explain in English in simple terms:
1. Formulas for impact energy and crater calculation
2. Gravity tractor formulas (acceleration, Δv)
3. Formulas for blast zones (shock wave, thermal effects)
4. Units of measurement and typical values
5. Model limitations and approximations

Provide specific numerical examples for the given parameters.`;
}

// Modal management
function openImpactModal() {
    impactModal.style.display = 'flex';
    canvas.style.pointerEvents = 'none';
    if (!mapReady) {
        initImpactMap();
        mapReady = true;
    }
    setTimeout(() => {
        try { window.map && window.map.resize(); } catch { }
    }, 80);
}

function closeImpactModal() {
    impactModal.style.display = 'none';
    canvas.style.pointerEvents = 'auto';
}

function openNeoModal() {
    neoModal.style.display = 'flex';
    canvas.style.pointerEvents = 'none';
}

function closeNeoModal() {
    neoModal.style.display = 'none';
    canvas.style.pointerEvents = 'auto';
}

function openGeminiModal() {
    geminiModal.style.display = 'flex';
    canvas.style.pointerEvents = 'none';
}

function closeGeminiModal() {
    geminiModal.style.display = 'none';
    canvas.style.pointerEvents = 'auto';
}

function setupModalBackdrop(modal, closeFn) {
    let backdropDown = null;
    
    modal.addEventListener('pointerdown', (e) => {
        if (e.target === modal) {
            backdropDown = { x: e.clientX, y: e.clientY, t: performance.now() };
        } else {
            backdropDown = null;
        }
    });
    
    modal.addEventListener('pointerup', (e) => {
        if (!backdropDown) return;
        if (e.target !== modal) {
            backdropDown = null;
            return;
        }
        
        const dx = Math.abs(e.clientX - backdropDown.x);
        const dy = Math.abs(e.clientY - backdropDown.y);
        const dt = performance.now() - backdropDown.t;
        
        if (dx < 5 && dy < 5 && dt < 600) {
            closeFn();
        }
        backdropDown = null;
    });
}

// Window resize
function onWindowResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}

// Initialize dates
function initDates() {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    
    const start = new Date(today);
    start.setDate(start.getDate() - 1);
    
    const end = new Date(today);
    end.setDate(end.getDate() + 1);
    
    fromInput.value = ymd(start);
    toInput.value = ymd(end);
    currentTimeEl.textContent = today.toUTCString();
    timeSpeedEl.textContent = `Window: ${fromInput.value} → ${toInput.value}`;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    if (earth) earth.rotation.y += 0.0018;
    controls.update();
    renderer.render(scene, camera);
}

// Constants
const API_FEED = 'https://api.nasa.gov/neo/rest/v1/feed';

// Start the application
init();