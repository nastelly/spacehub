// map.js - completely rewritten with proper map initialization and English text
import { estimateImpact } from './impact.js';
import { diameterFromH_km, massFromDiameter, kineticEnergy_J, energyToMt, classifyBySize, locationRisk, torinoScale, classifyImpactZone } from './hazard.js';
import { gravitationalFocusingRadius } from './physics.js';
import { deltaV_kmps, deltaS_km, deltaB_km, tractorAcceleration_kmps2, hoverThrust_N, assessDeflection } from './gt.js';
import { monteCarloImpactProbability } from './bplane.js';

let map, impactPoint = [0, 0]; 
let ringsLayerIds = [];
let marker;

// Use a reliable map style that works locally
const MAP_STYLE_URL = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

export function initImpactMap() {
    console.log('Initializing impact map...');
    
    const mapContainer = document.getElementById('impactMap');
    if (!mapContainer) {
        console.error('Impact map container not found');
        return;
    }

    try {
        map = new maplibregl.Map({
            container: 'impactMap',
            style: MAP_STYLE_URL,
            center: [0, 0],
            zoom: 1,
            attributionControl: true
        });

        window.map = map;

        // Add navigation controls
        map.addControl(new maplibregl.NavigationControl(), 'top-right');

        map.on('load', () => {
            console.log('Map loaded successfully');
            
            // Set initial impact point to center of map
            impactPoint = [0, 0];
            placeMarker(impactPoint);
            
            const latLonEl = document.getElementById('impLatLon');
            if (latLonEl) {
                latLonEl.value = `${impactPoint[1].toFixed(4)}, ${impactPoint[0].toFixed(4)}`;
            }
            
            // Initial environment probe
            probeEnvironment(impactPoint).then(env => {
                const box = document.getElementById('impactEnv');
                if (box) {
                    box.textContent = env.summary;
                }
            });

            // Click handler for setting impact points
            map.on('click', async (e) => {
                impactPoint = [e.lngLat.lng, e.lngLat.lat];
                const latLonEl = document.getElementById('impLatLon');
                if (latLonEl) {
                    latLonEl.value = `${impactPoint[1].toFixed(4)}, ${impactPoint[0].toFixed(4)}`;
                }
                placeMarker(impactPoint);
                
                const env = await probeEnvironment(impactPoint);
                const box = document.getElementById('impactEnv');
                if (box) {
                    box.textContent = env.summary;
                }
            });

            // Ensure map is properly sized
            setTimeout(() => {
                try {
                    map.resize();
                } catch (e) {
                    console.warn('Map resize error:', e);
                }
            }, 100);
        });

        map.on('error', (e) => {
            console.error('Map error:', e.error);
        });

    } catch (error) {
        console.error('Failed to initialize map:', error);
    }
}

function placeMarker(lonlat) {
    if (marker) {
        marker.remove();
    }
    
    try {
        marker = new maplibregl.Marker({ 
            color: '#ff4444',
            draggable: true
        })
        .setLngLat(lonlat)
        .addTo(map);

        // Make marker draggable to set impact point
        marker.on('dragend', async () => {
            const lngLat = marker.getLngLat();
            impactPoint = [lngLat.lng, lngLat.lat];
            const latLonEl = document.getElementById('impLatLon');
            if (latLonEl) {
                latLonEl.value = `${impactPoint[1].toFixed(4)}, ${impactPoint[0].toFixed(4)}`;
            }
            
            const env = await probeEnvironment(impactPoint);
            const box = document.getElementById('impactEnv');
            if (box) {
                box.textContent = env.summary;
            }
        });

    } catch (error) {
        console.warn('Marker creation error:', error);
    }
}

export function setImpactPoint(lonlat) {
    impactPoint = lonlat;
    placeMarker(impactPoint);
    
    const latLonEl = document.getElementById('impLatLon');
    if (latLonEl) {
        latLonEl.value = `${impactPoint[1].toFixed(4)}, ${impactPoint[0].toFixed(4)}`;
    }
    
    try {
        if (map) {
            map.easeTo({
                center: impactPoint,
                duration: 1000
            });
        }
    } catch (error) {
        console.warn('Map navigation error:', error);
    }
}

export async function ensureEnvProbe() {
    return await probeEnvironment(impactPoint);
}

async function probeEnvironment([lon, lat]) {
    let elevation = 0;
    let isWater = false;
    let isUrban = false;

    try {
        // Simple elevation estimation based on latitude and terrain patterns
        // Higher elevations near mountains, lower near coasts
        const absLat = Math.abs(lat);
        
        // Basic elevation model
        if (absLat > 60) {
            // Polar regions - generally lower elevation
            elevation = Math.random() * 500;
        } else if (absLat > 30) {
            // Mid-latitudes - mixed terrain
            elevation = 200 + Math.random() * 1500;
        } else {
            // Tropics - generally lower with some high areas
            elevation = 100 + Math.random() * 1000;
        }

        // Add some realistic variation based on longitude (simplified mountain ranges)
        if ((lon > -120 && lon < -100) || (lon > 70 && lon < 100)) {
            elevation += 1000 + Math.random() * 2000; // Rocky Mountains / Himalayas
        }

        // Water detection - simplified model
        // Oceans are generally between 60°S and 60°N, with some land masses
        const isNorthernOcean = (lat > 30 && lat < 60 && lon > -40 && lon < 40); // North Atlantic
        const isSouthernOcean = (lat < -40 && lat > -60);
        const isPacific = (lon > 120 || lon < -120) && (lat > -60 && lat < 60);
        const isAtlantic = (lon > -80 && lon < 20) && (lat > -60 && lat < 60);
        const isIndian = (lon > 20 && lon < 120) && (lat > -60 && lat < 30);
        
        isWater = isNorthernOcean || isSouthernOcean || isPacific || isAtlantic || isIndian;
        
        // Urban area detection - major population centers
        const isNorthAmerica = (lon > -130 && lon < -60 && lat > 20 && lat < 50);
        const isEurope = (lon > -10 && lon < 40 && lat > 35 && lat < 60);
        const isEastAsia = (lon > 100 && lon < 150 && lat > 20 && lat < 50);
        const isSouthAsia = (lon > 65 && lon < 100 && lat > 5 && lat < 35);
        
        isUrban = isNorthAmerica || isEurope || isEastAsia || isSouthAsia;

    } catch (error) {
        console.warn('Environment detection error:', error);
        // Fallback values
        elevation = 100;
        isWater = Math.random() > 0.7;
        isUrban = Math.random() > 0.5;
    }

    // Calculate impact radius modifier based on environment
    let radiusMultiplier = 1.0;
    const notes = [];

    if (isWater) {
        radiusMultiplier *= 0.85;
        notes.push('Ocean impact: tsunami risk, reduced blast radius.');
    } else {
        if (elevation >= 1500) {
            radiusMultiplier *= 0.85;
            notes.push('High elevation area: partial terrain shielding.');
        } else if (elevation <= 50) {
            radiusMultiplier *= 1.05;
            notes.push('Low elevation: slightly extended blast effects.');
        }
        
        if (isUrban) {
            radiusMultiplier *= 1.15;
            notes.push('Urban area: increased vulnerability and damage potential.');
        } else {
            notes.push('Rural/undeveloped area: reduced population density.');
        }
    }

    const summary = `Location: ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E | ` +
                   `Elevation: ${Math.round(elevation)} m | ` +
                   `Type: ${isWater ? 'Ocean' : (isUrban ? 'Urban' : 'Land')} | ` +
                   `Radius modifier: ×${radiusMultiplier.toFixed(2)}. ` +
                   `${notes.join(' ')}`;

    return {
        elevation,
        isWater,
        isUrban,
        modifier: radiusMultiplier,
        summary,
        modifiers: { radiusMultiplier }
    };
}

export function runImpactScenario(env = { radiusMultiplier: 1.0 }) {
    const diameter = +document.getElementById('impDiam').value || 100;
    const velocity = +document.getElementById('impSpeed').value || 17;
    const density = +document.getElementById('impRho').value || 3000;
    const angle = +document.getElementById('impAngle').value || 45;

    // Calculate impact effects
    const res = estimateImpact({ 
        d_m: diameter, 
        v_kms: velocity, 
        rho: density, 
        angle_deg: angle 
    });

    const multiplier = env.radiusMultiplier ?? 1.0;
    const rings = {
        r1: res.rings_km.r1 * multiplier,
        r3: res.rings_km.r3 * multiplier, 
        r5: res.rings_km.r5 * multiplier
    };

    // Draw impact rings on map
    drawRings(impactPoint, rings);

    // Hazard classification and impact probability
    const mass_kg = massFromDiameter(diameter, density);
    const E_J = kineticEnergy_J(mass_kg, velocity);
    const E_Mt = energyToMt(E_J);
    const zone = classifyImpactZone({ isWater: env.isWater, isUrban: env.isUrban });
    const zoneRisk = locationRisk(zone);
    
    const v_inf_kms = Math.max(0.1, velocity - 11);
    const b_imp_km = gravitationalFocusingRadius(v_inf_kms);
    const sigma = +document.getElementById('bpSigma').value || 1500;
    
    const ca = (window.currentApproach || {});
    const miss_km = Math.max(0, +ca.miss_km || 2 * b_imp_km);
    const stateList = [{ 
        r_rel_km: [miss_km, 0, 0], 
        v_rel_kms: [0, v_inf_kms, 0] 
    }];
    
    const { P_impact: P_base } = monteCarloImpactProbability(
        stateList, v_inf_kms, 3000, [sigma, sigma]
    );
    const torino = torinoScale(P_base, E_Mt);

    // Gravity tractor calculations
    const gtMt = +document.getElementById('gtMt').value || 2000;
    const gtRh = +document.getElementById('gtRh').value || 1.0;
    const gtTau = +document.getElementById('gtTau').value || 1.0;
    const gtAlp = +document.getElementById('gtAlpha').value || 0;
    const gtAau = +document.getElementById('gtAau').value || 1.1;
    const gtKap = +document.getElementById('gtKappa').value || 0.8;
    const muSun = 1.32712440018e11;

    const aT = tractorAcceleration_kmps2({ 
        mt_kg: gtMt, 
        rh_km: gtRh, 
        alpha_deg: gtAlp 
    });
    const dV = deltaV_kmps({ 
        mt_kg: gtMt, 
        rh_km: gtRh, 
        alpha_deg: gtAlp, 
        tau_years: gtTau 
    });
    const dS = deltaS_km({ 
        a_AU: gtAau, 
        mu_sun_km3s2: muSun, 
        deltaV_kmps: dV 
    });
    const dB = deltaB_km({ 
        kappa: gtKap, 
        deltaS_km: dS 
    });
    const { success, margin_km } = assessDeflection({ 
        deltaB_km: dB, 
        b_imp_km 
    });

    // Display gravity tractor results
    const gtBox = document.getElementById('gtResult');
    if (gtBox) {
        const T_hover = hoverThrust_N({ 
            mt_kg: gtMt, 
            M_ast_kg: mass_kg, 
            rh_km: gtRh 
        });
        gtBox.innerHTML = 
            `Tractor acceleration: ${(aT * 1e6).toFixed(2)} mm/s²<br>` +
            `Δv: ${dV.toFixed(5)} km/s<br>` +
            `Δs: ${Math.round(dS).toLocaleString()} km<br>` +
            `Δb: ${Math.round(dB).toLocaleString()} km<br>` +
            `Final miss: ${Math.round(miss_km + dB).toLocaleString()} km → ` +
            `${success ? '<b style="color: #10b981;">DEFLECTION SUCCESS</b>' : '<b style="color: #ef4444;">INSUFFICIENT DEFLECTION</b>'}<br>` +
            `Hover thrust: ${Math.round(T_hover).toLocaleString()} N`;
    }

    // Recompute impact probability with gravity tractor
    const { P_impact: P_withGT } = monteCarloImpactProbability([
        { r_rel_km: [miss_km + dB, 0, 0], v_rel_kms: [0, v_inf_kms, 0] }
    ], v_inf_kms, 3000, [sigma, sigma]);

    // Display results
    const riskClass = classifyBySize(diameter);
    const resultsBox = document.getElementById('impactResult');
    
    if (resultsBox) {
        let entryInfo = '';
        try {
            const pe = window.predictedEntry;
            if (pe && Number.isFinite(pe.time_s)) {
                const tMin = pe.time_s / 60;
                const timeStr = tMin < 90 ? 
                    `${tMin.toFixed(1)} minutes` : 
                    `${(pe.time_s / 3600).toFixed(2)} hours`;
                entryInfo = `<br>Predicted entry: <b>${pe.lat.toFixed(3)}°N, ${pe.lon.toFixed(3)}°E</b> • ETA: <b>${timeStr}</b>`;
            }
        } catch (e) {
            console.warn('Entry prediction display error:', e);
        }

        resultsBox.innerHTML = 
            `Energy: <b>${res.energy_Mt.toFixed(2)} Mt TNT</b><br>` +
            `${res.makesCrater ? `Crater diameter: <b>${res.crater_km.toFixed(2)} km</b><br>` : 'Airburst likely<br>'}` +
            `Blast radii: 1 psi ≈ <b>${rings.r1.toFixed(1)} km</b>, 3 psi ≈ <b>${rings.r3.toFixed(1)} km</b>, 5 psi ≈ <b>${rings.r5.toFixed(1)} km</b><br>` +
            `Impact zone: <b>${zone}</b> • Risk level: <b>${zoneRisk}</b> • Severity: <b>${riskClass}</b><br>` +
            `Torino scale (baseline): <b>${torino}/10</b> • Impact probability: <b>${P_base.toFixed(4)}</b><br>` +
            `With gravity tractor: P_impact → <b>${P_withGT < 1e-4 ? '< 0.0001' : P_withGT.toFixed(4)}</b> (Δs = <b>${Math.round(dS).toLocaleString()} km</b>)<br>` +
            `<span class="impact-note">Impact radius: ${b_imp_km.toFixed(0)} km • Initial miss: ${Math.round(miss_km).toLocaleString()} km • Final miss: ${Math.round(miss_km + dB).toLocaleString()} km</span>` +
            entryInfo +
            `<br><i>${zone === 'ocean' ? 
                'Ocean impact scenario. Potential for significant tsunami generation. Coastal regions at risk.' : 
                zone === 'urban' ? 
                'Urban impact scenario. High potential for mass casualties and infrastructure damage.' : 
                'Land impact scenario. Regional destruction with significant environmental effects.'}</i>`;
    }
}

export function clearImpactLayers() {
    if (!map) return;
    
    // Remove all ring layers
    ringsLayerIds.forEach(id => {
        try {
            if (map.getLayer(id)) map.removeLayer(id);
            if (map.getSource(id)) map.removeSource(id);
        } catch (error) {
            console.warn(`Error removing layer ${id}:`, error);
        }
    });
    ringsLayerIds = [];
    
    // Remove marker
    if (marker) {
        marker.remove();
        marker = null;
    }
}

function drawRings(centerLonLat, rings) {
    clearImpactLayers();
    
    const circles = [
        { id: 'ring-1psi', km: rings.r1, color: '#3b82f6', label: '1 psi (Light damage)' },
        { id: 'ring-3psi', km: rings.r3, color: '#f59e0b', label: '3 psi (Moderate damage)' },
        { id: 'ring-5psi', km: rings.r5, color: '#ef4444', label: '5 psi (Severe damage)' },
    ];
    
    circles.forEach(circle => {
        try {
            const geojson = createCirclePolygon(centerLonLat, circle.km, 64);
            
            // Add source
            map.addSource(circle.id, {
                type: 'geojson',
                data: geojson
            });
            
            // Add fill layer
            map.addLayer({
                id: circle.id,
                type: 'fill',
                source: circle.id,
                paint: {
                    'fill-color': circle.color,
                    'fill-opacity': 0.15,
                    'fill-outline-color': circle.color
                }
            });
            
            // Add outline layer for better visibility
            map.addLayer({
                id: `${circle.id}-outline`,
                type: 'line',
                source: circle.id,
                paint: {
                    'line-color': circle.color,
                    'line-width': 2,
                    'line-opacity': 0.6
                }
            });
            
            ringsLayerIds.push(circle.id, `${circle.id}-outline`);
            
        } catch (error) {
            console.warn(`Error drawing ring ${circle.id}:`, error);
        }
    });
    
    placeMarker(centerLonLat);
    
    // Adjust map view to show all rings
    try {
        const bounds = calculateBounds(centerLonLat, Math.max(rings.r1, rings.r3, rings.r5));
        map.fitBounds(bounds, {
            padding: 50,
            duration: 1000
        });
    } catch (error) {
        console.warn('Error fitting map bounds:', error);
    }
}

function createCirclePolygon([lon, lat], radiusKm, steps = 64) {
    const coordinates = [];
    const R = 6371.0088; // Earth radius in km
    const latRad = toRad(lat);
    const lonRad = toRad(lon);
    const angularDistance = radiusKm / R;
    
    for (let i = 0; i <= steps; i++) {
        const bearing = 2 * Math.PI * i / steps;
        
        const sinLat = Math.sin(latRad) * Math.cos(angularDistance) + 
                      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing);
        const newLat = Math.asin(sinLat);
        
        const newLon = lonRad + Math.atan2(
            Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
            Math.cos(angularDistance) - Math.sin(latRad) * sinLat
        );
        
        coordinates.push([toDeg(newLon), toDeg(newLat)]);
    }
    
    // Close the polygon
    coordinates.push(coordinates[0]);
    
    return {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [coordinates]
        },
        properties: {
            radius: radiusKm,
            center: [lon, lat]
        }
    };
}

function calculateBounds(center, radiusKm) {
    const R = 6371.0088;
    const degreeRange = (radiusKm / R) * (180 / Math.PI);
    const [lon, lat] = center;
    
    return [
        [lon - degreeRange, lat - degreeRange],
        [lon + degreeRange, lat + degreeRange]
    ];
}

// Utility functions
function toRad(degrees) {
    return degrees * Math.PI / 180;
}

function toDeg(radians) {
    return radians * 180 / Math.PI;
}

// Export utility functions for testing
export const MapUtils = {
    createCirclePolygon,
    calculateBounds,
    toRad,
    toDeg
};