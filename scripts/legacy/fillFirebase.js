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

  console.log('🔍 DEBUG - Variables Firebase:');
  console.log(`📧 Client email: ${process.env.FIREBASE_CLIENT_EMAIL}`);
  console.log(`🆔 Project ID: ${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}`);
  console.log(`🔑 Private key type: ${typeof privateKey}`);
  console.log(`🔑 Private key length: ${privateKey ? privateKey.length : 'undefined'}`);
  console.log(`🔑 Private key start: ${privateKey ? privateKey.substring(0, 50) + '...' : 'undefined'}`);

  if (!privateKey || typeof privateKey !== 'string') {
    throw new Error(`FIREBASE_PRIVATE_KEY n'est pas définie ou n'est pas une string. Type reçu: ${typeof privateKey}`);
  }

  // Si la clé est encodée en base64 (souvent le cas dans GitHub Actions)
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    console.log('🔄 Tentative de décodage base64...');
    try {
      const decoded = Buffer.from(privateKey, 'base64').toString('utf8');
      console.log(`✅ Décodage base64 réussi. Nouvelle longueur: ${decoded.length}`);
      privateKey = decoded;
    } catch (error) {
      console.log('⚠️  Échec du décodage base64, utilisation de la valeur originale');
    }
  }

  // Remplacer les \n littéraux par de vrais retours à la ligne
  privateKey = privateKey.replace(/\\n/g, '\n');

  console.log(`🔑 Private key finale - Type: ${typeof privateKey}, Longueur: ${privateKey.length}`);
  console.log(`🔑 Contient BEGIN: ${privateKey.includes('-----BEGIN PRIVATE KEY-----')}`);
  console.log(`🔑 Contient END: ${privateKey.includes('-----END PRIVATE KEY-----')}`);

  console.log('🔑 Initialisation Firebase avec les credentials...');

  if (!admin.apps.length) {
    // Approche alternative : créer les credentials via applicationDefault() ou avec un objet JSON
    let credential;

    try {
      // Méthode 1: Essayer avec l'objet service account
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

      console.log('📝 Service Account object créé:');
      Object.keys(serviceAccount).forEach(key => {
        if (key === 'private_key') {
          console.log(`  ${key}: ${typeof serviceAccount[key]} (${serviceAccount[key] ? serviceAccount[key].length : 0} chars)`);
        } else {
          console.log(`  ${key}: ${serviceAccount[key] ? '✅' : '❌'}`);
        }
      });

      credential = admin.credential.cert(serviceAccount);
      console.log('✅ Credential créé avec succès');

    } catch (error) {
      console.error('❌ Erreur lors de la création du credential:', error.message);

      // Méthode 2: Essayer avec les variables d'environnement directes
      console.log('🔄 Tentative avec les variables d\'environnement directes...');

      // Définir les variables pour applicationDefault()
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
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
      });

      try {
        credential = admin.credential.applicationDefault();
        console.log('✅ Credential applicationDefault créé');
      } catch (error2) {
        console.error('❌ Erreur applicationDefault aussi:', error2.message);
        throw error; // Relancer l'erreur originale
      }
    }

    admin.initializeApp({
      credential: credential,
      databaseURL: `https://${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.firebaseio.com`
    });
  }
  return admin.firestore();
}

// Rechercher des lieux avec Google Places API (AVEC PROTECTION BOUCLE INFINIE)
async function searchPlaces(type, keyword) {
  try {
    console.log(`Recherche de ${keyword} à Bruxelles...`);

    let allResults = [];
    let nextPageToken = null;
    let pageCount = 0;
    const MAX_PAGES = 5; // LIMITE STRICTE
    const GLOBAL_TIMEOUT = 5 * 60 * 1000; // 5 minutes MAX
    const startTime = Date.now();

    do {
      // VÉRIFICATIONS DE SÉCURITÉ
      pageCount++;
      if (pageCount > MAX_PAGES) {
        console.warn(`⚠️ ARRÊT: Limite de ${MAX_PAGES} pages atteinte pour ${keyword}`);
        break;
      }

      if ((Date.now() - startTime) > GLOBAL_TIMEOUT) {
        console.error(`🕐 ARRÊT: Timeout global atteint pour ${keyword} (${GLOBAL_TIMEOUT}ms)`);
        break;
      }

      const params = {
        location: `${BRUSSELS_COORDINATES.lat},${BRUSSELS_COORDINATES.lng}`,
        radius: SEARCH_RADIUS,
        type: type,
        keyword: keyword,
        key: GOOGLE_PLACES_API_KEY
      };

      // Ajouter pagetoken seulement si on en a un
      if (nextPageToken) {
        params.pagetoken = nextPageToken;
        // Délai obligatoire pour pagetoken
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log(`📄 Page ${pageCount}/${MAX_PAGES} pour ${keyword}`);

      const response = await axios.get(`${BASE_URL}/nearbysearch/json`, {
        params,
        timeout: 10000 // 10s timeout par requête
      });

      if (response.data.status !== 'OK') {
        console.error(`❌ Erreur API Places page ${pageCount}: ${response.data.status}`);
        break;
      }

      const results = response.data.results || [];
      allResults = allResults.concat(results);
      nextPageToken = response.data.next_page_token;

      console.log(`✅ Page ${pageCount}: ${results.length} résultats (total: ${allResults.length})`);

      // ARRÊT si pas de nextPageToken ou si on a assez de résultats
      if (!nextPageToken || allResults.length >= 60) {
        console.log(`🏁 Arrêt recherche ${keyword}: ${nextPageToken ? 'limite résultats' : 'pas de page suivante'}`);
        break;
      }

    } while (
      nextPageToken &&
      allResults.length < 60 &&
      pageCount < MAX_PAGES &&
      (Date.now() - startTime) < GLOBAL_TIMEOUT
    );

    console.log(`🎯 Total ${keyword}: ${allResults.length} résultats en ${pageCount} pages`);
    return allResults;

  } catch (error) {
    console.error(`💥 Erreur fatale lors de la recherche de ${keyword}:`, error.message);
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

// Fonction principale AVEC TIMEOUT GLOBAL
async function main() {
  console.log('🚀 Démarrage du script de remplissage Firebase...');

  // TIMEOUT GLOBAL STRICT - 15 MINUTES MAX
  const SCRIPT_TIMEOUT = 15 * 60 * 1000; // 15 minutes
  const scriptStartTime = Date.now();

  // Setup timeout global qui force l'arrêt
  const globalTimeout = setTimeout(() => {
    console.error('🚨 ARRÊT FORCÉ: Timeout global de 15 minutes atteint !');
    process.exit(1);
  }, SCRIPT_TIMEOUT);

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
      // VÉRIFICATION TIMEOUT À CHAQUE ÉTAPE
      if ((Date.now() - scriptStartTime) > (SCRIPT_TIMEOUT - 60000)) { // Arrêt 1 min avant timeout
        console.warn('⏰ Approche du timeout global, arrêt préventif');
        break;
      }

      console.log(`\n📍 Recherche: ${placeType.name}`);

      // Rechercher les lieux
      const places = await searchPlaces(placeType.type, placeType.keyword);
      console.log(`Trouvé ${places.length} lieux`);

      if (places.length === 0) continue;

      // Obtenir les détails et transformer les données
      const transformedPlaces = [];

      for (const place of places.slice(0, 15)) { // RÉDUIT à 15 par catégorie pour plus de rapidité
        // VÉRIFICATION TIMEOUT DANS LA BOUCLE
        if ((Date.now() - scriptStartTime) > (SCRIPT_TIMEOUT - 120000)) { // Arrêt 2 min avant timeout
          console.warn('⏰ Timeout imminent, arrêt de la collecte de détails');
          break;
        }

        console.log(`  📝 Traitement: ${place.name}`);

        const details = await getPlaceDetails(place.place_id);
        const transformedPlace = transformPlaceData(place, details, placeType.type);
        transformedPlaces.push(transformedPlace);

        // Rate limiting réduit
        await new Promise(resolve => setTimeout(resolve, 50)); // Réduit de 100ms à 50ms
      }

      // Sauvegarder par batch
      if (transformedPlaces.length > 0) {
        await savePlacesToFirestore(db, transformedPlaces);
        totalPlaces += transformedPlaces.length;
      }

      // Pause réduite entre les catégories
      await new Promise(resolve => setTimeout(resolve, 500)); // Réduit de 1000ms à 500ms
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

    // NETTOYER LE TIMEOUT À LA FIN
    clearTimeout(globalTimeout);
    const executionTime = Math.round((Date.now() - scriptStartTime) / 1000);
    console.log(`⏱️  Temps d'exécution total: ${executionTime}s`);

  } catch (error) {
    console.error('❌ Erreur:', error);
    clearTimeout(globalTimeout); // Nettoyer le timeout même en cas d'erreur
    process.exit(1);
  } finally {
    clearTimeout(globalTimeout); // Sécurité supplémentaire
  }
}

// Exécuter le script
if (require.main === module) {
  main();
}

module.exports = { main };