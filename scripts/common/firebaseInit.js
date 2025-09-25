const admin = require('firebase-admin');
require('dotenv').config();

/**
 * 🔧 INITIALISATION FIREBASE COMMUNE
 *
 * Module partagé pour initialiser Firebase Admin SDK
 * avec configuration explicite des variables d'environnement
 */

/**
 * Initialise Firebase Admin SDK avec configuration explicite
 * Utilise les variables d'environnement pour l'authentification
 */
function initializeFirebase() {
    if (admin.apps.length > 0) {
        console.log('✅ Firebase déjà initialisé');
        return; // Déjà initialisé
    }

    const requiredEnvs = [
        'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
        'FIREBASE_PRIVATE_KEY',
        'FIREBASE_CLIENT_EMAIL'
    ];

    // Vérification des variables requises
    const missingEnvs = requiredEnvs.filter(env => !process.env[env]);
    if (missingEnvs.length > 0) {
        throw new Error(`Variables d'environnement Firebase manquantes: ${missingEnvs.join(', ')}`);
    }

    // Configuration Firebase Admin
    const firebaseConfig = {
        type: 'service_account',
        project_id: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
    };

    try {
        admin.initializeApp({
            credential: admin.credential.cert(firebaseConfig),
            projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID
        });

        console.log(`✅ Firebase initialisé (${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID})`);
    } catch (error) {
        throw new Error(`Erreur initialisation Firebase: ${error.message}`);
    }
}

/**
 * Obtient l'instance Firestore après initialisation
 */
function getFirestore() {
    if (admin.apps.length === 0) {
        initializeFirebase();
    }
    return admin.firestore();
}

module.exports = {
    initializeFirebase,
    getFirestore
};