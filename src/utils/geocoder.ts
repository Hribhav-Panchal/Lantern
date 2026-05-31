const KNOWN_CITIES: Record<string, { lat: number; lng: number }> = {
  sanjose: { lat: 37.3382, lng: -121.8863 },
  paloalto: { lat: 37.4419, lng: -122.1430 },
  sanfrancisco: { lat: 37.7749, lng: -122.4194 },
  losangeles: { lat: 34.0522, lng: -118.2437 },
  sandiego: { lat: 32.7157, lng: -117.1611 },
  sacramento: { lat: 38.5816, lng: -121.4944 },
  newyork: { lat: 40.7128, lng: -74.0060 },
  boston: { lat: 42.3601, lng: -71.0589 },
  chicago: { lat: 41.8781, lng: -87.6298 },
  houston: { lat: 29.7604, lng: -95.3698 },
  seattle: { lat: 47.6062, lng: -122.3321 },
  austin: { lat: 30.2672, lng: -97.7431 },
  denver: { lat: 39.7392, lng: -104.9903 },
  miami: { lat: 25.7617, lng: -80.1918 },
  philadelphia: { lat: 39.9526, lng: -75.1652 },
  phoenix: { lat: 33.4484, lng: -112.0740 },
  dallas: { lat: 32.7767, lng: -96.7970 },
  atlanta: { lat: 33.7490, lng: -84.3880 },
};

export async function geocodeCity(cityName: string | null, stateCode: string | null): Promise<{ lat: number; lng: number } | null> {
  if (!cityName) return null;

  const normalizedCityName = cityName.toLowerCase().replace(/\s+/g, "");
  const lookupKey = normalizedCityName;

  // 1. Check offline database first
  if (KNOWN_CITIES[lookupKey]) {
    return KNOWN_CITIES[lookupKey];
  }

  // 2. Query free Nominatim API
  try {
    const searchString = `${cityName}${stateCode ? `, ${stateCode}` : ""}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchString)}&limit=1`;
    
    // User Agent is required by Nominatim terms of service
    const response = await fetch(url, {
      headers: {
        "User-Agent": "TrialBridgeClinicalTrialNavigator/1.0"
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
      }
    }
  } catch (error) {
    console.warn("Geocoding fetch failed, falling back mapping:", error);
  }

  // 3. Fallback to San Jose if we literally can't find anything but the user specified a location
  return KNOWN_CITIES.sanjose;
}
