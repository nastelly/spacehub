import * as THREE from 'https://cdn.skypack.dev/three@0.128.0/build/three.module.js';

export function createOrbit(orbitParams, color, n_mesh_points) {
  const orbit_segment_const = 2 * Math.PI / n_mesh_points;
  const cosNode = Math.cos(orbitParams.node);
  const sinNode = Math.sin(orbitParams.node);
  const cosPeri = Math.cos(orbitParams.peri);
  const sinPeri = Math.sin(orbitParams.peri);
  const cosInc = Math.cos(orbitParams.inc);
  const sinInc = Math.sin(orbitParams.inc);

  const row1 = [cosPeri * cosNode - cosInc * sinPeri * sinNode, -cosNode * sinPeri - cosInc * cosPeri * sinNode, sinInc * sinNode];
  const row2 = [cosPeri * sinNode + cosInc * cosNode * sinPeri, -sinPeri * sinNode + cosInc * cosPeri * cosNode, -sinInc * cosNode];
  const row3 = [sinInc * sinPeri, sinInc * cosPeri, cosInc];
  const matrix = [row1, row2, row3];

  orbitParams['transformMatrix'] = matrix;

  const points = [];
  const b = orbitParams.a * Math.sqrt(1 - orbitParams.e ** 2);

  for (let i = 0; i <= n_mesh_points; i++) {
    const E = orbit_segment_const * i;
    const xOrb = orbitParams.a * (Math.cos(E) - orbitParams.e);
    const yOrb = b * Math.sin(E);

    const xCamera = matrix[0][0] * xOrb + matrix[0][1] * yOrb;
    const yCamera = matrix[1][0] * xOrb + matrix[1][1] * yOrb;
    const zCamera = matrix[2][0] * xOrb + matrix[2][1] * yOrb;

    points.push(new THREE.Vector3(xCamera, zCamera, -yCamera));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: color });
  return new THREE.Line(geometry, material);
}

export function getOrbitPosition(a, e, trueAnomaly, matrix) {
  const cosTA = Math.cos(trueAnomaly);
  const sinTA = Math.sin(trueAnomaly);
  const radius = a * (1 - e * e) / (1 + e * cosTA);

  const xOrb = radius * cosTA;
  const yOrb = radius * sinTA;

  const xCamera = matrix[0][0] * xOrb + matrix[0][1] * yOrb;
  const yCamera = matrix[1][0] * xOrb + matrix[1][1] * yOrb;
  const zCamera = matrix[2][0] * xOrb + matrix[2][1] * yOrb;

  return new THREE.Vector3(xCamera, zCamera, -yCamera);
}

export function JulianDateToTrueAnomaly(orbitParams, JD) {
  const newMA = getCurrentMeanAnomaly(orbitParams.a, orbitParams.ma, JD, orbitParams.epoch);
  const E = solveKepler(orbitParams.e, newMA);
  return computeTrueAnomaly(E, orbitParams.e);
}

function getCurrentMeanAnomaly(a, ma, JD, epoch) {
  const mu = 0.0002959122082855911025;
  return (JD - epoch) * Math.sqrt(mu / Math.abs(a**3)) + ma;
}
function computeTrueAnomaly(E, e) { return 2*Math.atan(Math.sqrt((1+e) / (1-e)) * Math.tan(E/2)) }
function solveKepler(e, M) {
  const espLim = 10*Math.max(Number.EPSILON, Math.abs(M)*Number.EPSILON);
  if (e == 0) { return M }
  const keplerFunc = (e, E) => E - e*Math.sin(E);
  let E = M, EMult = Math.sqrt(2);
  let minBound = 0, maxBound = 0, MTest = 0, MDiff = 0;

  if (M < 0) {
    while (true) {
      MTest = keplerFunc(e, E); MDiff = M - MTest;
      if (Math.abs(MDiff) < espLim) return E;
      if (MDiff > 0) { minBound = E; break; } else { maxBound = E; E *= EMult; }
    }
  } else {
    while (true) {
      MTest = keplerFunc(e, E); MDiff = M - MTest;
      if (Math.abs(MDiff) < espLim) return E;
      if (MDiff > 0) { minBound = E; E *= EMult; } else { maxBound = E; break; }
    }
  }
  while (true) {
    E = (maxBound + minBound) / 2;
    MTest = keplerFunc(e, E); MDiff = M - MTest;
    if (Math.abs(MDiff) < espLim) return E;
    if (MDiff > 0) minBound = E; else maxBound = E;
  }
}
