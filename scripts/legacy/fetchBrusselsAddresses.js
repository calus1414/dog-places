const axios = require('axios');
const admin = require('firebase-admin');
require('dotenv').config();

// Configuration
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api/place';
const GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode';

// Communes de Bruxelles-Capitale (19 communes)
const BRUSSELS_MUNICIPALITIES = [
  'Anderlecht',
  'Auderghem',
  'Berchem-Sainte-Agathe',
  'Bruxelles', // Ville de Bruxelles
  'Etterbeek',
  'Evere',
  'Forest',
  'Ganshoren',
  'Ixelles',
  'Jette',
  'Koekelberg',
  'Molenbeek-Saint-Jean',
  'Saint-Gilles',
  'Saint-Josse-ten-Noode',
  'Schaerbeek',
  'Uccle',
  'Watermael-Boitsfort',
  'Woluwe-Saint-Lambert',
  'Woluwe-Saint-Pierre'
];

// Zone de recherche Bruxelles
const BRUSSELS_BOUNDS = {
  north: 50.9073,
  south: 50.7642,
  east: 4.4812,
  west: 4.2423
};

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

// Fonction pour rechercher les adresses par commune
async function searchAddressesByMunicipality(municipality) {
  const addresses = [];

  try {
    console.log(`🔍 Recherche des adresses à ${municipality}...`);

    // Recherche de rues principales dans la commune
    const response = await axios.get(`${BASE_URL}/textsearch/json`, {
      params: {
        query: `rue avenue place boulevard ${municipality} Brussels Belgium`,
        location: '50.8503,4.3517', // Centre de Bruxelles
        radius: 15000,
        type: 'route',
        key: GOOGLE_PLACES_API_KEY
      }
    });

    if (response.data.status === 'OK' && response.data.results) {
      for (const result of response.data.results) {
        // Vérifier que l'adresse est bien dans Bruxelles
        const location = result.geometry.location;
        if (isInBrussels(location.lat, location.lng)) {
          addresses.push({
            place_id: result.place_id,
            name: result.name,
            formatted_address: result.formatted_address,
            municipality: municipality,
            location: {
              latitude: location.lat,
              longitude: location.lng
            },
            types: result.types || [],
            rating: result.rating || 0,
            user_ratings_total: result.user_ratings_total || 0
          });
        }
      }
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));

  } catch (error) {
    console.error(`Erreur pour ${municipality}:`, error.message);
  }

  return addresses;
}

// Recherche systématique par grille géographique
async function searchAddressesByGrid() {
  const addresses = [];
  const gridSize = 0.01; // ~1km

  console.log('🗺️  Recherche par grille géographique...');

  for (let lat = BRUSSELS_BOUNDS.south; lat < BRUSSELS_BOUNDS.north; lat += gridSize) {
    for (let lng = BRUSSELS_BOUNDS.west; lng < BRUSSELS_BOUNDS.east; lng += gridSize) {

      try {
        const response = await axios.get(`${BASE_URL}/nearbysearch/json`, {
          params: {
            location: `${lat},${lng}`,
            radius: 500,
            type: 'street_address|route|subpremise|premise',
            key: GOOGLE_PLACES_API_KEY
          }
        });

        if (response.data.status === 'OK' && response.data.results) {
          for (const result of response.data.results) {
            const location = result.geometry.location;
            if (isInBrussels(location.lat, location.lng)) {
              addresses.push({
                place_id: result.place_id,
                name: result.name,
                formatted_address: result.formatted_address,
                location: {
                  latitude: location.lat,
                  longitude: location.lng
                },
                types: result.types || [],
                vicinity: result.vicinity || ''
              });
            }
          }
        }

        // Rate limiting plus strict pour éviter les quotas
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`Erreur grille ${lat},${lng}:`, error.message);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  return addresses;
}

// Recherche des rues par code postal
async function searchAddressesByPostalCode() {
  const addresses = [];
  // Codes postaux de Bruxelles (1000-1210)
  const postalCodes = [];
  for (let i = 1000; i <= 1210; i++) {
    postalCodes.push(i.toString());
  }

  console.log('📮 Recherche par codes postaux...');

  for (const postalCode of postalCodes) {
    try {
      const response = await axios.get(`${GEOCODING_URL}/json`, {
        params: {
          address: `${postalCode} Brussels Belgium`,
          key: GOOGLE_PLACES_API_KEY
        }
      });

      if (response.data.status === 'OK' && response.data.results) {
        for (const result of response.data.results) {
          const location = result.geometry.location;
          if (isInBrussels(location.lat, location.lng)) {
            addresses.push({
              place_id: result.place_id,
              formatted_address: result.formatted_address,
              postal_code: postalCode,
              location: {
                latitude: location.lat,
                longitude: location.lng
              },
              types: result.types || [],
              address_components: result.address_components || []
            });
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`Erreur code postal ${postalCode}:`, error.message);
    }
  }

  return addresses;
}

// Vérifier si les coordonnées sont dans Bruxelles
function isInBrussels(lat, lng) {
  return lat >= BRUSSELS_BOUNDS.south &&
         lat <= BRUSSELS_BOUNDS.north &&
         lng >= BRUSSELS_BOUNDS.west &&
         lng <= BRUSSELS_BOUNDS.east;
}

// Dédupliquer les adresses
function deduplicateAddresses(addresses) {
  const unique = new Map();

  addresses.forEach(address => {
    const key = address.place_id || `${address.location.latitude},${address.location.longitude}`;
    if (!unique.has(key)) {
      unique.set(key, address);
    }
  });

  return Array.from(unique.values());
}

// Sauvegarder les adresses dans Firestore
async function saveAddressesToFirestore(db, addresses) {
  console.log(`💾 Sauvegarde de ${addresses.length} adresses...`);

  const batch = db.batch();
  const addressesCollection = db.collection('brussels_addresses');

  addresses.forEach((address, index) => {
    const docId = address.place_id || `addr_${index}_${Date.now()}`;
    const docRef = addressesCollection.doc(docId);

    batch.set(docRef, {
      ...address,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });

  try {
    await batch.commit();
    console.log(`✅ ${addresses.length} adresses sauvegardées dans Firestore`);
  } catch (error) {
    console.error('❌ Erreur sauvegarde:', error);
    throw error;
  }
}

// Fonction principale
async function main() {
  console.log('🏠 Démarrage de la collecte d\'adresses de Bruxelles...');

  if (!GOOGLE_PLACES_API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY manquant');
    process.exit(1);
  }

  try {
    const db = initializeFirebase();
    console.log('✅ Firebase initialisé');

    let allAddresses = [];

    // Méthode 1: Recherche par commune
    console.log('\\n📍 Phase 1: Recherche par commune...');
    for (const municipality of BRUSSELS_MUNICIPALITIES) {
      const municipalityAddresses = await searchAddressesByMunicipality(municipality);
      allAddresses = allAddresses.concat(municipalityAddresses);
      console.log(`  ${municipality}: ${municipalityAddresses.length} adresses`);
    }

    // Méthode 2: Recherche par codes postaux
    console.log('\\n📮 Phase 2: Recherche par codes postaux...');
    const postalAddresses = await searchAddressesByPostalCode();
    allAddresses = allAddresses.concat(postalAddresses);
    console.log(`  Codes postaux: ${postalAddresses.length} adresses`);

    // Méthode 3: Recherche par grille (optionnelle, très consommatrice)
    // console.log('\\n🗺️  Phase 3: Recherche par grille...');
    // const gridAddresses = await searchAddressesByGrid();
    // allAddresses = allAddresses.concat(gridAddresses);

    // Dédupliquer
    console.log('\\n🔄 Déduplication...');
    const uniqueAddresses = deduplicateAddresses(allAddresses);
    console.log(`Total avant déduplication: ${allAddresses.length}`);
    console.log(`Total après déduplication: ${uniqueAddresses.length}`);

    // Sauvegarder
    if (uniqueAddresses.length > 0) {
      await saveAddressesToFirestore(db, uniqueAddresses);
    }

    console.log('\\n🎉 Collecte d\'adresses terminée !');
    console.log(`📊 ${uniqueAddresses.length} adresses uniques de Bruxelles collectées`);

  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

// Exécuter le script
if (require.main === module) {
  main();
}

module.exports = { main };