# 🏗️ Architecture Refactorisée - Dog Places Brussels

## 📁 Structure des Dossiers

```
scripts/
├── 🎛️  dataManager.js              # Menu interactif principal
├── 🏠 addresses/                    # GRATUIT (0€)
│   ├── fetchOpenAddresses.js      # OpenAddresses.io + OSM
│   ├── importAddresses.js         # Import Firestore
│   └── validateAddresses.js       # Validation qualité
├── 🐕 places/                       # PAYANT (Google API)
│   ├── fetchGooglePlaces.js       # Google Places API
│   ├── importPlaces.js            # Import Firestore
│   └── validatePlaces.js          # Validation qualité
├── 💾 data/                         # Fichiers temporaires
│   └── .gitignore                 # Exclure données temp
└── 📚 legacy/                       # Anciens scripts
    ├── README.md                  # Documentation legacy
    └── [anciens scripts...]       # Scripts obsolètes
```

## 🔄 Collections Firestore

### 🏠 `brussels_addresses`
- **Source** : OpenAddresses.io + OpenStreetMap
- **Contenu** : ~500,000 adresses résidentielles
- **Coût** : 0€
- **Structure** :
```javascript
{
  id: "commune_rue_numero",
  street: "Avenue Louise",
  number: "123",
  commune: "Ixelles",
  postalCode: "1050",
  coordinates: { latitude: 50.8379, longitude: 4.3592 },
  searchTerms: ["avenue louise", "123 avenue louise", ...],
  source: "OPENADDRESSES|OSM|FALLBACK",
  isActive: true
}
```

### 🐕 `brussels_places`
- **Source** : Google Places API
- **Contenu** : Lieux pour chiens (parcs, vétérinaires, etc.)
- **Coût** : ~$2-5
- **Structure** :
```javascript
{
  id: "google_place_id",
  name: "Parc Josaphat",
  type: "dog_parks",
  category: "Parcs à chiens",
  location: { latitude: 50.8503, longitude: 4.3817 },
  address: "Schaerbeek, Belgium",
  phone: "+32...",
  website: "https://...",
  rating: 4.2,
  isDogFriendly: true,
  source: "Google Places API"
}
```

## 🎯 Scripts Disponibles

### 🎛️ Menu Interactif (RECOMMANDÉ)
```bash
npm start              # Menu principal
npm run menu           # Alias pour le menu
```

### 🏠 Addresses (GRATUIT)
```bash
npm run import:addresses        # Workflow complet
npm run fetch:addresses         # Récupération uniquement
npm run validate:addresses      # Validation uniquement
```

### 🐕 Places (PAYANT)
```bash
npm run import:places          # Workflow complet
npm run fetch:places           # Récupération uniquement
npm run validate:places        # Validation uniquement
```

### 🔍 Validation
```bash
npm run validate:all           # Validation complète
```

### 📚 Legacy (Obsolète)
```bash
npm run legacy:*               # Anciens scripts
```

## ⚡ Comparaison Performance

| Aspect | Ancien Système | Nouveau Système | Gain |
|--------|----------------|-----------------|------|
| **Durée addresses** | 13h+ | 5-10min | **100x** |
| **Coût addresses** | €200+ | €0 | **∞** |
| **Adresses** | ~50,000 | 500,000+ | **10x** |
| **Organisation** | Monolithique | Modulaire | **⭐⭐⭐⭐⭐** |
| **Maintenabilité** | Difficile | Simple | **⭐⭐⭐⭐⭐** |

## 🚀 Workflows

### 🏠 Workflow Addresses (Gratuit)
1. **Fetch** : `fetchOpenAddresses.js`
   - OpenAddresses.io (principal)
   - OpenStreetMap Overpass (fallback)
   - Dataset intégré (fallback final)

2. **Import** : `importAddresses.js`
   - Batch Firestore (500 docs/batch)
   - Génération searchTerms
   - Validation coordonnées

3. **Validate** : `validateAddresses.js`
   - Contrôle qualité
   - Détection doublons
   - Rapport détaillé

### 🐕 Workflow Places (Payant)
1. **Fetch** : `fetchGooglePlaces.js`
   - Text Search API
   - Place Details API
   - Enrichissement données

2. **Import** : `importPlaces.js`
   - Batch Firestore
   - Détection changements
   - Marquage dog-friendly

3. **Validate** : `validatePlaces.js`
   - Contrôle qualité
   - Validation ratings
   - Rapport détaillé

## 🔧 Configuration Requise

### 🏠 Addresses (Aucune config)
```bash
# Aucune clé API requise ✅
npm run import:addresses
```

### 🐕 Places (Google API)
```bash
# Dans .env
GOOGLE_PLACES_API_KEY=votre_clé_ici

# Activer billing Google Cloud ⚠️
npm run import:places
```

## 🎛️ Menu Interactif

Le `dataManager.js` fournit une interface utilisateur complète :

```
🏠 QUE VOULEZ-VOUS IMPORTER ?

1. 🏠 ADDRESSES (💰 GRATUIT)
2. 🐕 PLACES (💳 PAYANT)
3. 🚀 LES DEUX (Séquentiellement)
4. 🔍 VALIDATION & MAINTENANCE
5. 📊 STATUTS & INFORMATIONS
```

## 🗂️ Séparation Claire

### ✅ Avantages
- **Coûts transparents** : Gratuit vs Payant
- **Workflows séparés** : Pas de confusion
- **Collections distinctes** : Addresses ≠ Places
- **Sources optimales** : Chaque type sa meilleure source
- **Maintenance facile** : Scripts modulaires

### 🔄 Migration
- Anciens scripts → `scripts/legacy/`
- Nouveaux scripts → `scripts/addresses/` + `scripts/places/`
- Menu unifié → `dataManager.js`
- Documentation → `ARCHITECTURE.md`

## 🎯 Utilisation Recommandée

1. **Première fois** : `npm start` (menu interactif)
2. **Addresses uniquement** : `npm run import:addresses`
3. **Places uniquement** : `npm run import:places`
4. **Workflow complet** : Menu option 3
5. **Validation** : `npm run validate:all`

---

**🎉 Résultat : Architecture claire, performante et économique !**