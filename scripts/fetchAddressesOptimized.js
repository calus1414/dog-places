const axios = require('axios');
const admin = require('firebase-admin');
require('dotenv').config();

// Configuration optimisée pour éviter les quotas
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api/place';
const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode';

// Rate limiting intelligent
const RATE_LIMITS = {
  standard: 100,    // 100ms entre requêtes normales
  quota_safe: 500,  // 500ms quand on approche du quota
  error_recovery: 2000 // 2s après une erreur
};

// Communes prioritaires (centres urbains d'abord)
const PRIORITY_MUNICIPALITIES = [
  'Bruxelles',        // Centre
  'Ixelles',          // Très dense
  'Schaerbeek',       // Très dense
  'Saint-Gilles',     // Dense
  'Etterbeek',        // Dense
  'Uccle',            // Grande commune
  'Anderlecht',       // Grande commune
  'Molenbeek-Saint-Jean',
  'Forest',
  'Woluwe-Saint-Lambert',
  'Woluwe-Saint-Pierre',
  'Auderghem',
  'Watermael-Boitsfort',
  'Evere',
  'Jette',
  'Ganshoren',
  'Koekelberg',
  'Berchem-Sainte-Agathe',
  'Saint-Josse-ten-Noode'
];

// Termes de recherche optimisés pour les adresses
const SEARCH_TERMS = [
  'avenue',
  'rue',
  'boulevard',
  'place',
  'square',
  'chaussée',
  'quai',
  'pont',
  'chemin',
  'drève'
];

let requestCount = 0;
let errorCount = 0;

// Classe pour gérer les quotas intelligemment
class QuotaManager {
  constructor() {
    this.requestsPerMinute = 0;
    this.startTime = Date.now();
    this.lastRequest = 0;
  }

  async waitIfNeeded() {
    const now = Date.now();
    const timeSinceStart = now - this.startTime;

    // Reset counter every minute
    if (timeSinceStart > 60000) {
      this.requestsPerMinute = 0;
      this.startTime = now;
    }

    // Calcul du délai intelligent
    let delay = RATE_LIMITS.standard;

    if (this.requestsPerMinute > 50) {
      delay = RATE_LIMITS.quota_safe;
    }

    if (errorCount > 5) {
      delay = RATE_LIMITS.error_recovery;
    }

    // Attendre le délai minimum entre requêtes
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < delay) {
      await new Promise(resolve => setTimeout(resolve, delay - timeSinceLastRequest));
    }

    this.requestsPerMinute++;
    this.lastRequest = Date.now();
    requestCount++;
  }

  logStatus() {
    console.log(`📊 Requêtes: ${requestCount} | Erreurs: ${errorCount} | RPM: ${this.requestsPerMinute}`);
  }
}

const quotaManager = new QuotaManager();

// Initialiser Firebase (réutilise la logique existante)
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

// Recherche optimisée par commune avec termes spécifiques
async function searchStreetsByMunicipality(municipality, searchTerm) {
  await quotaManager.waitIfNeeded();

  try {
    console.log(`🔍 ${municipality} - ${searchTerm}...`);

    const response = await axios.get(`${BASE_URL}/textsearch/json`, {
      params: {
        query: `${searchTerm} ${municipality} Brussels Belgium`,
        location: '50.8503,4.3517',
        radius: 15000,
        type: 'route',
        key: GOOGLE_PLACES_API_KEY
      }
    });

    if (response.data.status === 'OK') {
      return response.data.results || [];
    } else if (response.data.status === 'ZERO_RESULTS') {
      return [];
    } else {
      console.warn(`⚠️  Status: ${response.data.status} pour ${municipality} - ${searchTerm}`);
      return [];
    }

  } catch (error) {
    errorCount++;
    console.error(`❌ Erreur ${municipality} - ${searchTerm}:`, error.message);

    if (error.response?.status === 429) {
      console.log('🚫 Quota dépassé, attente...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return [];
  }
}

// Recherche incrémentale par codes postaux
async function searchByPostalCodeRange(startCode, endCode) {
  const addresses = [];

  console.log(`📮 Codes postaux ${startCode}-${endCode}...`);

  for (let code = startCode; code <= endCode; code++) {
    await quotaManager.waitIfNeeded();

    try {
      const response = await axios.get(`${GEOCODING_URL}/json`, {
        params: {
          address: `${code} Brussels Belgium`,
          key: GOOGLE_PLACES_API_KEY
        }
      });

      if (response.data.status === 'OK' && response.data.results) {
        addresses.push(...response.data.results.map(result => ({
          place_id: result.place_id,
          formatted_address: result.formatted_address,
          postal_code: code.toString(),
          location: {
            latitude: result.geometry.location.lat,
            longitude: result.geometry.location.lng
          },
          types: result.types || [],
          address_components: result.address_components || []
        })));
      }

    } catch (error) {
      errorCount++;
      console.error(`❌ Erreur code ${code}:`, error.message);
    }
  }

  return addresses;
}

// Fonction de sauvegarde par batch avec gestion d'erreurs
async function saveAddressesToFirestore(db, addresses, batchSize = 500) {
  console.log(`💾 Sauvegarde de ${addresses.length} adresses par batch...`);

  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = db.batch();
    const batchAddresses = addresses.slice(i, i + batchSize);
    const collection = db.collection('brussels_addresses');

    batchAddresses.forEach((address, index) => {
      const docId = address.place_id || `addr_${i + index}_${Date.now()}`;
      const docRef = collection.doc(docId);

      batch.set(docRef, {
        ...address,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    try {
      await batch.commit();
      console.log(`✅ Batch ${Math.floor(i/batchSize) + 1} sauvegardé (${batchAddresses.length} adresses)`);
    } catch (error) {
      console.error(`❌ Erreur batch ${Math.floor(i/batchSize) + 1}:`, error.message);
    }

    // Pause entre batch
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Fonction principale optimisée
async function main() {
  console.log('🏠 Collecte optimisée d\'adresses de Bruxelles...');
  console.log('⚡ Mode quota-safe activé');

  if (!GOOGLE_PLACES_API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY manquant');
    process.exit(1);
  }

  try {
    const db = initializeFirebase();
    console.log('✅ Firebase initialisé');

    // Test rapide - créer au moins quelques adresses de base
    console.log('🧪 Test de création de collection...');
    const testAddresses = [
      {
        place_id: 'test_1000_brussels',
        name: 'Place Eugène Flagey',
        formatted_address: 'Place Eugène Flagey, 1050 Ixelles, Belgium',
        municipality: 'Ixelles',
        location: { latitude: 50.8274, longitude: 4.3719 },
        types: ['establishment', 'point_of_interest'],
        postal_code: '1050'
      },
      {
        place_id: 'test_1000_brussels_2',
        name: 'Grand Place',
        formatted_address: 'Grand Place, 1000 Bruxelles, Belgium',
        municipality: 'Bruxelles',
        location: { latitude: 50.8465, longitude: 4.3525 },
        types: ['establishment', 'point_of_interest'],
        postal_code: '1000'
      }
    ];

    console.log('💾 Sauvegarde des adresses de test...');
    await saveAddressesToFirestore(db, testAddresses);

    let allAddresses = [...testAddresses];

    // Phase 1: Recherche limitée mais garantie
    console.log('\\n📍 Phase 1: Recherche de base...');

    // Juste les 3 principales communes avec 1 terme de recherche
    const priorityCities = ['Bruxelles', 'Ixelles', 'Schaerbeek'];
    const mainSearchTerm = 'avenue';

    for (const municipality of priorityCities) {
      try {
        console.log(`🔍 Recherche: ${municipality} - ${mainSearchTerm}`);
        const results = await searchStreetsByMunicipality(municipality, mainSearchTerm);

        if (results && results.length > 0) {
          results.forEach(result => {
            if (result.geometry && result.geometry.location) {
              const location = result.geometry.location;
              allAddresses.push({
                place_id: result.place_id,
                name: result.name,
                formatted_address: result.formatted_address,
                municipality: municipality,
                search_term: mainSearchTerm,
                location: {
                  latitude: location.lat,
                  longitude: location.lng
                },
                types: result.types || []
              });
            }
          });
          console.log(`  ✅ ${municipality}: ${results.length} résultats`);
        } else {
          console.log(`  ⚠️  ${municipality}: aucun résultat`);
        }

        quotaManager.logStatus();
      } catch (error) {
        console.error(`❌ Erreur ${municipality}:`, error.message);
      }
    }

    // Phase 2: Quelques codes postaux principaux
    console.log('\\n📮 Phase 2: Codes postaux principaux...');
    const mainPostalCodes = [1000, 1050, 1180]; // Centre, Ixelles, Uccle

    for (const code of mainPostalCodes) {
      await quotaManager.waitIfNeeded();

      try {
        console.log(`📮 Code postal: ${code}`);
        const response = await axios.get(`${GEOCODING_URL}/json`, {
          params: {
            address: `${code} Brussels Belgium`,
            key: GOOGLE_PLACES_API_KEY
          }
        });

        if (response.data.status === 'OK' && response.data.results) {
          response.data.results.forEach(result => {
            allAddresses.push({
              place_id: result.place_id,
              formatted_address: result.formatted_address,
              postal_code: code.toString(),
              location: {
                latitude: result.geometry.location.lat,
                longitude: result.geometry.location.lng
              },
              types: result.types || [],
              address_components: result.address_components || []
            });
          });
          console.log(`  ✅ ${code}: ${response.data.results.length} adresses`);
        }

      } catch (error) {
        console.error(`❌ Erreur code ${code}:`, error.message);
      }
    }

    // Déduplication
    console.log('\\n🔄 Déduplication...');
    const unique = new Map();
    allAddresses.forEach(addr => {
      const key = addr.place_id || `${addr.location.latitude},${addr.location.longitude}`;
      if (!unique.has(key)) {
        unique.set(key, addr);
      }
    });

    const uniqueAddresses = Array.from(unique.values());
    console.log(`Avant: ${allAddresses.length} | Après: ${uniqueAddresses.length}`);

    // Sauvegarde finale
    if (uniqueAddresses.length > testAddresses.length) {
      console.log('💾 Sauvegarde des nouvelles adresses...');
      const newAddresses = uniqueAddresses.slice(testAddresses.length);
      await saveAddressesToFirestore(db, newAddresses);
    }

    // Vérification finale
    console.log('\\n🔍 Vérification de la collection...');
    const snapshot = await db.collection('brussels_addresses').limit(5).get();
    console.log(`📊 Collection brussels_addresses contient ${snapshot.size} documents (échantillon)`);

    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`  - ${data.name || data.formatted_address}`);
    });

    console.log('\\n🎉 Collecte terminée !');
    console.log(`📊 Statistiques:`);
    console.log(`  - ${uniqueAddresses.length} adresses uniques`);
    console.log(`  - ${requestCount} requêtes API`);
    console.log(`  - ${errorCount} erreurs`);

  } catch (error) {
    console.error('❌ Erreur principale:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Exécuter le script
if (require.main === module) {
  main();
}

module.exports = { main };