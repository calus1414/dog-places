const admin = require('firebase-admin');
require('dotenv').config();

// Script simple pour tester la connexion Firebase
async function testFirebaseConnection() {
  console.log('🧪 Test de connexion Firebase...');

  try {
    // Validation des variables d'environnement
    const requiredVars = [
      'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
      'FIREBASE_PRIVATE_KEY_ID',
      'FIREBASE_PRIVATE_KEY',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_CLIENT_ID',
      'FIREBASE_CLIENT_X509_CERT_URL'
    ];

    console.log('📋 Vérification des variables d\'environnement...');
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        console.error(`❌ Variable manquante: ${varName}`);
        return;
      } else {
        console.log(`✅ ${varName}: définie`);
      }
    }

    // Traitement de la private key
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    console.log('🔑 Traitement de la private key...');
    console.log(`📏 Longueur originale: ${privateKey.length} caractères`);
    console.log(`🔍 Contient BEGIN PRIVATE KEY: ${privateKey.includes('-----BEGIN PRIVATE KEY-----')}`);

    // Si la clé est encodée en base64
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      try {
        console.log('🔄 Tentative de décodage base64...');
        privateKey = Buffer.from(privateKey, 'base64').toString('utf8');
        console.log(`✅ Décodage réussi, nouvelle longueur: ${privateKey.length}`);
      } catch (error) {
        console.log('⚠️  Pas de décodage base64 nécessaire');
      }
    }

    // Remplacer les \n littéraux
    privateKey = privateKey.replace(/\\n/g, '\n');
    console.log(`🔄 Après remplacement \\n: ${privateKey.length} caractères`);

    // Initialiser Firebase
    console.log('🚀 Initialisation Firebase Admin...');
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

    console.log('✅ Firebase initialisé avec succès');

    // Test de connexion Firestore
    console.log('🗄️  Test de connexion Firestore...');
    const db = admin.firestore();

    // Créer un document de test
    const testDoc = await db.collection('test').add({
      message: 'Test de connexion',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Document de test créé: ${testDoc.id}`);

    // Lire le document
    const doc = await testDoc.get();
    console.log('✅ Document lu avec succès:', doc.data());

    // Supprimer le document de test
    await testDoc.delete();
    console.log('✅ Document de test supprimé');

    console.log('🎉 Test de connexion Firebase réussi !');

  } catch (error) {
    console.error('❌ Erreur lors du test:', error.message);
    if (error.code) {
      console.error('🔍 Code d\'erreur:', error.code);
    }
  }
}

// Exécuter le test
if (require.main === module) {
  testFirebaseConnection();
}

module.exports = { testFirebaseConnection };