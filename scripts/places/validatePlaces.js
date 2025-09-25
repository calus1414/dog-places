const admin = require('firebase-admin');
const { initializeFirebase } = require('../common/firebaseInit');
require('dotenv').config();

/**
 * 🔍 VALIDATION DES LIEUX IMPORTÉS
 *
 * Vérifie la qualité et l'intégrité des lieux pour chiens
 * dans la collection 'brussels_places'
 *
 * Coût : 0€ - Validation locale
 */

class PlaceValidator {
    constructor() {
        this.firestore = admin.firestore();
        this.COLLECTION_NAME = 'brussels_places';

        this.stats = {
            total: 0,
            valid: 0,
            invalid: 0,
            warnings: 0,
            duplicates: 0,
            missingData: {
                address: 0,
                coordinates: 0,
                phone: 0,
                website: 0,
                rating: 0,
                openingHours: 0,
                photos: 0
            },
            categories: {},
            sources: {},
            ratings: {
                excellent: 0, // 4.0+
                good: 0,      // 3.0-3.9
                average: 0,   // 2.0-2.9
                poor: 0,      // <2.0
                noRating: 0
            },
            errors: [],
            warnings_list: [],
            startTime: Date.now()
        };

        // Zones géographiques approximatives de Bruxelles élargie
        this.EXTENDED_BRUSSELS_BOUNDS = {
            minLat: 50.7,
            maxLat: 51.0,
            minLng: 4.0,
            maxLng: 4.6
        };

        // Types de lieux valides (nouveaux types du script enhanced)
        this.VALID_PLACE_TYPES = [
            // Nouveaux types du script enhanced
            'dog_park',           // Parc canin dédié
            'general_park',       // Parc public (chiens acceptés)
            'veterinary',         // Vétérinaire
            'dog_friendly_restaurant', // Restaurant dog-friendly

            // Anciens types (rétrocompatibilité)
            'dog_parks',
            'pet_stores',
            'dog_friendly_cafes',
            'unknown'
        ];
    }

    /**
     * 🔍 Validation complète
     */
    async validateAll() {
        console.log('🔍 VALIDATION DES LIEUX POUR CHIENS');
        console.log('===================================');
        console.log('📅', new Date().toLocaleString('fr-BE'));

        try {
            // 1. Récupération de tous les lieux
            console.log('\n📥 Récupération des lieux...');
            const collection = this.firestore.collection(this.COLLECTION_NAME);
            const snapshot = await collection.get();

            this.stats.total = snapshot.size;
            console.log(`📊 ${this.stats.total} lieux à valider`);

            if (this.stats.total === 0) {
                console.log('⚠️ Aucun lieu trouvé dans la collection');
                console.log('💡 Lancez d\'abord: npm run import:places');
                return;
            }

            // 2. Validation document par document
            const seenPlaces = new Map(); // Pour détecter les doublons
            let processed = 0;

            for (const doc of snapshot.docs) {
                this.validateDocument(doc, seenPlaces);
                processed++;

                // Progress update
                if (processed % 50 === 0) {
                    const progress = (processed / this.stats.total * 100).toFixed(1);
                    console.log(`   Progression: ${progress}% (${processed}/${this.stats.total})`);
                }
            }

            // 3. Rapport final
            this.generateValidationReport();

        } catch (error) {
            console.error('❌ Erreur lors de la validation:', error.message);
            throw error;
        }
    }

    /**
     * 📋 Validation d'un document individuel
     */
    validateDocument(doc, seenPlaces) {
        const data = doc.data();
        const docId = doc.id;

        try {
            // 1. Validation des champs obligatoires
            this.validateRequiredFields(data, docId);

            // 2. Validation des coordonnées
            this.validateCoordinates(data, docId);

            // 3. Validation du type de lieu
            this.validatePlaceType(data, docId);

            // 4. Détection des doublons
            this.checkDuplicates(data, docId, seenPlaces);

            // 5. Validation des données optionnelles
            this.validateOptionalFields(data, docId);

            // 6. Validation de la cohérence des données
            this.validateDataConsistency(data, docId);

            // 7. Statistiques par catégorie/source
            this.updateStatistics(data);

            // Document valide
            this.stats.valid++;

        } catch (error) {
            this.stats.invalid++;
            this.stats.errors.push(`${docId}: ${error.message}`);
        }
    }

    /**
     * ✅ Validation des champs obligatoires
     */
    validateRequiredFields(data, docId) {
        if (!data.name || data.name.trim().length === 0) {
            throw new Error('Nom du lieu manquant ou vide');
        }

        if (!data.place_id || data.place_id.length === 0) {
            throw new Error('Google Place ID manquant');
        }

        if (!data.location) {
            throw new Error('Coordonnées manquantes');
        }

        if (!data.type) {
            this.addWarning(docId, 'Type de lieu manquant');
        }

        // Vérifier les données manquantes (non critiques)
        if (!data.address || data.address.trim().length === 0) {
            this.stats.missingData.address++;
        }

        if (!data.phone) {
            this.stats.missingData.phone++;
        }

        if (!data.website) {
            this.stats.missingData.website++;
        }

        if (!data.rating) {
            this.stats.missingData.rating++;
        }

        if (!data.openingHours || data.openingHours.length === 0) {
            this.stats.missingData.openingHours++;
        }

        if (!data.photos || data.photos.length === 0) {
            this.stats.missingData.photos++;
        }
    }

    /**
     * 🌍 Validation des coordonnées
     */
    validateCoordinates(data, docId) {
        const { location } = data;

        if (!location.latitude || !location.longitude) {
            throw new Error('Coordonnées latitude/longitude manquantes');
        }

        if (typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
            throw new Error('Coordonnées invalides (non numériques)');
        }

        // Vérification des limites élargies de Bruxelles
        if (location.latitude < this.EXTENDED_BRUSSELS_BOUNDS.minLat ||
            location.latitude > this.EXTENDED_BRUSSELS_BOUNDS.maxLat ||
            location.longitude < this.EXTENDED_BRUSSELS_BOUNDS.minLng ||
            location.longitude > this.EXTENDED_BRUSSELS_BOUNDS.maxLng) {
            this.addWarning(docId, 'Coordonnées hors zone de Bruxelles élargie');
        }

        // Vérification de coordonnées aberrantes
        if (Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) {
            throw new Error('Coordonnées GPS invalides (hors limites mondiales)');
        }
    }

    /**
     * 🏷️ Validation du type de lieu
     */
    validatePlaceType(data, docId) {
        if (data.type && !this.VALID_PLACE_TYPES.includes(data.type)) {
            this.addWarning(docId, `Type de lieu inconnu: ${data.type}`);
        }

        // Vérification cohérence type/catégorie
        if (data.type && data.category) {
            const expectedCategories = {
                // Nouveaux types
                'dog_park': ['Parc canin', 'parc'],
                'general_park': ['Parc public', 'parc'],
                'veterinary': ['Vétérinaire', 'veterinaire'],
                'dog_friendly_restaurant': ['Restaurant dog-friendly', 'restaurant', 'cafe'],

                // Anciens types (rétrocompatibilité)
                'dog_parks': ['Parcs à chiens', 'parc'],
                'pet_stores': ['Animaleries', 'animalerie'],
                'dog_friendly_cafes': ['Cafés dog-friendly', 'restaurant', 'cafe']
            };

            const expected = expectedCategories[data.type];
            if (expected && !expected.some(cat =>
                data.category.toLowerCase().includes(cat.toLowerCase())
            )) {
                this.addWarning(docId, `Incohérence type "${data.type}" / catégorie "${data.category}"`);
            }
        }
    }

    /**
     * 👥 Détection des doublons
     */
    checkDuplicates(data, docId, seenPlaces) {
        // Clé basée sur nom + coordonnées approximatives
        const latRounded = Math.round(data.location.latitude * 1000) / 1000;
        const lngRounded = Math.round(data.location.longitude * 1000) / 1000;
        const locationKey = `${latRounded}_${lngRounded}`;

        if (seenPlaces.has(locationKey)) {
            const existing = seenPlaces.get(locationKey);

            // Vérifier si les noms sont similaires
            if (this.areNamesSimilar(data.name, existing.name)) {
                this.stats.duplicates++;
                this.addWarning(docId, `Doublon potentiel avec ${existing.id}: "${existing.name}"`);
            }
        } else {
            seenPlaces.set(locationKey, {
                id: docId,
                name: data.name
            });
        }
    }

    /**
     * 🔤 Comparaison de noms similaires
     */
    areNamesSimilar(name1, name2) {
        const normalize = (str) => str.toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 10);

        const n1 = normalize(name1);
        const n2 = normalize(name2);

        // Distance de Levenshtein simplifiée
        return n1 === n2 || Math.abs(n1.length - n2.length) <= 2;
    }

    /**
     * 📝 Validation des champs optionnels
     */
    validateOptionalFields(data, docId) {
        // Validation du rating
        if (data.rating !== null && data.rating !== undefined) {
            if (typeof data.rating !== 'number' || data.rating < 0 || data.rating > 5) {
                this.addWarning(docId, `Rating invalide: ${data.rating} (doit être entre 0 et 5)`);
            }
        }

        // Validation du price level
        if (data.priceLevel !== null && data.priceLevel !== undefined) {
            if (!Number.isInteger(data.priceLevel) || data.priceLevel < 0 || data.priceLevel > 4) {
                this.addWarning(docId, `Prix level invalide: ${data.priceLevel} (doit être 0-4)`);
            }
        }

        // Validation du website
        if (data.website) {
            try {
                new URL(data.website);
            } catch {
                this.addWarning(docId, `URL de website invalide: ${data.website}`);
            }
        }

        // Validation du téléphone (format basique)
        if (data.phone) {
            if (!/[\d\s\+\-\(\)]{8,}/.test(data.phone)) {
                this.addWarning(docId, `Format téléphone suspect: ${data.phone}`);
            }
        }
    }

    /**
     * 🔗 Validation de la cohérence des données
     */
    validateDataConsistency(data, docId) {
        // Vérifier cohérence ratings
        if (data.rating && data.ratingsCount) {
            if (data.rating > 0 && data.ratingsCount === 0) {
                this.addWarning(docId, 'Rating présent mais ratingsCount = 0');
            }
        }

        // Vérifier cohérence photos
        if (data.photos && data.photos.length > 0) {
            data.photos.forEach((photo, index) => {
                if (!photo.reference && !photo.url) {
                    this.addWarning(docId, `Photo ${index + 1} sans référence ni URL`);
                }
            });
        }

        // Vérifier si le lieu est marqué dog-friendly
        if (data.isDogFriendly === false) {
            this.addWarning(docId, 'Lieu marqué comme NON dog-friendly dans une collection dog-friendly');
        }
    }

    /**
     * 📊 Mise à jour des statistiques
     */
    updateStatistics(data) {
        // Par catégorie
        if (data.type) {
            this.stats.categories[data.type] = (this.stats.categories[data.type] || 0) + 1;
        }

        // Par source
        if (data.source) {
            this.stats.sources[data.source] = (this.stats.sources[data.source] || 0) + 1;
        }

        // Statistiques de rating
        if (data.rating) {
            if (data.rating >= 4.0) {
                this.stats.ratings.excellent++;
            } else if (data.rating >= 3.0) {
                this.stats.ratings.good++;
            } else if (data.rating >= 2.0) {
                this.stats.ratings.average++;
            } else {
                this.stats.ratings.poor++;
            }
        } else {
            this.stats.ratings.noRating++;
        }
    }

    /**
     * ⚠️ Ajout d'un avertissement
     */
    addWarning(docId, message) {
        this.stats.warnings++;
        this.stats.warnings_list.push(`${docId}: ${message}`);
    }

    /**
     * 📋 Génération du rapport de validation
     */
    generateValidationReport() {
        const duration = (Date.now() - this.stats.startTime) / 1000;
        const validRate = (this.stats.valid / this.stats.total * 100).toFixed(1);

        console.log('\n📋 RAPPORT DE VALIDATION');
        console.log('========================');

        // Statistiques générales
        console.log('\n📊 STATISTIQUES GÉNÉRALES:');
        console.log(`   Total: ${this.stats.total}`);
        console.log(`   Valides: ${this.stats.valid} (${validRate}%)`);
        console.log(`   Invalides: ${this.stats.invalid} (${((this.stats.invalid / this.stats.total) * 100).toFixed(1)}%)`);
        console.log(`   Avertissements: ${this.stats.warnings}`);
        console.log(`   Doublons: ${this.stats.duplicates}`);
        console.log(`   ⏱️  Durée: ${duration.toFixed(1)}s`);

        // Données manquantes
        console.log('\n⚠️ DONNÉES MANQUANTES:');
        console.log(`   Adresses: ${this.stats.missingData.address}`);
        console.log(`   Téléphones: ${this.stats.missingData.phone}`);
        console.log(`   Sites web: ${this.stats.missingData.website}`);
        console.log(`   Ratings: ${this.stats.missingData.rating}`);
        console.log(`   Horaires: ${this.stats.missingData.openingHours}`);
        console.log(`   Photos: ${this.stats.missingData.photos}`);

        // Répartition par catégorie
        console.log('\n🏷️ RÉPARTITION PAR CATÉGORIE:');
        Object.entries(this.stats.categories)
            .sort((a, b) => b[1] - a[1])
            .forEach(([category, count]) => {
                const percentage = (count / this.stats.total * 100).toFixed(1);
                const displayName = this.getCategoryDisplayName(category);
                console.log(`   ${displayName}: ${count} (${percentage}%)`);
            });

        // Répartition des ratings
        console.log('\n⭐ RÉPARTITION DES RATINGS:');
        console.log(`   Excellents (4.0+): ${this.stats.ratings.excellent}`);
        console.log(`   Bons (3.0-3.9): ${this.stats.ratings.good}`);
        console.log(`   Moyens (2.0-2.9): ${this.stats.ratings.average}`);
        console.log(`   Faibles (<2.0): ${this.stats.ratings.poor}`);
        console.log(`   Sans rating: ${this.stats.ratings.noRating}`);

        const ratedCount = this.stats.total - this.stats.ratings.noRating;
        if (ratedCount > 0) {
            const excellentRate = (this.stats.ratings.excellent / ratedCount * 100).toFixed(1);
            console.log(`   🎯 Taux d'excellence: ${excellentRate}%`);
        }

        // Sources des données
        console.log('\n📊 RÉPARTITION PAR SOURCE:');
        Object.entries(this.stats.sources)
            .sort((a, b) => b[1] - a[1])
            .forEach(([source, count]) => {
                const percentage = (count / this.stats.total * 100).toFixed(1);
                console.log(`   ${source}: ${count} (${percentage}%)`);
            });

        // Erreurs critiques
        if (this.stats.errors.length > 0) {
            console.log('\n❌ ERREURS CRITIQUES:');
            this.stats.errors.slice(0, 5).forEach(error => {
                console.log(`   ${error}`);
            });
            if (this.stats.errors.length > 5) {
                console.log(`   ... et ${this.stats.errors.length - 5} autres erreurs`);
            }
        }

        // Quelques avertissements
        if (this.stats.warnings_list.length > 0) {
            console.log('\n⚠️ EXEMPLES D\'AVERTISSEMENTS:');
            this.stats.warnings_list.slice(0, 3).forEach(warning => {
                console.log(`   ${warning}`);
            });
            if (this.stats.warnings_list.length > 3) {
                console.log(`   ... et ${this.stats.warnings_list.length - 3} autres avertissements`);
            }
        }

        // Score de qualité
        const qualityScore = ((this.stats.valid - this.stats.duplicates) / this.stats.total * 100).toFixed(1);
        console.log(`\n🎯 SCORE DE QUALITÉ: ${qualityScore}%`);

        if (parseFloat(qualityScore) >= 90) {
            console.log('✅ Excellente qualité des données!');
        } else if (parseFloat(qualityScore) >= 75) {
            console.log('🟡 Bonne qualité, quelques améliorations possibles');
        } else {
            console.log('🔴 Qualité insuffisante, nettoyage recommandé');
        }

        // Recommandations
        this.generateRecommendations();
    }

    /**
     * 🏷️ Nom d'affichage des catégories
     */
    getCategoryDisplayName(category) {
        const names = {
            'dog_parks': 'Parcs à chiens',
            'veterinary': 'Vétérinaires',
            'pet_stores': 'Animaleries',
            'dog_friendly_cafes': 'Cafés dog-friendly',
            'unknown': 'Type inconnu'
        };
        return names[category] || category;
    }

    /**
     * 💡 Génération des recommandations
     */
    generateRecommendations() {
        console.log('\n💡 RECOMMANDATIONS:');

        if (this.stats.invalid > 0) {
            console.log(`   🔧 Corriger ${this.stats.invalid} lieux invalides`);
        }

        if (this.stats.duplicates > 0) {
            console.log(`   🗑️ Supprimer ${this.stats.duplicates} doublons`);
        }

        if (this.stats.missingData.phone > this.stats.total * 0.7) {
            console.log(`   📞 ${this.stats.missingData.phone} lieux sans téléphone (${((this.stats.missingData.phone / this.stats.total) * 100).toFixed(0)}%)`);
        }

        if (this.stats.missingData.website > this.stats.total * 0.5) {
            console.log(`   🌐 ${this.stats.missingData.website} lieux sans site web (${((this.stats.missingData.website / this.stats.total) * 100).toFixed(0)}%)`);
        }

        if (this.stats.ratings.noRating > this.stats.total * 0.3) {
            console.log(`   ⭐ ${this.stats.ratings.noRating} lieux sans rating (${((this.stats.ratings.noRating / this.stats.total) * 100).toFixed(0)}%)`);
        }

        const validRate = (this.stats.valid / this.stats.total * 100);
        if (validRate < 85) {
            console.log(`   ⚠️ Taux de validité faible (${validRate.toFixed(1)}%) - vérifier les données source`);
        }

        console.log(`\n✅ Collection validée: '${this.COLLECTION_NAME}'`);
        console.log(`💰 Coût de validation: 0€`);
    }
}

/**
 * 🎯 FONCTION PRINCIPALE
 */
async function main() {
    console.log('🔍 VALIDATION DES LIEUX POUR CHIENS');

    // Initialisation Firebase avec configuration explicite
    try {
        initializeFirebase();
    } catch (error) {
        console.error('❌ Erreur initialisation Firebase:', error.message);
        process.exit(1);
    }

    const validator = new PlaceValidator();

    try {
        await validator.validateAll();

        const qualityScore = (validator.stats.valid - validator.stats.duplicates) / validator.stats.total;

        if (qualityScore >= 0.80) {
            console.log('\n✅ Validation terminée avec succès');
            process.exit(0);
        } else {
            console.log('\n⚠️ Qualité des données insuffisante');
            process.exit(1);
        }

    } catch (error) {
        console.error('💥 Erreur lors de la validation:', error.message);
        process.exit(1);
    }
}

module.exports = { PlaceValidator, main };

// Exécution si appelé directement
if (require.main === module) {
    main();
}