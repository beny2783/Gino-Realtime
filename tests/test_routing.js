import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { geocodePostal } from './geocode.js';
import { nearestStore } from './nearestStore.js';

// Load store locations
const locPath = path.resolve('./ginos_locations.json');
const STORES = JSON.parse(fs.readFileSync(locPath, 'utf8'));

function buildCityCentroids(stores) {
  const byCity = new Map();
  for (const s of stores) {
    const key = `${(s.city || '').trim().toLowerCase()}|${(s.province || '').trim().toUpperCase()}`;
    if (!byCity.has(key)) byCity.set(key, { sumLat: 0, sumLon: 0, count: 0 });
    const agg = byCity.get(key);
    agg.sumLat += s.lat;
    agg.sumLon += s.lon;
    agg.count += 1;
  }
  const centroids = new Map();
  for (const [key, agg] of byCity) {
    centroids.set(key, { lat: agg.sumLat / agg.count, lon: agg.sumLon / agg.count });
  }
  return centroids;
}

const CITY_CENTROIDS = buildCityCentroids(STORES);

function cityToLatLon(city, province = 'ON') {
  const key = `${(city || '').trim().toLowerCase()}|${(province || '').trim().toUpperCase()}`;
  const c = CITY_CENTROIDS.get(key);
  if (!c) throw new Error(`City centroid not found for ${city}, ${province}`);
  return c;
}

async function testCaseToLatLon(caseInput) {
  // caseInput can be { postal }, { city, province }, { lat, lon }, or { address, postal | lat/lon }
  if (caseInput.postal) {
    try {
      return await geocodePostal(caseInput.postal);
    } catch (e) {
      return { error: `geocodePostal failed: ${e.message}` };
    }
  }
  if (typeof caseInput.lat === 'number' && typeof caseInput.lon === 'number') {
    return { lat: caseInput.lat, lon: caseInput.lon, displayName: 'raw coords' };
  }
  if (caseInput.address && caseInput.address.postal) {
    try {
      return await geocodePostal(caseInput.address.postal);
    } catch (e) {
      return { error: `address->geocodePostal failed: ${e.message}` };
    }
  }
  if (caseInput.city) {
    try {
      const { lat, lon } = cityToLatLon(caseInput.city, caseInput.province || 'ON');
      return { lat, lon, displayName: `${caseInput.city}, ${caseInput.province || 'ON'} centroid` };
    } catch (e) {
      return { error: `cityToLatLon failed: ${e.message}` };
    }
  }
  return { error: 'unsupported test case' };
}

const TEST_CASES = [
  // Postal-based
  { name: 'Postal: M6N 1T4 (Toronto, ON)', postal: 'M6N 1T4', expect: { city: 'Toronto', province: 'ON', maxKm: 12 } },
  { name: 'Postal: N3Y 2C7 (Port Dover, ON)', postal: 'N3Y 2C7', expect: { city: 'Simcoe', province: 'ON', maxKm: 20 } },
  { name: 'Postal: L1Z 1Z2 (Ajax, ON)', postal: 'L1Z 1Z2', expect: { city: 'Ajax', province: 'ON', maxKm: 12 } },
  { name: 'Postal: M5V 3A8 (Toronto, ON)', postal: 'M5V 3A8', expect: { city: 'Toronto', province: 'ON', maxKm: 8 } },
  { name: 'Postal: N6H 1P4 (London, ON)', postal: 'N6H 1P4', expect: { city: 'London', province: 'ON', maxKm: 12 } },
  { name: 'Postal: K1A 0A6 (Ottawa, ON)', postal: 'K1A 0A6', expect: { city: 'Ottawa', province: 'ON', maxKm: 20 } },

  // City fallback
  { name: 'City: London, ON', city: 'London', province: 'ON', expect: { city: 'London', province: 'ON', maxKm: 15 } },
  { name: 'City: Ajax, ON', city: 'Ajax', province: 'ON', expect: { city: 'Ajax', province: 'ON', maxKm: 15 } },
  { name: 'City: Simcoe, ON', city: 'Simcoe', province: 'ON', expect: { city: 'Simcoe', province: 'ON', maxKm: 15 } },

  // Raw coords
  { name: 'Raw coords near Mississauga', lat: 43.59, lon: -79.64, expect: { city: 'Mississauga', province: 'ON', maxKm: 8 } },
  { name: 'Raw coords downtown Toronto', lat: 43.653, lon: -79.383, expect: { city: 'Toronto', province: 'ON', maxKm: 8 } },

  // Street addresses (use provided postal for offline resolution)
  { name: 'Address: CN Tower', address: { line1: '301 Front St W', city: 'Toronto', province: 'ON', postal: 'M5V 2T6' }, expect: { city: 'Toronto', province: 'ON', maxKm: 8 } },
  { name: 'Address: Port Dover Lighthouse', address: { line1: '1 Harbour St', city: 'Port Dover', province: 'ON', postal: 'N3Y 2M4' }, expect: { city: 'Simcoe', province: 'ON', maxKm: 20 } },
  { name: 'Address: Ajax Community Centre', address: { line1: '75 Centennial Rd', city: 'Ajax', province: 'ON', postal: 'L1S 4S4' }, expect: { city: 'Ajax', province: 'ON', maxKm: 12 } },
  { name: 'Address: Western University', address: { line1: '1151 Richmond St', city: 'London', province: 'ON', postal: 'N6A 3K7' }, expect: { city: 'London', province: 'ON', maxKm: 12 } },
];

async function run() {
  console.log('=== Nearest Store Routing Test ===');
  for (const t of TEST_CASES) {
    const resolved = await testCaseToLatLon(t);
    if (resolved.error) {
      console.log(`- ${t.name}: ERROR → ${resolved.error}`);
      continue;
    }
    const { lat, lon } = resolved;
    const { store, distanceKm } = nearestStore(lat, lon);
    const city = store?.city || '';
    const prov = store?.province || '';
    let verdict = 'OK';
    if (t.expect) {
      const cityOk = !t.expect.city || city.toLowerCase() === t.expect.city.toLowerCase();
      const provOk = !t.expect.province || prov.toUpperCase() === t.expect.province.toUpperCase();
      const distOk = !t.expect.maxKm || distanceKm <= t.expect.maxKm;
      verdict = cityOk && provOk && distOk ? 'PASS' : `FAIL(city:${cityOk}, prov:${provOk}, dist:${distOk})`;
    }
    console.log(`- ${t.name}: lat=${lat.toFixed(5)}, lon=${lon.toFixed(5)} → store=${store?.id} (${city}, ${prov}) distance=${distanceKm}km → ${verdict}`);
  }
}

run().catch(console.error);


