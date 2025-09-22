const admin = require('firebase-admin');
const axios = require('axios');
require('dotenv').config();

// Configuration
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api/place';

// Types de lieux à rechercher
const PLACE_TYPES = [
  { type: 'park', keyword: 'dog park', name: 'Parcs à chiens' },
  { type: 'veterinary_care', keyword: 'veterinaire', name: 'Vétérinaires' },
  { type: 'pet_store', keyword: 'animalerie', name: 'Animaleries' },
  { type: 'restaurant', keyword: 'dog friendly cafe', name: 'Cafés dog-friendly' }
];

// Coordonnées de Bruxelles
const BRUSSELS_COORDINATES = { lat: 50.8503, lng: 4.3517 };
const SEARCH_RADIUS = 10000; // 10km autour de Bruxelles

// Initialiser Firebase Admin
function initializeFirebase() {
  // Validation des variables d'environnement requises
  const requiredVars = [
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_CLIENT_ID',
    'FIREBASE_CLIENT_X509_CERT_URL'
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Variable d'environnement manquante: ${varName}`);
    }
  }

  // Traitement de la private_key pour gérer les différents formats
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Si la clé est encodée en base64 (souvent le cas dans GitHub Actions)
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    try {
      privateKey = Buffer.from(privateKey, 'base64').toString('utf8');
    } catch (error) {
      // Si ce n'est pas du base64, on garde la valeur originale
    }
  }

  // Remplacer les \n littéraux par de vrais retours à la ligne
  privateKey = privateKey.replace(/\\n/g, '\n');

  console.log('🔑 Initialisation Firebase avec les credentials...');
  console.log(`📧 Client email: ${process.env.FIREBASE_CLIENT_EMAIL}`);
  console.log(`🆔 Project ID: ${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}`);

  if (!admin.apps.length) {
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: privateKey,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.firebaseio.com`
    });
  }
  return admin.firestore();
}

// Rechercher des lieux avec Google Places API
async function searchPlaces(type, keyword) {
  try {
    console.log(`Recherche de ${keyword} à Bruxelles...`);

    const response = await axios.get(`${BASE_URL}/nearbysearch/json`, {
      params: {
        location: `${BRUSSELS_COORDINATES.lat},${BRUSSELS_COORDINATES.lng}`,
        radius: SEARCH_RADIUS,
        type: type,
        keyword: keyword,
        key: GOOGLE_PLACES_API_KEY
      }
    });

    if (response.data.status !== 'OK') {
      console.error(`Erreur API Places: ${response.data.status}`);
      return [];
    }

    return response.data.results || [];
  } catch (error) {
    console.error(`Erreur lors de la recherche de ${keyword}:`, error.message);
    return [];
  }
}

// Obtenir les détails d'un lieu
async function getPlaceDetails(placeId) {
  try {
    const response = await axios.get(`${BASE_URL}/details/json`, {
      params: {
        place_id: placeId,
        fields: 'name,formatted_address,formatted_phone_number,website,opening_hours,rating,user_ratings_total',
        key: GOOGLE_PLACES_API_KEY
      }
    });

    return response.data.result || {};
  } catch (error) {
    console.error(`Erreur lors de la récupération des détails:`, error.message);
    return {};
  }
}

// Transformer les données pour Firestore
function transformPlaceData(place, details, category) {
  return {
    id: place.place_id,
    name: place.name,
    type: category,
    location: {
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng
    },
    address: details.formatted_address || place.vicinity || '',
    phone: details.formatted_phone_number || '',
    website: details.website || '',
    rating: place.rating || 0,
    ratingsCount: place.user_ratings_total || 0,
    openingHours: details.opening_hours?.weekday_text || [],
    priceLevel: place.price_level || 0,
    photos: place.photos?.slice(0, 3).map(photo => ({
      reference: photo.photo_reference,
      width: photo.width,
      height: photo.height
    })) || [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

// Sauvegarder par batch dans Firestore
async function savePlacesToFirestore(db, places) {
  const batch = db.batch();
  const placesCollection = db.collection('places');

  places.forEach(place => {
    const docRef = placesCollection.doc(place.id);
    batch.set(docRef, place, { merge: true });
  });

  try {
    await batch.commit();
    console.log(`✅ ${places.length} lieux sauvegardés dans Firestore`);
  } catch (error) {
    console.error('Erreur lors de la sauvegarde:', error);
    throw error;
  }
}

// Fonction principale
async function main() {
  console.log('🚀 Démarrage du script de remplissage Firebase...');

  // Vérifier les variables d'environnement
  if (!GOOGLE_PLACES_API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY manquant dans .env');
    process.exit(1);
  }

  if (!process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) {
    console.error('❌ Configuration Firebase manquante dans .env');
    process.exit(1);
  }

  try {
    // Initialiser Firebase
    const db = initializeFirebase();
    console.log('✅ Firebase initialisé');

    let totalPlaces = 0;

    // Pour chaque type de lieu
    for (const placeType of PLACE_TYPES) {
      console.log(`\n📍 Recherche: ${placeType.name}`);

      // Rechercher les lieux
      const places = await searchPlaces(placeType.type, placeType.keyword);
      console.log(`Trouvé ${places.length} lieux`);

      if (places.length === 0) continue;

      // Obtenir les détails et transformer les données
      const transformedPlaces = [];

      for (const place of places.slice(0, 20)) { // Limiter à 20 par catégorie
        console.log(`  📝 Traitement: ${place.name}`);

        const details = await getPlaceDetails(place.place_id);
        const transformedPlace = transformPlaceData(place, details, placeType.type);
        transformedPlaces.push(transformedPlace);

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Sauvegarder par batch
      if (transformedPlaces.length > 0) {
        await savePlacesToFirestore(db, transformedPlaces);
        totalPlaces += transformedPlaces.length;
      }

      // Pause entre les catégories
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n🎉 Script terminé! ${totalPlaces} lieux ajoutés à Firebase`);
    console.log('📊 Résumé par catégorie:');

    // Afficher les statistiques
    for (const placeType of PLACE_TYPES) {
      const snapshot = await db.collection('places')
        .where('type', '==', placeType.type)
        .get();
      console.log(`  ${placeType.name}: ${snapshot.size} lieux`);
    }

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