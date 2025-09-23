const axios = require('axios');
const admin = require('firebase-admin');
require('dotenv').config();

// Configuration Geocoding API
const GOOGLE_GEOCODING_API_KEY = process.env.GOOGLE_GEOCODING_API_KEY;
const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const RATE_LIMIT = parseInt(process.env.GEOCODING_RATE_LIMIT || '50');
const DAILY_QUOTA = parseInt(process.env.GEOCODING_QUOTA_PER_DAY || '100000');

// Zones géographiques de Bruxelles (depuis .env)
const BRUSSELS_BOUNDS = {
  north: parseFloat(process.env.BRUSSELS_BOUNDS_NORTH || '50.9228'),
  south: parseFloat(process.env.BRUSSELS_BOUNDS_SOUTH || '50.7641'),
  east: parseFloat(process.env.BRUSSELS_BOUNDS_EAST || '4.4821'),
  west: parseFloat(process.env.BRUSSELS_BOUNDS_WEST || '4.2177')
};

// 19 Communes de Bruxelles-Capitale
const BRUSSELS_MUNICIPALITIES = [
  'Anderlecht', 'Auderghem', 'Berchem-Sainte-Agathe', 'Bruxelles',
  'Etterbeek', 'Evere', 'Forest', 'Ganshoren', 'Ixelles', 'Jette',
  'Koekelberg', 'Molenbeek-Saint-Jean', 'Saint-Gilles', 'Saint-Josse-ten-Noode',
  'Schaerbeek', 'Uccle', 'Watermael-Boitsfort', 'Woluwe-Saint-Lambert', 'Woluwe-Saint-Pierre'
];

// Top 100 noms de rues les plus courants à Bruxelles
const TOP_STREET_NAMES = [
  'Rue de la Paix', 'Avenue Louise', 'Boulevard Anspach', 'Rue Neuve', 'Place Eugène Flagey',
  'Chaussée de Wavre', 'Avenue de la Toison d\'Or', 'Rue Antoine Dansaert', 'Boulevard du Régent',
  'Chaussée d\'Ixelles', 'Avenue des Arts', 'Rue Royale', 'Place Sainte-Catherine', 'Rue du Midi',
  'Avenue de Tervueren', 'Chaussée de Charleroi', 'Rue de Namur', 'Boulevard de Waterloo',
  'Avenue Franklin Roosevelt', 'Chaussée de Louvain', 'Rue de Flandre', 'Place du Grand Sablon',
  'Avenue Adolphe Buyl', 'Chaussée de Vleurgat', 'Rue de la Loi', 'Boulevard Saint-Michel',
  'Avenue Brugmann', 'Rue des Bouchers', 'Chaussée de Haecht', 'Avenue Van Volxem',
  'Rue de Laeken', 'Boulevard de la Cambre', 'Avenue de l\'Université', 'Chaussée de Forest',
  'Rue du Bailli', 'Avenue de la Couronne', 'Chaussée de Waterloo', 'Rue de la Régence',
  'Avenue Molière', 'Boulevard Léopold II', 'Rue des Palais', 'Chaussée de Gand',
  'Avenue de Fré', 'Rue de la Station', 'Boulevard Brand Whitlock', 'Avenue Winston Churchill',
  'Chaussée de Boondael', 'Rue de l\'Église', 'Avenue de la Brabançonne', 'Chaussée de Roodebeek',
  'Rue de Stalle', 'Avenue de Jette', 'Boulevard Lambermont', 'Chaussée de Ninove',
  'Avenue Hippodrome', 'Rue de la Croix de Pierre', 'Boulevard Général Jacques', 'Avenue du Derby',
  'Chaussée de Helmet', 'Rue de la Concorde', 'Avenue de l\'Armée', 'Boulevard Sylvain Dupuis',
  'Rue de Rome', 'Chaussée de Jette', 'Avenue de la Chasse', 'Boulevard Louis Schmidt',
  'Rue de Molenbeek', 'Avenue Emile de Beco', 'Chaussée de Bruxelles', 'Rue de Rollebeek',
  'Avenue des Cerisiers', 'Boulevard du Triomphe', 'Chaussée de Verviers', 'Rue de Fierlant',
  'Avenue des Trembles', 'Chaussée de Tubize', 'Rue de la Cambre', 'Boulevard de l\'Abattoir',
  'Avenue Sleeckx', 'Chaussée d\'Alsemberg', 'Rue de Spa', 'Boulevard de Smet de Naeyer',
  'Avenue de Roodebeek', 'Chaussée de Maelbeek', 'Rue de Tenbosch', 'Boulevard Clovis',
  'Avenue des Gaulois', 'Chaussée de Stockel', 'Rue de Livourne', 'Boulevard du Jardin Botanique',
  'Avenue Besme', 'Chaussée de Boitsfort', 'Rue de Verviers', 'Boulevard Maurice Lemonnier',
  'Avenue de l\'Exposition', 'Chaussée de La Hulpe', 'Rue de Merode', 'Boulevard Poincaré',
  'Avenue des Volontaires', 'Chaussée de Ruisbroek', 'Rue de Naples', 'Boulevard de la Woluwe',
  'Avenue Rogier', 'Chaussée de Vilvoorde', 'Rue de Hennin', 'Boulevard Général Wahis',
  'Avenue des Klauwaerts', 'Chaussée de Tervueren', 'Rue de Florence', 'Boulevard Auguste Reyers'
];

// Numéros de rue courants à tester
const COMMON_HOUSE_NUMBERS = [1, 2, 3, 5, 7, 10, 12, 15, 20, 25, 30, 35, 40, 50, 100];

// Compteurs et métriques
let totalRequests = 0;
let successfulRequests = 0;
let totalAddresses = 0;
let requestsThisSecond = 0;
let lastSecondTimestamp = Math.floor(Date.now() / 1000);

// Cache pour déduplication par geohash
const geohashCache = new Set();

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

// Smart Rate Limiting avec burst handling
async function smartRateLimit() {
  const currentSecond = Math.floor(Date.now() / 1000);

  if (currentSecond !== lastSecondTimestamp) {
    // Nouvelle seconde, reset du compteur
    requestsThisSecond = 0;
    lastSecondTimestamp = currentSecond;
  }

  if (requestsThisSecond >= RATE_LIMIT) {
    // Attendre la prochaine seconde
    const waitTime = 1000 - (Date.now() % 1000);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    requestsThisSecond = 0;
    lastSecondTimestamp = Math.floor(Date.now() / 1000);
  }

  requestsThisSecond++;
  totalRequests++;

  // Petit délai pour éviter les burst trop agressifs
  const baseDelay = 1000 / RATE_LIMIT;
  const jitter = Math.random() * 50; // 0-50ms de jitter
  await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
}

// Vérification des quotas
function checkQuotaLimit() {
  if (totalRequests >= DAILY_QUOTA) {
    throw new Error(`Daily quota of ${DAILY_QUOTA} requests reached`);
  }

  const quotaUsagePercent = (totalRequests / DAILY_QUOTA) * 100;
  if (quotaUsagePercent > 90) {
    console.warn(`⚠️  Warning: ${quotaUsagePercent.toFixed(1)}% of daily quota used`);
  }
}

// Géocodage d'une adresse spécifique
async function geocodeAddress(address, retryCount = 0) {
  const maxRetries = 3;

  try {
    await smartRateLimit();
    checkQuotaLimit();

    const response = await axios.get(GEOCODING_URL, {
      params: {
        address: address,
        bounds: `${BRUSSELS_BOUNDS.south},${BRUSSELS_BOUNDS.west}|${BRUSSELS_BOUNDS.north},${BRUSSELS_BOUNDS.east}`,
        region: 'be',
        key: GOOGLE_GEOCODING_API_KEY
      },
      timeout: 10000
    });

    successfulRequests++;

    if (response.data.status === 'OK' && response.data.results.length > 0) {
      return response.data.results.map(result => transformGeocodingResult(result, address));
    } else if (response.data.status === 'ZERO_RESULTS') {
      return [];
    } else {
      console.warn(`⚠️  Geocoding warning for "${address}": ${response.data.status}`);
      return [];
    }

  } catch (error) {
    if (retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
      console.warn(`🔄 Retry ${retryCount + 1}/${maxRetries} for "${address}" in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return geocodeAddress(address, retryCount + 1);
    }

    console.error(`❌ Failed to geocode "${address}": ${error.message}`);
    return [];
  }
}

// Transformation des résultats de géocodage
function transformGeocodingResult(result, originalQuery) {
  const location = result.geometry.location;

  // Vérification que c'est bien dans Bruxelles
  if (!isInBrussels(location.lat, location.lng)) {
    return null;
  }

  // Extraction des composants d'adresse
  const addressComponents = extractAddressComponents(result.address_components);

  return {
    id: `geocoded_${result.place_id || generateId()}`,
    place_id: result.place_id,
    formatted_address: result.formatted_address,
    street_number: addressComponents.street_number,
    street_name: addressComponents.route,
    municipality: addressComponents.locality || addressComponents.administrative_area_level_2,
    postal_code: addressComponents.postal_code,
    location: {
      latitude: location.lat,
      longitude: location.lng
    },
    geometry_type: result.geometry.location_type,
    address_components: result.address_components,
    source: 'Google_Geocoding',
    original_query: originalQuery,
    geohash: calculateGeohash(location.lat, location.lng, 7),
    lastUpdated: new Date(),
    isActive: true,
    confidence: calculateConfidence(result),
    metadata: {
      viewport: result.geometry.viewport,
      types: result.types,
      partial_match: result.partial_match || false
    }
  };
}

// Extraction des composants d'adresse
function extractAddressComponents(components) {
  const result = {};

  for (const component of components) {
    const types = component.types;

    if (types.includes('street_number')) {
      result.street_number = component.long_name;
    } else if (types.includes('route')) {
      result.route = component.long_name;
    } else if (types.includes('locality')) {
      result.locality = component.long_name;
    } else if (types.includes('administrative_area_level_2')) {
      result.administrative_area_level_2 = component.long_name;
    } else if (types.includes('postal_code')) {
      result.postal_code = component.long_name;
    }
  }

  return result;
}

// Calcul du score de confiance
function calculateConfidence(result) {
  let confidence = 100;

  // Pénalise les correspondances partielles
  if (result.partial_match) confidence -= 20;

  // Bonus pour les adresses précises
  if (result.geometry.location_type === 'ROOFTOP') confidence += 0;
  else if (result.geometry.location_type === 'RANGE_INTERPOLATED') confidence -= 5;
  else if (result.geometry.location_type === 'GEOMETRIC_CENTER') confidence -= 10;
  else confidence -= 15;

  // Bonus pour les types d'adresse appropriés
  if (result.types.includes('street_address')) confidence += 5;
  if (result.types.includes('premise')) confidence += 3;

  return Math.max(0, Math.min(100, confidence));
}

// Géohash simple pour déduplication (précision 7 ≈ 150m)
function calculateGeohash(lat, lng, precision = 7) {
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let bits = 0;
  let bit = 0;
  let even = true;
  let geohash = '';

  let latRange = [-90, 90];
  let lngRange = [-180, 180];

  while (geohash.length < precision) {
    if (even) {
      const mid = (lngRange[0] + lngRange[1]) / 2;
      if (lng >= mid) {
        bits = (bits << 1) + 1;
        lngRange[0] = mid;
      } else {
        bits = bits << 1;
        lngRange[1] = mid;
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (lat >= mid) {
        bits = (bits << 1) + 1;
        latRange[0] = mid;
      } else {
        bits = bits << 1;
        latRange[1] = mid;
      }
    }

    even = !even;
    bit++;

    if (bit === 5) {
      geohash += base32[bits];
      bits = 0;
      bit = 0;
    }
  }

  return geohash;
}

// Vérification des coordonnées de Bruxelles
function isInBrussels(lat, lng) {
  return lat >= BRUSSELS_BOUNDS.south &&
         lat <= BRUSSELS_BOUNDS.north &&
         lng >= BRUSSELS_BOUNDS.west &&
         lng <= BRUSSELS_BOUNDS.east;
}

// Déduplication par geohash
function isDuplicate(address) {
  if (!address || !address.geohash) return false;

  if (geohashCache.has(address.geohash)) {
    return true;
  }

  geohashCache.add(address.geohash);
  return false;
}

// Génération d'ID unique
function generateId() {
  return `addr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Sauvegarde par batch dans Firebase
async function saveBatchToFirebase(db, addresses) {
  if (addresses.length === 0) return;

  console.log(`💾 Saving batch of ${addresses.length} addresses to Firebase...`);

  const batch = db.batch();
  const collection = db.collection('brussels_addresses');

  addresses.forEach((address, index) => {
    const docId = address.place_id || address.id;
    const docRef = collection.doc(docId);
    batch.set(docRef, {
      ...address,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });

  try {
    await batch.commit();
    console.log(`✅ Batch saved successfully`);
  } catch (error) {
    console.error(`❌ Error saving batch:`, error.message);
    throw error;
  }
}

// Progress tracking en temps réel
function displayProgress(current, total, municipality, street, number) {
  const percentage = ((current / total) * 100).toFixed(2);
  const eta = calculateETA(current, total);
  const successRate = ((successfulRequests / totalRequests) * 100).toFixed(1);

  process.stdout.write(
    `\r🔄 Progress: ${percentage}% (${current}/${total}) | ` +
    `${municipality} - ${street} #${number} | ` +
    `Success: ${successRate}% | ` +
    `ETA: ${eta} | ` +
    `Quota: ${totalRequests}/${DAILY_QUOTA}`
  );
}

function calculateETA(current, total) {
  if (current === 0) return 'Calculating...';

  const elapsed = Date.now() - startTime;
  const rate = current / elapsed; // addresses per ms
  const remaining = total - current;
  const etaMs = remaining / rate;

  const hours = Math.floor(etaMs / (1000 * 60 * 60));
  const minutes = Math.floor((etaMs % (1000 * 60 * 60)) / (1000 * 60));

  return `${hours}h ${minutes}m`;
}

let startTime;
const BATCH_SIZE = 500;

// Fonction principale
async function main() {
  console.log('🏠 GEOCODAGE EXHAUSTIF DE TOUTES LES ADRESSES DE BRUXELLES');
  console.log('📊 Configuration:');
  console.log(`  • Rate limit: ${RATE_LIMIT} req/sec`);
  console.log(`  • Daily quota: ${DAILY_QUOTA} requests`);
  console.log(`  • Communes: ${BRUSSELS_MUNICIPALITIES.length}`);
  console.log(`  • Rues top: ${TOP_STREET_NAMES.length}`);
  console.log(`  • Numéros: ${COMMON_HOUSE_NUMBERS.length}`);
  console.log(`  • Total estimé: ${BRUSSELS_MUNICIPALITIES.length * TOP_STREET_NAMES.length * COMMON_HOUSE_NUMBERS.length} addresses`);

  if (!GOOGLE_GEOCODING_API_KEY) {
    console.error('❌ GOOGLE_GEOCODING_API_KEY is required');
    process.exit(1);
  }

  try {
    const db = initializeFirebase();
    console.log('✅ Firebase initialized');

    startTime = Date.now();
    let allAddresses = [];
    const totalQueries = BRUSSELS_MUNICIPALITIES.length * TOP_STREET_NAMES.length * COMMON_HOUSE_NUMBERS.length;
    let currentQuery = 0;

    console.log('\n🚀 Starting systematic geocoding...\n');

    // Stratégie systématique : Commune × Rue × Numéro
    for (const municipality of BRUSSELS_MUNICIPALITIES) {
      for (const street of TOP_STREET_NAMES) {
        for (const number of COMMON_HOUSE_NUMBERS) {
          currentQuery++;

          // Construction de l'adresse à géocoder
          const address = `${number} ${street}, ${municipality}, Brussels, Belgium`;

          // Progress tracking
          displayProgress(currentQuery, totalQueries, municipality, street, number);

          try {
            // Géocodage
            const results = await geocodeAddress(address);

            // Filtrage et déduplication
            const validResults = results
              .filter(result => result !== null)
              .filter(result => !isDuplicate(result));

            allAddresses.push(...validResults);
            totalAddresses += validResults.length;

            // Sauvegarde par batch
            if (allAddresses.length >= BATCH_SIZE) {
              await saveBatchToFirebase(db, allAddresses);
              allAddresses = []; // Clear pour le prochain batch
            }

          } catch (error) {
            console.error(`\n❌ Error processing ${address}: ${error.message}`);

            // Si on atteint le quota, on s'arrête
            if (error.message.includes('quota')) {
              console.log('\n🚫 Daily quota reached, stopping...');
              break;
            }
          }
        }

        // Check si on doit s'arrêter pour le quota
        if (totalRequests >= DAILY_QUOTA) break;
      }

      // Check si on doit s'arrêter pour le quota
      if (totalRequests >= DAILY_QUOTA) break;
    }

    // Sauvegarde finale des adresses restantes
    if (allAddresses.length > 0) {
      await saveBatchToFirebase(db, allAddresses);
    }

    // Statistiques finales
    console.log('\n\n🎉 GÉOCODAGE TERMINÉ !');
    console.log('📊 STATISTIQUES FINALES:');
    console.log(`  • Total requêtes: ${totalRequests}`);
    console.log(`  • Requêtes réussies: ${successfulRequests}`);
    console.log(`  • Taux de succès: ${((successfulRequests / totalRequests) * 100).toFixed(1)}%`);
    console.log(`  • Adresses uniques: ${totalAddresses}`);
    console.log(`  • Quota utilisé: ${((totalRequests / DAILY_QUOTA) * 100).toFixed(2)}%`);
    console.log(`  • Durée totale: ${Math.round((Date.now() - startTime) / 1000 / 60)} minutes`);

    // Vérification finale de la collection
    const snapshot = await db.collection('brussels_addresses').get();
    console.log(`  • Documents Firebase: ${snapshot.size}`);

  } catch (error) {
    console.error('\n💥 Erreur fatale:', error);
    process.exit(1);
  }
}

// Export pour utilisation en module
module.exports = { main };

// Exécution directe
if (require.main === module) {
  main();
}