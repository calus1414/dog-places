# 🎛️ Workflow Manuel GitHub Actions

## 🚫 **Exécution Automatique Désactivée**

Le workflow ne se lance **JAMAIS automatiquement**. Il doit être déclenché manuellement.

## 🎯 **Comment Lancer le Workflow Manuellement**

### 1. **Via l'Interface GitHub**
1. Allez sur votre repository GitHub
2. Cliquez sur l'onglet **"Actions"**
3. Sélectionnez **"🎛️ Manual Data Collection - Dog Places Brussels"**
4. Cliquez sur **"Run workflow"**
5. Choisissez vos options :

#### 📋 **Options Disponibles**

| Option | Description | Coût | Durée |
|--------|-------------|------|-------|
| **🏠 addresses** | Adresses uniquement (OpenAddresses.io) | **0€** | ~10min |
| **🐕 places** | Lieux pour chiens uniquement (Google API) | **$2-5** | ~5min |
| **🚀 both** | Les deux séquentiellement | **$2-5** | ~15min |
| **📚 legacy** | Anciens scripts (compatibilité) | **Variable** | **13h+** |

#### ⚙️ **Mode Test**
- ✅ **Coché** : Mode test (pas de sauvegarde réelle)
- ❌ **Décoché** : Mode production (sauvegarde en base)

### 2. **Via l'API GitHub**
```bash
curl -X POST \
  -H "Authorization: token YOUR_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/VOTRE_USERNAME/dog-places/actions/workflows/places-api-demo.yml/dispatches \
  -d '{
    "ref": "main",
    "inputs": {
      "workflow_type": "addresses",
      "dry_run": "false"
    }
  }'
```

### 3. **Via GitHub CLI**
```bash
# Addresses uniquement (gratuit)
gh workflow run places-api-demo.yml -f workflow_type=addresses -f dry_run=false

# Places uniquement (payant)
gh workflow run places-api-demo.yml -f workflow_type=places -f dry_run=false

# Les deux (recommandé)
gh workflow run places-api-demo.yml -f workflow_type=both -f dry_run=false

# Mode test
gh workflow run places-api-demo.yml -f workflow_type=addresses -f dry_run=true
```

## 🔐 **Variables d'Environnement Requises**

### 🏠 **Pour Addresses (Gratuit)**
- `FIREBASE_*` : Configuration Firebase (toujours requis)

### 🐕 **Pour Places (Payant)**
- `GOOGLE_PLACES_API_KEY` : Clé API Google Places
- `FIREBASE_*` : Configuration Firebase

### 📚 **Secrets GitHub Requis**
```
EXPO_PUBLIC_FIREBASE_PROJECT_ID
FIREBASE_PRIVATE_KEY_ID
FIREBASE_PRIVATE_KEY
FIREBASE_CLIENT_EMAIL
FIREBASE_CLIENT_ID
FIREBASE_CLIENT_X509_CERT_URL
GOOGLE_PLACES_API_KEY (optionnel si pas de places)
```

## 🎛️ **Workflows Disponibles**

### 🏠 **Addresses (Recommandé - Gratuit)**
```yaml
workflow_type: addresses
dry_run: false
```
- ✅ **Source** : OpenAddresses.io + OpenStreetMap
- ✅ **Coût** : 0€
- ✅ **Durée** : ~10 minutes
- ✅ **Résultat** : ~500,000 adresses

### 🐕 **Places (Payant)**
```yaml
workflow_type: places
dry_run: false
```
- ⚠️ **Source** : Google Places API
- 💳 **Coût** : $2-5
- ⏱️ **Durée** : ~5 minutes
- 📊 **Résultat** : ~200-500 lieux pour chiens

### 🚀 **Both (Complet)**
```yaml
workflow_type: both
dry_run: false
```
- 🎯 **Stratégie** : Addresses gratuit + Places payant
- 💰 **Coût total** : $2-5 (uniquement Google Places)
- ⏱️ **Durée** : ~15 minutes
- 📈 **Résultat** : Dataset complet

### 📚 **Legacy (Compatibilité)**
```yaml
workflow_type: legacy
dry_run: false
```
- ⚠️ **Attention** : Anciens scripts lents et coûteux
- 💸 **Coût** : €200+ (Google Geocoding)
- 🐌 **Durée** : 13+ heures
- 📊 **Résultat** : ~50,000 adresses

## 🔍 **Monitoring du Workflow**

### ✅ **Succès**
```
🎯 LANCEMENT MANUEL DU WORKFLOW
Type sélectionné: addresses
Mode test: false
🏠 Lancement workflow ADDRESSES (Gratuit)
✅ Workflow terminé!
```

### ❌ **Échec**
```
❌ GOOGLE_PLACES_API_KEY manquante pour le workflow places
```

### 🧪 **Mode Test**
```
Mode test: true
🧪 Mode test activé - pas de sauvegarde réelle
```

## 🎯 **Recommandations**

### 🥇 **Pour Débuter**
```yaml
workflow_type: addresses
dry_run: true
```
Test gratuit pour vérifier que tout fonctionne.

### 🥈 **Pour Production**
```yaml
workflow_type: both
dry_run: false
```
Dataset complet pour l'application.

### 🥉 **Pour Économiser**
```yaml
workflow_type: addresses
dry_run: false
```
Seulement les adresses gratuites.

## 📞 **Support**

- 🐛 **Problème** : Vérifiez les logs dans l'onglet Actions
- 🔑 **API Key** : Vérifiez les secrets GitHub
- 💰 **Coût** : Surveillez votre quota Google Places
- 📧 **Contact** : Créez une issue GitHub

---

**🎛️ Le workflow est maintenant 100% manuel et sous votre contrôle !**