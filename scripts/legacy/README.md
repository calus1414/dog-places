# Scripts Legacy (Anciens)

⚠️ **Ces scripts sont obsolètes et conservés pour compatibilité uniquement.**

## 📜 Liste des Scripts Legacy

### 🏠 Anciens Scripts d'Adresses
- `fetchBrusselsAddresses.js` - Ancien fetch d'adresses
- `fetchAddressesOptimized.js` - Version optimisée (obsolète)
- `fetchAllBrusselsAddresses.js` - Récupération complète (obsolète)
- `geocodeAllBrusselsAddresses.js` - **❌ Très lent (13h+), coûteux (€200+)**
- `geocodeAllBrusselsAddressesFast.js` - Version "rapide" (toujours lente)

### 🐕 Anciens Scripts de Lieux
- `fillFirebase.js` - Import de lieux pour chiens (toujours valide)
- `testFirebase.js` - Tests Firebase

### 🚀 Scripts URBIS (Génération précédente)
- `importAllBrusselsAddresses.ts` - Première version URBIS
- `validateAddresses.ts` - Validation URBIS v1
- `migrateToUrbis.ts` - Script de migration vers URBIS

## 🆕 Nouvelles Alternatives

| Script Legacy | ➡️ Nouvelle Alternative | Amélioration |
|---------------|-------------------------|--------------|
| `geocodeAllBrusselsAddresses.js` | `npm run import:addresses` | **100x plus rapide, 0€** |
| `geocodeAllBrusselsAddressesFast.js` | `npm run import:addresses` | **100x plus rapide, 0€** |
| `fetchBrusselsAddresses.js` | `npm run fetch:addresses` | Sources multiples |
| `fillFirebase.js` | `npm run import:places` | Organisation améliorée |

## 🔄 Migration

### Ancienne méthode (OBSOLÈTE)
```bash
npm run legacy:geocode-all-addresses  # ❌ 13h+, €200+
```

### Nouvelle méthode (RECOMMANDÉE)
```bash
npm run import:addresses  # ✅ 5-10min, 0€
```

## 📊 Comparaison Performance

| Métrique | Legacy | Nouveau | Gain |
|----------|--------|---------|------|
| **Durée** | 13h+ | 5-10min | **100x** |
| **Coût** | €200+ | €0 | **∞** |
| **Adresses** | ~50k | 500k+ | **10x** |
| **Maintenance** | Difficile | Simple | ⭐⭐⭐⭐⭐ |

## 🗑️ Suppression

Ces scripts peuvent être supprimés en toute sécurité dans une version future.
La nouvelle architecture dans `scripts/addresses/` et `scripts/places/` les remplace complètement.

## 📞 Support

Pour toute question sur la migration :
```bash
npm start  # Menu interactif
npm run help  # Liste des commandes
```