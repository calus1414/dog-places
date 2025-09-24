const axios = require('axios');
const admin = require('firebase-admin');
require('dotenv').config();

// Configuration optimisée pour rapidité
const GOOGLE_GEOCODING_API_KEY = process.env.GOOGLE_GEOCODING_API_KEY;
const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const RATE_LIMIT = 40; // Plus conservateur
const DAILY_QUOTA = parseInt(process.env.GEOCODING_QUOTA_PER_DAY || '50000');

// Zones de Bruxelles
const BRUSSELS_BOUNDS = {
  north: parseFloat(process.env.BRUSSELS_BOUNDS_NORTH || '50.9228'),
  south: parseFloat(process.env.BRUSSELS_BOUNDS_SOUTH || '50.7641'),
  east: parseFloat(process.env.BRUSSELS_BOUNDS_EAST || '4.4821'),
  west: parseFloat(process.env.BRUSSELS_BOUNDS_WEST || '4.2177')
};

// Stratégie optimisée - seulement les rues principales par commune
const MUNICIPALITIES_WITH_MAIN_STREETS = {
  'Bruxelles': ['Rue Neuve', 'Boulevard Anspach', 'Rue Royale', 'Rue de la Loi'],
  'Ixelles': ['Avenue Louise', 'Chaussée d\'Ixelles', 'Rue du Bailli', 'Avenue de la Toison d\'Or'],
  'Schaerbeek': ['Chaussée de Haecht', 'Boulevard Lambermont', 'Avenue Louis Bertrand'],
  'Uccle': ['Chaussée de Waterloo', 'Avenue Brugmann', 'Avenue de Fré'],
  'Anderlecht': ['Chaussée de Mons', 'Rue de Birmingham', 'Avenue Van Volxem'],
  'Etterbeek': ['Chaussée de Wavre', 'Avenue des Arts', 'Rue Gray'],
  'Saint-Gilles': ['Chaussée de Charleroi', 'Rue de la Victoire', 'Avenue Ducpétiaux'],
  'Molenbeek-Saint-Jean': ['Chaussée de Gand', 'Boulevard Léopold II', 'Rue de Ribaucourt'],
  'Forest': ['Chaussée de Forest', 'Avenue Van Volxem', 'Rue du Croissant'],
  'Woluwe-Saint-Lambert': ['Avenue de Tervueren', 'Chaussée de Roodebeek', 'Avenue Emile Vandervelde'],
  'Woluwe-Saint-Pierre': ['Avenue de Tervueren', 'Avenue des Éperviers', 'Avenue de la Chapelle'],
  'Auderghem': ['Chaussée de Wavre', 'Avenue des Héros', 'Boulevard du Souverain'],
  'Watermael-Boitsfort': ['Chaussée de La Hulpe', 'Avenue Léopold Wiener', 'Avenue de la Foresterie'],
  'Evere': ['Chaussée de Louvain', 'Avenue des Anciens Combattants', 'Rue Saint-Vincent'],
  'Jette': ['Chaussée de Wemmel', 'Avenue de Jette', 'Boulevard de Smet de Naeyer'],
  'Ganshoren': ['Avenue Charles-Quint', 'Avenue du Château', 'Avenue Jacques Sermon'],
  'Koekelberg': ['Chaussée de Jette', 'Avenue de la Basilique', 'Rue Henri Werrie'],
  'Berchem-Sainte-Agathe': ['Avenue du Roi Albert', 'Avenue de la Liberté', 'Rue Cornet de Grez'],
  'Saint-Josse-ten-Noode': ['Chaussée de Louvain', 'Rue Royale Sainte-Marie', 'Rue de la Limite']
};

// Numéros optimisés - plus ciblés
const NUMBERS = [1, 5, 10, 20, 50, 100];

// Compteurs
let totalRequests = 0;
let totalAddresses = 0;
let startTime;

// Cache simple
const addressCache = new Set();

// Initialiser Firebase
function initializeFirebase() {
  if (!admin.apps.length) {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      try {
        privateKey = Buffer.from(privateKey, 'base64').toString('utf8');
      } catch (error) {}
    }
    privateKey = privateKey.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: privateKey,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
      })
    });
  }
  return admin.firestore();
}

// Rate limiting simple et efficace
async function waitForRateLimit() {
  const delay = 1000 / RATE_LIMIT;
  await new Promise(resolve => setTimeout(resolve, delay));
}

// Géocodage rapide
async function geocodeAddressFast(address) {
  totalRequests++;

  try {
    await waitForRateLimit();

    const response = await axios.get(GEOCODING_URL, {
      params: {
        address: address,
        bounds: `${BRUSSELS_BOUNDS.south},${BRUSSELS_BOUNDS.west}|${BRUSSELS_BOUNDS.north},${BRUSSELS_BOUNDS.east}`,
        region: 'be',
        key: GOOGLE_GEOCODING_API_KEY
      },
      timeout: 5000
    });

    if (response.data.status === 'OK' && response.data.results.length > 0) {
      return response.data.results
        .map(result => processResult(result, address))
        .filter(result => result && isInBrussels(result.location.latitude, result.location.longitude));
    }

    return [];

  } catch (error) {
    console.error(`Error geocoding ${address}:`, error.message);
    return [];
  }
}

// Traitement simple des résultats
function processResult(result, originalQuery) {
  const location = result.geometry.location;
  const addressKey = `${Math.round(location.lat * 10000)},${Math.round(location.lng * 10000)}`;

  // Déduplication simple
  if (addressCache.has(addressKey)) {
    return null;
  }
  addressCache.add(addressKey);

  const components = {};
  result.address_components.forEach(comp => {
    if (comp.types.includes('street_number')) components.street_number = comp.long_name;
    if (comp.types.includes('route')) components.route = comp.long_name;
    if (comp.types.includes('locality')) components.locality = comp.long_name;
    if (comp.types.includes('postal_code')) components.postal_code = comp.long_name;
  });

  return {
    id: result.place_id || `geo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    place_id: result.place_id,
    formatted_address: result.formatted_address,
    street_number: components.street_number,
    street_name: components.route,
    municipality: components.locality,
    postal_code: components.postal_code,
    location: {
      latitude: location.lat,
      longitude: location.lng
    },
    source: 'Google_Geocoding_Fast',
    original_query: originalQuery,
    confidence: result.geometry.location_type === 'ROOFTOP' ? 100 : 80,
    lastUpdated: new Date(),
    isActive: true
  };
}

// Vérification Bruxelles
function isInBrussels(lat, lng) {
  return lat >= BRUSSELS_BOUNDS.south && lat <= BRUSSELS_BOUNDS.north &&
         lng >= BRUSSELS_BOUNDS.west && lng <= BRUSSELS_BOUNDS.east;
}

// Sauvegarde rapide
async function quickSave(db, addresses) {
  if (addresses.length === 0) return;

  const batch = db.batch();
  const collection = db.collection('brussels_addresses');

  addresses.forEach(address => {
    const docRef = collection.doc(address.id);
    batch.set(docRef, {
      ...address,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });

  try {
    await batch.commit();
    console.log(`✅ Saved ${addresses.length} addresses`);
  } catch (error) {
    console.error('❌ Save error:', error.message);
  }
}

// Progress simple
function showProgress(current, total, municipality) {
  const pct = ((current / total) * 100).toFixed(1);
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const rate = current / elapsed;
  const eta = Math.round((total - current) / rate / 60);

  process.stdout.write(`\r🔄 ${pct}% (${current}/${total}) | ${municipality} | ${totalAddresses} addresses | ETA: ${eta}m`);
}

// Fonction principale optimisée
async function main() {
  console.log('🚀 GÉOCODAGE RAPIDE DES ADRESSES DE BRUXELLES');

  const totalWork = Object.values(MUNICIPALITIES_WITH_MAIN_STREETS)
    .reduce((sum, streets) => sum + streets.length * NUMBERS.length, 0);

  console.log(`📊 Total estimé: ${totalWork} requêtes`);

  if (!GOOGLE_GEOCODING_API_KEY) {
    console.error('❌ GOOGLE_GEOCODING_API_KEY missing');
    process.exit(1);
  }

  try {
    const db = initializeFirebase();
    startTime = Date.now();

    let allAddresses = [];
    let currentWork = 0;

    for (const [municipality, streets] of Object.entries(MUNICIPALITIES_WITH_MAIN_STREETS)) {
      for (const street of streets) {
        for (const number of NUMBERS) {
          currentWork++;

          showProgress(currentWork, totalWork, municipality);

          const address = `${number} ${street}, ${municipality}, Brussels, Belgium`;
          const results = await geocodeAddressFast(address);

          allAddresses.push(...results);
          totalAddresses += results.length;

          // Sauvegarde tous les 100
          if (allAddresses.length >= 100) {
            await quickSave(db, allAddresses);
            allAddresses = [];
          }

          // Arrêt si quota proche
          if (totalRequests >= DAILY_QUOTA * 0.9) {
            console.log('\n🛑 Quota limit approaching, stopping');
            break;
          }
        }
      }
    }

    // Sauvegarde finale
    if (allAddresses.length > 0) {
      await quickSave(db, allAddresses);
    }

    // Stats finales
    const duration = Math.round((Date.now() - startTime) / 1000 / 60);
    console.log('\n\n🎉 TERMINÉ !');
    console.log(`📊 ${totalRequests} requêtes en ${duration} minutes`);
    console.log(`📍 ${totalAddresses} adresses collectées`);
    console.log(`⚡ ${Math.round(totalRequests / duration)} req/min`);

  } catch (error) {
    console.error('💥 Erreur:', error);
    process.exit(1);
  }
}

module.exports = { main };

if (require.main === module) {
  main();
}