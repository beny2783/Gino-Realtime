// nearestStore.js
import fs from 'fs';
import path from 'path';

const locationsPath = path.resolve('./ginos_locations.json');
const LOCATIONS = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));

const R = 6371; // Earth radius in km
function toRad(d) { return (d * Math.PI) / 180; }

export function haversineKm(aLat, aLon, bLat, bLon) {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function nearestStore(userLat, userLon) {
  console.log('NearestStore: searching', { userLat, userLon });
  let best = null;
  let bestDist = Infinity;

  for (const s of LOCATIONS) {
    const d = haversineKm(userLat, userLon, s.lat, s.lon);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  const result = { store: best, distanceKm: Math.round(bestDist * 10) / 10 };
  console.log('NearestStore: result', { id: best?.id, distanceKm: result.distanceKm });
  return result;
}


