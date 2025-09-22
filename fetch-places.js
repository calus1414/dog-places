// fetch-places.js
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api/place';

// Business types mapping
const BUSINESS_TYPES = {
  park: 'park',
  pet_store: 'pet_store',
  restaurant: 'restaurant',
  gym: 'gym',
  hospital: 'hospital',
  zoo: 'zoo',
  veterinary_care: 'veterinary_care',
  aquarium: 'aquarium'
};

// Get command line arguments or use defaults
const searchType = process.argv[2] || process.env.INPUT_SEARCH_TYPE || 'park';
const location = process.argv[3] || process.env.INPUT_LOCATION || 'New York, NY';

async function geocodeLocation(location) {
  try {
    const response = await axios.get(`${BASE_URL}/findplacefromtext/json`, {
      params: {
        input: location,
        inputtype: 'textquery',
        fields: 'geometry',
        key: API_KEY
      }
    });

    if (response.data.candidates && response.data.candidates.length > 0) {
      const { lat, lng } = response.data.candidates[0].geometry.location;
      return { lat, lng };
    } else {
      throw new Error(`Could not geocode location: ${location}`);
    }
  } catch (error) {
    console.error('Geocoding error:', error.message);
    // Fallback to NYC coordinates
    return { lat: 40.7128, lng: -74.0060 };
  }
}

async function searchNearbyPlaces(lat, lng, type, radius = 5000) {
  try {
    const response = await axios.get(`${BASE_URL}/nearbysearch/json`, {
      params: {
        location: `${lat},${lng}`,
        radius: radius,
        type: BUSINESS_TYPES[type] || type,
        key: API_KEY
      }
    });

    return response.data.results || [];
  } catch (error) {
    console.error('Places search error:', error.message);
    return [];
  }
}

async function getPlaceDetails(placeId) {
  try {
    const response = await axios.get(`${BASE_URL}/details/json`, {
      params: {
        place_id: placeId,
        fields: 'name,rating,formatted_address,formatted_phone_number,website,opening_hours,price_level,reviews',
        key: API_KEY
      }
    });

    return response.data.result || {};
  } catch (error) {
    console.error('Place details error:', error.message);
    return {};
  }
}

async function main() {
  console.log(`Fetching ${searchType} businesses near ${location}...`);

  if (!API_KEY) {
    console.error('GOOGLE_PLACES_API_KEY environment variable is required');
    process.exit(1);
  }

  try {
    // Geocode the location
    const coordinates = await geocodeLocation(location);
    console.log(`Coordinates: ${coordinates.lat}, ${coordinates.lng}`);

    // Search for nearby places
    const places = await searchNearbyPlaces(coordinates.lat, coordinates.lng, searchType);
    console.log(`Found ${places.length} places`);

    // Get detailed information for top 10 places
    const detailedPlaces = [];
    const topPlaces = places.slice(0, 10);

    for (const place of topPlaces) {
      console.log(`Fetching details for: ${place.name}`);
      const details = await getPlaceDetails(place.place_id);
      
      detailedPlaces.push({
        id: place.place_id,
        name: place.name,
        rating: place.rating,
        user_ratings_total: place.user_ratings_total,
        vicinity: place.vicinity,
        types: place.types,
        price_level: place.price_level,
        geometry: place.geometry,
        ...details
      });

      // Rate limiting - wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Save results
    const timestamp = new Date().toISOString();
    const filename = `${searchType}_${location.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp.split('T')[0]}.json`;
    const filepath = path.join('data', filename);

    const output = {
      timestamp,
      search_type: searchType,
      location,
      coordinates,
      total_found: places.length,
      detailed_places: detailedPlaces
    };

    await fs.writeFile(filepath, JSON.stringify(output, null, 2));
    console.log(`Results saved to: ${filepath}`);

    // Create a summary file
    const summary = {
      timestamp,
      search_type: searchType,
      location,
      total_found: places.length,
      top_rated: detailedPlaces
        .filter(p => p.rating)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 5)
        .map(p => ({
          name: p.name,
          rating: p.rating,
          address: p.formatted_address || p.vicinity
        }))
    };

    await fs.writeFile('data/latest_summary.json', JSON.stringify(summary, null, 2));
    console.log('Summary saved to: data/latest_summary.json');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}