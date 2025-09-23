// geocode.js
export async function geocodePostal(postal) {
  if (!postal) throw new Error('No postal code provided');

  // Normalize Canadian postal: uppercase + insert a space after 3 chars if missing
  const raw = postal.trim().toUpperCase().replace(/\s+/g, '');
  const withSpace = raw.length === 6 ? `${raw.slice(0,3)} ${raw.slice(3)}` : raw;

  const headers = { 'User-Agent': 'ginos-pizza-assistant/1.0 (contact: ops@ginos.example)' };

  // Helper: fetch with timeout
  const fetchJson = async (url) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 4000);
    try {
      console.log('Geocode: fetching', { url });
      const res = await fetch(url, { headers, signal: ac.signal });
      if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  // Try the most precise patterns first, then fall back
  const urls = [
    // 1) Structured search using postalcode param (best for CA)
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&country=Canada&postalcode=${encodeURIComponent(withSpace)}`,
    // 2) Free-text with country
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(withSpace + ' Canada')}`,
    // 3) Fallback to FSA (first 3 chars) centroid
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&country=Canada&postalcode=${encodeURIComponent(withSpace.slice(0,3))}`,
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(withSpace.slice(0,3) + ' Canada')}`,
  ];

  let data = [];
  const pickCanadaHit = (arr) => {
    if (!Array.isArray(arr)) return null;
    const inCanadaBounds = (lat, lon) => lat >= 41 && lat <= 84 && lon >= -141 && lon <= -52;
    for (const item of arr) {
      const lat = parseFloat(item?.lat);
      const lon = parseFloat(item?.lon);
      const cc = item?.address?.country_code;
      const dn = (item?.display_name || '').toLowerCase();
      if (Number.isFinite(lat) && Number.isFinite(lon) && inCanadaBounds(lat, lon)) {
        if (cc === 'ca' || dn.includes('canada')) return item;
      }
    }
    return null;
  };
  for (const url of urls) {
    try {
      const resp = await fetchJson(url);
      const hit = pickCanadaHit(resp);
      if (hit) { data = [hit]; break; }
    } catch (e) {
      // try next; last error will surface if all fail
      console.warn('Geocode attempt failed:', e?.message || e);
    }
  }

  if (!Array.isArray(data) || data.length === 0) {
    // Fallback 2: Zippopotam (some CA postals resolve here when Nominatim misses)
    const zipUrls = [
      `https://api.zippopotam.us/ca/${encodeURIComponent(withSpace.replace(/\s+/g, ''))}`,
      `https://api.zippopotam.us/ca/${encodeURIComponent(withSpace)}`,
    ];
    for (const url of zipUrls) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': headers['User-Agent'] } });
        if (!res.ok) continue;
        const zj = await res.json();
        const place = Array.isArray(zj?.places) && zj.places[0];
        if (place?.latitude && place?.longitude) {
          const lat = parseFloat(place.latitude);
          const lon = parseFloat(place.longitude);
          if (lat >= 41 && lat <= 84 && lon >= -141 && lon <= -52) {
            console.log('Geocode: success (zippopotam fallback)', { postal: withSpace, lat, lon });
            return { lat, lon, displayName: `${zj['post code']} ${place['place name']}, ${place['state abbreviation']}, CA` };
          }
        }
      } catch {}
    }
    throw new Error(`No geocoding result found for "${withSpace}"`);
  }

  const result = {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
  // Final sanity check: ensure Canada bounds
  if (!(result.lat >= 41 && result.lat <= 84 && result.lon >= -141 && result.lon <= -52)) {
    throw new Error('Geocoding out of Canada bounds');
  }
  console.log('Geocode: success', { postal: withSpace, lat: result.lat, lon: result.lon });
  return result;
}
