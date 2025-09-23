const axios = require('axios');
const admin = require('firebase-admin');
require('dotenv').config();

// Configuration pour récupération exhaustive
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api/place';
const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode';

// Toutes les communes de Bruxelles-Capitale
const ALL_MUNICIPALITIES = [
  'Anderlecht', 'Auderghem', 'Berchem-Sainte-Agathe', 'Bruxelles',
  'Etterbeek', 'Evere', 'Forest', 'Ganshoren', 'Ixelles', 'Jette',
  'Koekelberg', 'Molenbeek-Saint-Jean', 'Saint-Gilles',
  'Saint-Josse-ten-Noode', 'Schaerbeek', 'Uccle',
  'Watermael-Boitsfort', 'Woluwe-Saint-Lambert', 'Woluwe-Saint-Pierre'
];

// Termes de recherche exhaustifs pour les voies
const STREET_TYPES = [
  'rue', 'avenue', 'boulevard', 'place', 'square', 'chaussée',
  'quai', 'pont', 'chemin', 'drève', 'impasse', 'passage',
  'galerie', 'parvis', 'esplanade', 'cours', 'promenade',
  'sentier', 'allée', 'clos', 'rond-point', 'voie'
];

// Tous les codes postaux de Bruxelles
const BRUSSELS_POSTAL_CODES = [];
for (let i = 1000; i <= 1210; i++) {
  BRUSSELS_POSTAL_CODES.push(i);
}

// Zone géographique de Bruxelles (grille fine)
const BRUSSELS_BOUNDS = {
  north: 50.9073, south: 50.7642,
  east: 4.4812, west: 4.2423
};

let totalRequests = 0;
let totalAddresses = 0;

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

// Rate limiting intelligent
async function smartDelay() {
  // Délai adaptatif basé sur le nombre de requêtes
  const baseDelay = 100;
  const adaptiveDelay = Math.min(baseDelay + (totalRequests % 100) * 10, 1000);
  await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
  totalRequests++;
}

// Méthode 1: Recherche exhaustive par commune et type de voie
async function searchByMunicipalityAndStreetType(municipality, streetType) {
  await smartDelay();

  try {
    const response = await axios.get(`${BASE_URL}/textsearch/json`, {
      params: {
        query: `${streetType} ${municipality} Brussels Belgium`,
        location: '50.8503,4.3517',
        radius: 20000,
        type: 'route',
        key: GOOGLE_PLACES_API_KEY
      }
    });

    if (response.data.status === 'OK') {
      return response.data.results || [];
    }
    return [];
  } catch (error) {
    console.error(`Erreur ${municipality} ${streetType}:`, error.message);
    return [];
  }
}

// Méthode 2: Recherche par code postal avec numéros
async function searchByPostalCodeWithNumbers(postalCode) {
  const addresses = [];

  // Recherche générale pour le code postal
  await smartDelay();
  try {
    const response = await axios.get(`${GEOCODING_URL}/json`, {
      params: {
        address: `${postalCode} Brussels Belgium`,
        key: GOOGLE_PLACES_API_KEY
      }
    });

    if (response.data.status === 'OK') {
      addresses.push(...response.data.results);
    }
  } catch (error) {
    console.error(`Erreur code postal ${postalCode}:`, error.message);
  }

  // Recherche avec numéros de rue communs pour ce code postal
  const commonNumbers = [1, 2, 5, 10, 15, 20, 25, 30, 50, 100];

  for (const num of commonNumbers) {
    await smartDelay();
    try {
      const response = await axios.get(`${GEOCODING_URL}/json`, {
        params: {
          address: `${num} rue ${postalCode} Brussels Belgium`,
          key: GOOGLE_PLACES_API_KEY
        }
      });

      if (response.data.status === 'OK') {
        addresses.push(...response.data.results);
      }
    } catch (error) {
      // Ignore les erreurs pour les numéros spécifiques
    }
  }

  return addresses;
}

// Méthode 3: Recherche par grille géographique fine
async function searchByGeoGrid() {
  const addresses = [];
  const gridSize = 0.005; // Grille très fine (~500m)

  console.log('🗺️  Recherche par grille géographique ultra-fine...');

  for (let lat = BRUSSELS_BOUNDS.south; lat < BRUSSELS_BOUNDS.north; lat += gridSize) {
    for (let lng = BRUSSELS_BOUNDS.west; lng < BRUSSELS_BOUNDS.east; lng += gridSize) {
      await smartDelay();

      try {
        const response = await axios.get(`${BASE_URL}/nearbysearch/json`, {
          params: {
            location: `${lat},${lng}`,
            radius: 300,
            type: 'street_address|route|subpremise|premise|establishment',
            key: GOOGLE_PLACES_API_KEY
          }
        });

        if (response.data.status === 'OK' && response.data.results) {
          const validResults = response.data.results.filter(result => {
            const loc = result.geometry.location;
            return loc.lat >= BRUSSELS_BOUNDS.south &&
                   loc.lat <= BRUSSELS_BOUNDS.north &&
                   loc.lng >= BRUSSELS_BOUNDS.west &&
                   loc.lng <= BRUSSELS_BOUNDS.east;
          });
          addresses.push(...validResults);
        }

        // Log de progression
        if (addresses.length % 100 === 0) {
          console.log(`  Grille: ${addresses.length} adresses trouvées...`);
        }

      } catch (error) {
        // Continue même en cas d'erreur
      }
    }
  }

  return addresses;
}

// Transformation et normalisation des données
function normalizeAddress(result, source) {
  const location = result.geometry?.location || result.location;

  return {
    place_id: result.place_id || `${source}_${Date.now()}_${Math.random()}`,
    name: result.name || '',
    formatted_address: result.formatted_address || '',
    location: {
      latitude: location.lat || location.latitude,
      longitude: location.lng || location.longitude
    },
    types: result.types || [],
    address_components: result.address_components || [],
    source: source,
    vicinity: result.vicinity || '',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

// Sauvegarde massive par batch
async function saveMassiveAddresses(db, addresses) {
  console.log(`💾 Sauvegarde massive de ${addresses.length} adresses...`);

  const batchSize = 500;
  const collection = db.collection('brussels_addresses');

  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = db.batch();
    const batchAddresses = addresses.slice(i, i + batchSize);

    batchAddresses.forEach((address, index) => {
      const docId = address.place_id || `addr_${i + index}_${Date.now()}`;
      const docRef = collection.doc(docId);
      batch.set(docRef, address, { merge: true });
    });

    try {
      await batch.commit();
      console.log(`✅ Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(addresses.length/batchSize)} sauvegardé`);
    } catch (error) {
      console.error(`❌ Erreur batch:`, error.message);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Fonction principale exhaustive
async function main() {
  console.log('🏠 COLLECTE EXHAUSTIVE DE TOUTES LES ADRESSES DE BRUXELLES');
  console.log('⚠️  Cette opération peut prendre plusieurs heures et consommer beaucoup d\'API quota');

  if (!GOOGLE_PLACES_API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY manquant');
    process.exit(1);
  }

  try {
    const db = initializeFirebase();
    console.log('✅ Firebase initialisé');

    let allAddresses = [];

    // PHASE 1: Recherche exhaustive par commune et type de voie
    console.log('\\n📍 PHASE 1: Recherche par communes et types de voies...');
    console.log(`  ${ALL_MUNICIPALITIES.length} communes × ${STREET_TYPES.length} types = ${ALL_MUNICIPALITIES.length * STREET_TYPES.length} recherches`);

    for (const municipality of ALL_MUNICIPALITIES) {
      for (const streetType of STREET_TYPES) {
        console.log(`🔍 ${municipality} - ${streetType}`);
        const results = await searchByMunicipalityAndStreetType(municipality, streetType);

        const normalizedResults = results.map(r => normalizeAddress(r, `municipality_${municipality}_${streetType}`));
        allAddresses.push(...normalizedResults);

        console.log(`  ✅ ${results.length} résultats | Total: ${allAddresses.length}`);
      }
    }

    // PHASE 2: Recherche exhaustive par codes postaux
    console.log('\\n📮 PHASE 2: Recherche par codes postaux avec numéros...');
    console.log(`  ${BRUSSELS_POSTAL_CODES.length} codes postaux`);

    for (const postalCode of BRUSSELS_POSTAL_CODES) {
      console.log(`📮 Code postal: ${postalCode}`);
      const results = await searchByPostalCodeWithNumbers(postalCode);

      const normalizedResults = results.map(r => normalizeAddress(r, `postal_${postalCode}`));
      allAddresses.push(...normalizedResults);

      console.log(`  ✅ ${results.length} résultats | Total: ${allAddresses.length}`);
    }

    // PHASE 3: Recherche par grille géographique (optionnelle mais exhaustive)
    console.log('\\n🗺️  PHASE 3: Recherche par grille géographique...');
    const gridResults = await searchByGeoGrid();
    const normalizedGridResults = gridResults.map(r => normalizeAddress(r, 'geo_grid'));
    allAddresses.push(...normalizedGridResults);

    console.log(`  ✅ ${gridResults.length} résultats de la grille | Total: ${allAddresses.length}`);

    // DÉDUPLICATION MASSIVE
    console.log('\\n🔄 Déduplication massive...');
    const unique = new Map();

    allAddresses.forEach(addr => {
      // Clé basée sur place_id OU coordonnées précises
      let key = addr.place_id;
      if (!key || key.startsWith('addr_')) {
        const lat = Math.round(addr.location.latitude * 10000) / 10000;
        const lng = Math.round(addr.location.longitude * 10000) / 10000;
        key = `${lat},${lng}`;
      }

      if (!unique.has(key)) {
        unique.set(key, addr);
      }
    });

    const uniqueAddresses = Array.from(unique.values());
    console.log(`Avant déduplication: ${allAddresses.length}`);
    console.log(`Après déduplication: ${uniqueAddresses.length}`);

    // SAUVEGARDE MASSIVE
    if (uniqueAddresses.length > 0) {
      await saveMassiveAddresses(db, uniqueAddresses);
    }

    // STATISTIQUES FINALES
    console.log('\\n🎉 COLLECTE EXHAUSTIVE TERMINÉE !');
    console.log(`📊 STATISTIQUES FINALES:`);
    console.log(`  - ${uniqueAddresses.length} adresses uniques`);
    console.log(`  - ${totalRequests} requêtes API totales`);
    console.log(`  - Couverture: ${ALL_MUNICIPALITIES.length} communes`);
    console.log(`  - ${STREET_TYPES.length} types de voies`);
    console.log(`  - ${BRUSSELS_POSTAL_CODES.length} codes postaux`);

    // Vérification finale
    const snapshot = await db.collection('brussels_addresses').get();
    console.log(`  - ${snapshot.size} documents dans Firestore`);

  } catch (error) {
    console.error('❌ Erreur principale:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };