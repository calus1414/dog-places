const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * 📥 IMPORT DE LIEUX EN BATCH FIRESTORE
 *
 * Importe les lieux pour chiens récupérés par fetchGooglePlaces.js
 * dans la collection Firestore 'brussels_places'
 *
 * Coût : Firestore uniquement (pas d'API externe)
 */

class PlaceImporter {
    constructor() {
        this.firestore = admin.firestore();
        this.BATCH_SIZE = 500; // Limite max Firestore
        this.COLLECTION_NAME = 'brussels_places';

        this.stats = {
            total: 0,
            processed: 0,
            saved: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
            byCategory: {},
            startTime: Date.now()
        };
    }

    /**
     * 🔍 Chargement du fichier de lieux
     */
    loadPlacesFile(filename = null) {
        // Auto-détection du fichier le plus récent si non spécifié
        if (!filename) {
            filename = this.findMostRecentPlacesFile();
        }

        const filePath = path.join(__dirname, '../../data', filename);

        if (!fs.existsSync(filePath)) {
            throw new Error(`Fichier non trouvé: ${filePath}`);
        }

        console.log(`📂 Chargement du fichier: ${filePath}`);

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Support pour l'ancien et le nouveau format
        let places;
        if (data.places && Array.isArray(data.places)) {
            places = data.places;
        } else if (Array.isArray(data)) {
            // Format tableau direct
            places = data;
        } else {
            throw new Error('Format de fichier invalide - lieux manquants');
        }

        console.log(`✅ ${places.length} lieux chargés`);
        console.log(`📊 Source: ${data.source || data.metadata?.source || 'Inconnue'}`);
        console.log(`📅 Récupérés le: ${data.timestamp || data.metadata?.fetchedAt || 'Inconnu'}`);
        console.log(`💰 Coût API estimé: ${data.metadata?.apiCostEstimate || 'Variable'}`);

        // Afficher les types de lieux (nouveau format)
        if (data.placesByType) {
            console.log('\n🏷️ TYPES DE LIEUX TROUVÉS:');
            Object.entries(data.placesByType).forEach(([type, count]) => {
                console.log(`   ${type}: ${count} lieux`);
            });
        }
        // Support ancien format
        else if (data.metadata?.categories) {
            console.log('\n🏷️ CATÉGORIES TROUVÉES:');
            data.metadata.categories.forEach(cat => {
                console.log(`   ${cat.displayName}: ${cat.count} lieux`);
            });
        }

        return places;
    }

    /**
     * 🔍 Auto-détection du fichier le plus récent
     */
    findMostRecentPlacesFile() {
        const dataDir = path.join(__dirname, '../../data');

        if (!fs.existsSync(dataDir)) {
            throw new Error('Dossier data/ non trouvé');
        }

        const placeFiles = fs.readdirSync(dataDir)
            .filter(file => file.includes('places') && file.endsWith('.json'))
            .map(file => {
                const filePath = path.join(dataDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    path: filePath,
                    mtime: stats.mtime
                };
            })
            .sort((a, b) => b.mtime - a.mtime);

        if (placeFiles.length === 0) {
            throw new Error('Aucun fichier de lieux trouvé dans data/');
        }

        console.log(`🔍 Fichier le plus récent détecté: ${placeFiles[0].name}`);
        return placeFiles[0].name;
    }

    /**
     * 🔧 Préparation des données pour Firestore
     */
    preparePlaceForFirestore(place) {
        // Validation des données obligatoires
        if (!place.place_id || !place.name || !place.geometry?.location) {
            throw new Error(`Données obligatoires manquantes: ${place.name || 'Lieu sans nom'}`);
        }

        // Génération de l'adresse de recherche
        const searchAddress = this.generateSearchAddress(place);

        // Support pour les coordonnées dans différents formats
        const location = place.geometry?.location || place.location || {};
        const latitude = parseFloat(location.lat || location.latitude);
        const longitude = parseFloat(location.lng || location.longitude);

        return {
            id: place.place_id, // Google Place ID
            data: {
                // Identifiants
                place_id: place.place_id,
                name: place.name.trim(),
                type: place.dogPlaceType || place.type || 'unknown',
                category: this.getCategoryFromType(place.dogPlaceType || place.type),

                // Géolocalisation
                location: {
                    latitude: latitude,
                    longitude: longitude
                },

                // Adresse
                address: place.formatted_address || place.address || '',
                searchAddress,

                // Contact
                phone: place.formatted_phone_number || place.phone || null,
                website: place.website || null,

                // Évaluations
                rating: place.rating || null,
                ratingsCount: place.user_ratings_total || place.ratingsCount || 0,

                // Informations pratiques
                openingHours: place.opening_hours?.weekday_text || place.openingHours || [],
                priceLevel: place.price_level || place.priceLevel || null,

                // Médias
                photos: place.photos || [],

                // Métadonnées spécifiques aux lieux pour chiens
                dogPlaceType: place.dogPlaceType || 'unknown',
                searchQuery: place.searchQuery || null,
                source: place.source || 'Google Places API - Enhanced Search',
                isActive: true,
                isDogFriendly: this.isDogFriendlyByType(place.dogPlaceType),
                lastFetched: place.lastFetched ? new Date(place.lastFetched) : new Date(),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        };
    }

    /**
     * 🏷️ Catégorie basée sur le type de lieu pour chiens
     */
    getCategoryFromType(dogPlaceType) {
        const categoryMap = {
            'dog_park': 'Parc canin',
            'general_park': 'Parc public',
            'veterinary': 'Vétérinaire',
            'dog_friendly_restaurant': 'Restaurant dog-friendly'
        };
        return categoryMap[dogPlaceType] || 'Lieu pour chiens';
    }

    /**
     * 🐕 Détermine si le lieu est dog-friendly selon son type
     */
    isDogFriendlyByType(dogPlaceType) {
        return ['dog_park', 'veterinary', 'dog_friendly_restaurant'].includes(dogPlaceType) ||
               dogPlaceType === 'general_park'; // Les parcs généraux sont généralement accessibles aux chiens
    }

    /**
     * 🔍 Génération d'adresse de recherche
     */
    generateSearchAddress(place) {
        const terms = [];

        if (place.name) {
            terms.push(place.name.toLowerCase());
        }

        if (place.address) {
            // Extraire commune et rue de l'adresse
            const addressParts = place.address.split(',');
            addressParts.forEach(part => {
                const cleaned = part.trim().toLowerCase();
                if (cleaned.length > 2) {
                    terms.push(cleaned);
                }
            });
        }

        if (place.category) {
            terms.push(place.category.toLowerCase());
        }

        // Mots-clés par type
        const keywords = this.getKeywordsByType(place.type);
        terms.push(...keywords);

        return [...new Set(terms)].filter(term => term.length > 0);
    }

    /**
     * 🏷️ Mots-clés par type de lieu
     */
    getKeywordsByType(type) {
        const keywordMap = {
            'dog_parks': ['parc', 'chien', 'dog', 'park', 'aire', 'jeux'],
            'veterinary': ['veterinaire', 'veterinary', 'clinique', 'animal', 'sante'],
            'pet_stores': ['animalerie', 'pet', 'store', 'magasin', 'animal', 'nourriture'],
            'dog_friendly_cafes': ['cafe', 'restaurant', 'dog', 'friendly', 'chien', 'accepte']
        };

        return keywordMap[type] || [];
    }

    /**
     * 📥 Import principal en batches
     */
    async importToFirestore(places) {
        console.log(`\n📥 IMPORT VERS FIRESTORE`);
        console.log(`📊 ${places.length} lieux à traiter`);

        this.stats.total = places.length;

        // Vérifier les lieux existants
        await this.checkExistingPlaces();

        const collection = this.firestore.collection(this.COLLECTION_NAME);
        let batchCount = 0;

        // Traitement par batches
        for (let i = 0; i < places.length; i += this.BATCH_SIZE) {
            batchCount++;
            const batchPlaces = places.slice(i, i + this.BATCH_SIZE);

            await this.processBatch(collection, batchPlaces, batchCount);

            // Pause entre les batches pour éviter les rate limits
            if (i + this.BATCH_SIZE < places.length) {
                await this.sleep(200);
            }
        }

        console.log(`\n🎉 IMPORT TERMINÉ!`);
        this.generateImportReport();
    }

    /**
     * 📦 Traitement d'un batch
     */
    async processBatch(collection, places, batchNumber) {
        const batch = this.firestore.batch();
        let batchProcessed = 0;

        for (const place of places) {
            try {
                const prepared = this.preparePlaceForFirestore(place);

                // Vérification basique de validité
                if (!this.isValidPlace(prepared.data)) {
                    this.stats.skipped++;
                    continue;
                }

                // Vérifier si le lieu existe déjà
                const docRef = collection.doc(prepared.id);
                const existingDoc = await docRef.get();

                if (existingDoc.exists) {
                    // Mise à jour si différences
                    const existingData = existingDoc.data();
                    if (this.hasSignificantChanges(existingData, prepared.data)) {
                        batch.set(docRef, {
                            ...prepared.data,
                            createdAt: existingData.createdAt // Conserver la date de création
                        }, { merge: true });
                        this.stats.updated++;
                    } else {
                        this.stats.skipped++;
                        continue;
                    }
                } else {
                    // Nouveau lieu
                    batch.set(docRef, prepared.data);
                    this.stats.saved++;
                }

                // Statistiques par catégorie
                const category = prepared.data.type;
                this.stats.byCategory[category] = (this.stats.byCategory[category] || 0) + 1;

                batchProcessed++;
                this.stats.processed++;

            } catch (error) {
                this.stats.errors++;
                console.warn(`⚠️ Erreur lieu ${place.name}: ${error.message}`);
            }
        }

        try {
            if (batchProcessed > 0) {
                await batch.commit();

                const totalBatches = Math.ceil(this.stats.total / this.BATCH_SIZE);
                const progress = ((this.stats.processed / this.stats.total) * 100).toFixed(1);

                console.log(`✅ Batch ${batchNumber}/${totalBatches}: ${batchProcessed} lieux traités (${progress}%)`);
            }

        } catch (error) {
            this.stats.errors += batchProcessed;
            console.error(`❌ Erreur batch ${batchNumber}:`, error.message);
        }
    }

    /**
     * 🔍 Vérification des lieux existants
     */
    async checkExistingPlaces() {
        try {
            const collection = this.firestore.collection(this.COLLECTION_NAME);
            const snapshot = await collection.count().get();
            const existingCount = snapshot.data().count;

            if (existingCount > 0) {
                console.log(`⚠️ ${existingCount} lieux déjà présents dans la collection`);
                console.log(`🔄 Mise à jour des lieux modifiés uniquement`);
            } else {
                console.log(`✅ Collection vide - import initial`);
            }

        } catch (error) {
            console.warn(`⚠️ Impossible de vérifier les lieux existants:`, error.message);
        }
    }

    /**
     * ✅ Validation d'un lieu
     */
    isValidPlace(placeData) {
        return placeData.name &&
               placeData.name.length > 0 &&
               placeData.location &&
               typeof placeData.location.latitude === 'number' &&
               typeof placeData.location.longitude === 'number' &&
               placeData.location.latitude >= 50.7 &&
               placeData.location.latitude <= 51.0 &&
               placeData.location.longitude >= 4.0 &&
               placeData.location.longitude <= 4.6;
    }

    /**
     * 🔄 Détection de changements significatifs
     */
    hasSignificantChanges(existing, updated) {
        const significantFields = ['name', 'address', 'phone', 'website', 'rating', 'ratingsCount'];

        return significantFields.some(field => {
            const existingValue = existing[field];
            const updatedValue = updated[field];

            // Traitement spécial pour les ratings
            if (field === 'rating' || field === 'ratingsCount') {
                return Math.abs((existingValue || 0) - (updatedValue || 0)) > 0.1;
            }

            return existingValue !== updatedValue;
        });
    }

    /**
     * 📊 Rapport d'import
     */
    generateImportReport() {
        const duration = (Date.now() - this.stats.startTime) / 1000;

        console.log(`\n📊 RAPPORT D'IMPORT`);
        console.log(`==================`);
        console.log(`⏱️  Durée: ${duration.toFixed(1)}s`);
        console.log(`📊 Total: ${this.stats.total} lieux`);
        console.log(`💾 Nouveaux: ${this.stats.saved}`);
        console.log(`🔄 Mis à jour: ${this.stats.updated}`);
        console.log(`⏭️  Ignorés: ${this.stats.skipped}`);
        console.log(`❌ Erreurs: ${this.stats.errors}`);

        console.log('\n🏷️ PAR CATÉGORIE:');
        Object.entries(this.stats.byCategory).forEach(([type, count]) => {
            console.log(`   ${type}: ${count} lieux`);
        });

        const successCount = this.stats.saved + this.stats.updated;
        const successRate = (successCount / this.stats.total * 100).toFixed(1);

        console.log(`\n🎯 Taux de succès: ${successRate}%`);
        console.log(`✅ Collection Firestore: '${this.COLLECTION_NAME}'`);
        console.log(`🐕 Tous les lieux sont marqués dog-friendly`);

        if (successRate < 80) {
            console.log(`\n⚠️  Taux de succès faible (${successRate}%)`);
            console.log(`💡 Vérifiez les données source et la validité des coordonnées`);
        }
    }

    /**
     * 💤 Pause utilitaire
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * 🎯 FONCTION PRINCIPALE
 */
async function main() {
    console.log('📥 IMPORT DE LIEUX EN FIRESTORE');
    console.log('===============================');
    console.log('📅', new Date().toLocaleString('fr-BE'));

    // Initialisation Firebase
    if (!admin.apps.length) {
        admin.initializeApp();
    }

    const importer = new PlaceImporter();

    try {
        // 1. Chargement du fichier
        const places = importer.loadPlacesFile();

        if (places.length === 0) {
            console.error('❌ Aucun lieu à importer');
            process.exit(1);
        }

        // 2. Import en Firestore
        await importer.importToFirestore(places);

        console.log('\n🎉 IMPORT RÉUSSI!');
        console.log('💡 Prochaine étape: npm run validate:places');

    } catch (error) {
        console.error('💥 Erreur lors de l\'import:', error.message);

        if (error.message.includes('non trouvé')) {
            console.log('\n💡 Assurez-vous d\'avoir d\'abord récupéré les lieux:');
            console.log('   npm run fetch:places');
        }

        process.exit(1);
    }
}

module.exports = { PlaceImporter, main };

// Exécution si appelé directement
if (require.main === module) {
    main();
}