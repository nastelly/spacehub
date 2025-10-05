// CNEOS fireballs + NASA Meteorite Landings (MapLibre)
const FIREBALL_API = "https://ssd-api.jpl.nasa.gov/fireball.api";
const METEORITES_API = "https://data.nasa.gov/resource/gh4g-9sfh.json";

const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [20, 20],
  zoom: 1.8,
});
map.addControl(new maplibregl.NavigationControl(), "bottom-right");

map.on("load", async () => {
  initUI();
  await loadMeteorites();
  await loadFireballs();
});

function initUI() {
  const to = document.getElementById("to");
  const from = document.getElementById("from");
  const emin = document.getElementById("emin");
  const limit = document.getElementById("limit");
  const now = new Date();
  const y10 = new Date(now); y10.setFullYear(now.getFullYear() - 10);
  to.value = now.toISOString().slice(0, 10);
  from.value = y10.toISOString().slice(0, 10);
  emin.value = "";

  document.getElementById("load").onclick = () => loadFireballs();
  document.getElementById("toggleFireballs").onchange = (e) => {
    const v = e.target.checked ? "visible" : "none";
    if (map.getLayer("fireballs")) map.setLayoutProperty("fireballs", "visibility", v);
  };
  document.getElementById("toggleMeteorites").onchange = (e) => {
    const v = e.target.checked ? "visible" : "none";
    if (map.getLayer("meteorites")) map.setLayoutProperty("meteorites", "visibility", v);
  };
}

async function fetchJSON(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

async function loadFireballs() {
  const from = document.getElementById("from").value;
  const to = document.getElementById("to").value;
  const emin = document.getElementById("emin").value;
  const limit = Number(document.getElementById("limit").value || 200);

  const params = new URLSearchParams();
  if (from) params.set("date-min", from);
  if (to) params.set("date-max", to);
  if (emin) params.set("energy-min", String(emin));
  params.set("req-loc", "true");
  params.set("limit", String(limit));

  const json = await fetchJSON(`${FIREBALL_API}?${params.toString()}`);
  const idx = indexMap(json.fields);
  const features = (json.data || [])
    .filter(row => row[idx.lat] != null && row[idx.lon] != null)
    .map(row => ({
      type: "Feature",
      properties: {
        date: row[idx.date],
        energyKt: numberOrNull(row[idx.energy]),
        altitudeKm: numberOrNull(row[idx.alt]),
        velKmS: numberOrNull(row[idx.vel])
      },
      geometry: { type: "Point", coordinates: [ Number(row[idx.lon]), Number(row[idx.lat]) ] }
    }));

  const fc = { type: "FeatureCollection", features };
  upsertGeojson("fireballs-src", "fireballs", fc, {
    circleColor: "#ff6347",
    circleRadius: ["interpolate", ["linear"], ["zoom"], 2, 2, 6, 6],
    circleOpacity: 0.8,
    circleStrokeColor: "#ffb3a6",
    circleStrokeWidth: 0.5
  });

  addPopup("fireballs", f => `
    <b>Fireball</b><br/>
    Date: ${escapeHtml(f.properties.date)}<br/>
    Energy: ${fmt(f.properties.energyKt, 1)} kt<br/>
    Velocity: ${fmt(f.properties.velKmS, 2)} km/s<br/>
    Altitude: ${fmt(f.properties.altitudeKm, 1)} km
  `);
}

async function loadMeteorites() {
  const url = `${METEORITES_API}?$select=name,year,recclass,mass,fall,geolocation&$where=geolocation IS NOT NULL&$limit=50000`;
  const data = await fetchJSON(url);

  const features = data
    .filter(r => r.geolocation && r.geolocation.longitude != null && r.geolocation.latitude != null)
    .map(r => ({
      type: "Feature",
      properties: {
        name: r.name, year: r.year, recclass: r.recclass, mass: r.mass, fall: r.fall
      },
      geometry: { type: "Point", coordinates: [ Number(r.geolocation.longitude), Number(r.geolocation.latitude) ] }
    }));

  const fc = { type: "FeatureCollection", features };
  upsertGeojson("meteorites-src", "meteorites", fc, {
    circleColor: "#3ba3ff",
    circleRadius: ["interpolate", ["linear"], ["zoom"], 2, 2, 6, 5],
    circleOpacity: 0.7,
    circleStrokeColor: "#bfe1ff",
    circleStrokeWidth: 0.5
  });

  addPopup("meteorites", f => `
    <b>${escapeHtml(f.properties.name || "Meteorite")}</b><br/>
    Year: ${escapeHtml(String(f.properties.year || "—"))}<br/>
    Class: ${escapeHtml(String(f.properties.recclass || "—"))}<br/>
    Mass: ${escapeHtml(String(f.properties.mass || "—"))} g<br/>
    Fall: ${escapeHtml(String(f.properties.fall || "—"))}
  `);
}

function upsertGeojson(sourceId, layerId, geojson, paint) {
  if (map.getSource(sourceId)) {
    map.getSource(sourceId).setData(geojson);
  } else {
    map.addSource(sourceId, { type: "geojson", data: geojson });
    map.addLayer({ id: layerId, type: "circle", source: sourceId, paint });
  }
}
function addPopup(layerId, htmlFn) {
  map.off("click", layerId, ()=>{});
  map.on("click", layerId, (e) => {
    const f = e.features?.[0]; if (!f) return;
    new maplibregl.Popup().setLngLat(e.lngLat).setHTML(htmlFn(f)).addTo(map);
  });
}
function indexMap(fields) {
  const idx = {}; fields.forEach((f,i)=> idx[f]=i);
  return {
    date: idx.date || idx.d || 0,
    lat: idx.lat || idx.latitude,
    lon: idx.lon || idx.longitude,
    alt: idx.alt || idx.altitude,
    energy: idx.energy || idx.impact_e || idx['impact-e'],
    vel: idx.vel || idx.v || idx.velocity
  };
}
const numberOrNull = (x) => x == null ? null : Number(x);
const fmt = (x, d) => (x == null || Number.isNaN(x)) ? "—" : Number(x).toFixed(d);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
