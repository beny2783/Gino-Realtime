// geocode.js — Google Maps Geocoding (Canada-only)

export async function geocodeAddress(address) {
  if (!address) throw new Error('No address provided');

  const GMAPS_KEY = process.env.GMAPS_KEY;

  if (GMAPS_KEY) {
    try {
      // Clean and prepare the address
      const cleanAddress = address.trim();
      
      // Hard-limit to Canada via components=country:CA
      const base = 'https://maps.googleapis.com/maps/api/geocode/json';
      const qs = new URLSearchParams({
        address: cleanAddress,
        components: 'country:CA',
        key: GMAPS_KEY
      }).toString();
      const url = `${base}?${qs}`;

      // Fetch with a 4s timeout
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 4000);
      try {
        console.log('Geocode (GMAPS): fetching', { url: url.replace(GMAPS_KEY, 'HIDDEN') });
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`Google Geocoding HTTP ${res.status}`);
        const data = await res.json();

        if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
          throw new Error(`No geocoding result (${data.status || 'NO_STATUS'}) for "${cleanAddress}"`);
        }

        const result = data.results[0];
        const country = result.address_components.find(c => c.types.includes('country'))?.short_name;
        if (country !== 'CA') throw new Error(`Resolved outside Canada: ${country || 'UNKNOWN'}`);

        const { lat, lng } = result.geometry.location;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Invalid lat/lon from geocoder');

        console.log('Geocode (GMAPS): success', { address: cleanAddress, lat, lon: lng });
        return { lat, lon: lng, displayName: result.formatted_address };
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      throw new Error(`Google Maps geocoding failed: ${error.message}`);
    }
  } else {
    throw new Error('Google Maps API key required for geocoding');
  }
}

// Backward compatibility
export const geocodePostal = geocodeAddress;