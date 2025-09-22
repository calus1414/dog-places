# Dog Places Brussels - Firebase Fill Script

Script pour remplir automatiquement Firebase avec des données de lieux pour chiens à Bruxelles via Google Places API.

## 🚀 Installation

1. Installez les dépendances :
```bash
npm install
```

## 🔧 Configuration

### 1. Configuration Firebase Admin SDK

Vous devez obtenir une clé de service account Firebase :

1. Allez dans la [Console Firebase](https://console.firebase.google.com/)
2. Sélectionnez votre projet `dog-app-brussels`
3. Allez dans **Paramètres du projet** > **Comptes de service**
4. Cliquez sur **Générer une nouvelle clé privée**
5. Téléchargez le fichier JSON

### 2. Mise à jour du fichier .env

Complétez les variables Firebase Admin dans `.env` avec les valeurs de votre fichier JSON :

```bash
# Remplacez avec vos vraies valeurs
FIREBASE_PRIVATE_KEY_ID=votre_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nvotre_private_key\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@dog-app-brussels.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=votre_client_id
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40dog-app-brussels.iam.gserviceaccount.com
```

## 📍 Données collectées

Le script récupère 4 types de lieux à Bruxelles :

- **Parcs à chiens** - Parcs et espaces dédiés aux chiens
- **Vétérinaires** - Cliniques et cabinets vétérinaires
- **Animaleries** - Magasins d'articles pour animaux
- **Cafés dog-friendly** - Restaurants et cafés acceptant les chiens

## 🏃‍♂️ Exécution

### Méthode 1 : Script npm
```bash
npm run fill-firebase
```

### Méthode 2 : Node direct
```bash
node scripts/fillFirebase.js
```

## 📊 Structure des données Firestore

Chaque lieu est sauvegardé dans la collection `places` avec cette structure :

```javascript
{
  id: "place_id_google",
  name: "Nom du lieu",
  type: "park|veterinary_care|pet_store|restaurant",
  location: {
    latitude: 50.8503,
    longitude: 4.3517
  },
  address: "Adresse complète",
  phone: "+32 2 xxx xx xx",
  website: "https://...",
  rating: 4.5,
  ratingsCount: 123,
  openingHours: ["Lundi: 09:00–18:00", ...],
  priceLevel: 2,
  photos: [{reference: "...", width: 400, height: 300}],
  createdAt: timestamp,
  updatedAt: timestamp
}
```

## 🔧 Paramètres

- **Rayon de recherche** : 10km autour de Bruxelles
- **Limite par catégorie** : 20 lieux maximum
- **Rate limiting** : 100ms entre chaque requête API
- **Batch size** : Sauvegarde par lots pour optimiser Firestore

## 📝 Log d'exécution

Le script affiche :
- Progression de chaque étape
- Nombre de lieux trouvés par catégorie
- Confirmation de sauvegarde
- Statistiques finales

## ⚠️ Prérequis

- Node.js installé
- Clé API Google Places active
- Projet Firebase configuré
- Service Account Key Firebase

## 🔒 Sécurité

- Gardez vos clés API privées
- N'incluez jamais le fichier `.env` dans git
- Utilisez des permissions Firestore restrictives en production