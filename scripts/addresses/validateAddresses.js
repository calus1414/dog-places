const admin = require('firebase-admin');
require('dotenv').config();

/**
 * 🔍 VALIDATION DES ADRESSES IMPORTÉES
 *
 * Vérifie la qualité et l'intégrité des données d'adresses
 * dans la collection 'brussels_addresses'
 *
 * Coût : 0€ - Validation locale
 */

class AddressValidator {
    constructor() {
        this.firestore = admin.firestore();
        this.COLLECTION_NAME = 'brussels_addresses';

        this.stats = {
            total: 0,
            valid: 0,
            invalid: 0,
            warnings: 0,
            duplicates: 0,
            missingData: {
                coordinates: 0,
                searchTerms: 0,
                fullAddress: 0,
                street: 0,
                number: 0
            },
            communes: {},
            postalCodes: {},
            sources: {},
            errors: [],
            warnings_list: [],
            startTime: Date.now()
        };

        // Limites géographiques de Bruxelles
        this.BRUSSELS_BOUNDS = {
            minLat: 50.7641,
            maxLat: 50.9228,
            minLng: 4.2177,
            maxLng: 4.4821
        };

        // Mapping des codes postaux valides
        this.VALID_POSTAL_CODES = {
            '1000': 'Bruxelles', '1020': 'Bruxelles', '1030': 'Schaerbeek',
            '1040': 'Etterbeek', '1050': 'Ixelles', '1060': 'Saint-Gilles',
            '1070': 'Anderlecht', '1080': 'Molenbeek-Saint-Jean', '1090': 'Jette',
            '1120': 'Bruxelles', '1130': 'Bruxelles', '1140': 'Evere',
            '1150': 'Woluwe-Saint-Pierre', '1160': 'Auderghem',
            '1170': 'Watermael-Boitsfort', '1180': 'Uccle', '1190': 'Forest',
            '1200': 'Woluwe-Saint-Lambert', '1210': 'Saint-Josse-ten-Noode'
        };
    }

    /**
     * 🔍 Validation complète
     */
    async validateAll() {
        console.log('🔍 VALIDATION DES ADRESSES BRUXELLES');
        console.log('====================================');
        console.log('📅', new Date().toLocaleString('fr-BE'));

        try {
            // 1. Récupération de toutes les adresses
            console.log('\n📥 Récupération des adresses...');
            const collection = this.firestore.collection(this.COLLECTION_NAME);
            const snapshot = await collection.get();

            this.stats.total = snapshot.size;
            console.log(`📊 ${this.stats.total} adresses à valider`);

            if (this.stats.total === 0) {
                console.log('⚠️ Aucune adresse trouvée dans la collection');
                console.log('💡 Lancez d\'abord: npm run import:addresses');
                return;
            }

            // 2. Validation document par document
            const seenAddresses = new Set();
            let processed = 0;

            for (const doc of snapshot.docs) {
                this.validateDocument(doc, seenAddresses);
                processed++;

                // Progress update
                if (processed % 1000 === 0) {
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
    validateDocument(doc, seenAddresses) {
        const data = doc.data();
        const docId = doc.id;

        try {
            // 1. Validation des champs obligatoires
            this.validateRequiredFields(data, docId);

            // 2. Validation des coordonnées
            this.validateCoordinates(data, docId);

            // 3. Validation du code postal
            this.validatePostalCode(data, docId);

            // 4. Détection des doublons
            this.checkDuplicates(data, docId, seenAddresses);

            // 5. Validation de la cohérence des données
            this.validateDataConsistency(data, docId);

            // 6. Statistiques par commune/source
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
        if (!data.street || data.street.trim().length === 0) {
            this.stats.missingData.street++;
            throw new Error('Champ street manquant ou vide');
        }

        if (!data.number || data.number.toString().trim().length === 0) {
            this.stats.missingData.number++;
            throw new Error('Champ number manquant ou vide');
        }

        if (!data.coordinates) {
            this.stats.missingData.coordinates++;
            throw new Error('Coordonnées manquantes');
        }

        if (!data.searchTerms || !Array.isArray(data.searchTerms) || data.searchTerms.length === 0) {
            this.stats.missingData.searchTerms++;
            this.addWarning(docId, 'SearchTerms manquants ou vides');
        }

        if (!data.fullAddress) {
            this.stats.missingData.fullAddress++;
            this.addWarning(docId, 'FullAddress manquant');
        }
    }

    /**
     * 🌍 Validation des coordonnées
     */
    validateCoordinates(data, docId) {
        const { coordinates } = data;

        if (typeof coordinates.latitude !== 'number' || typeof coordinates.longitude !== 'number') {
            throw new Error('Coordonnées invalides (non numériques)');
        }

        // Vérification des limites de Bruxelles
        if (coordinates.latitude < this.BRUSSELS_BOUNDS.minLat ||
            coordinates.latitude > this.BRUSSELS_BOUNDS.maxLat ||
            coordinates.longitude < this.BRUSSELS_BOUNDS.minLng ||
            coordinates.longitude > this.BRUSSELS_BOUNDS.maxLng) {
            this.addWarning(docId, 'Coordonnées hors limites de Bruxelles');
        }
    }

    /**
     * 📮 Validation du code postal
     */
    validatePostalCode(data, docId) {
        if (!data.postalCode) {
            this.addWarning(docId, 'Code postal manquant');
            return;
        }

        // Vérification format (10XX pour Bruxelles)
        if (!/^10[0-9]{2}$/.test(data.postalCode)) {
            this.addWarning(docId, `Code postal invalide pour Bruxelles: ${data.postalCode}`);
            return;
        }

        // Vérification cohérence commune/code postal
        const expectedCommune = this.VALID_POSTAL_CODES[data.postalCode];
        if (expectedCommune && data.commune !== expectedCommune) {
            // Exceptions connues (Bruxelles a plusieurs codes postaux)
            if (!(data.commune === 'Bruxelles' && ['1000', '1020', '1120', '1130'].includes(data.postalCode))) {
                this.addWarning(docId, `Incohérence: ${data.commune} avec code postal ${data.postalCode}`);
            }
        }
    }

    /**
     * 👥 Détection des doublons
     */
    checkDuplicates(data, docId, seenAddresses) {
        const addressKey = `${data.street}_${data.number}_${data.commune}`.toLowerCase()
            .replace(/[^a-z0-9_]/g, '');

        if (seenAddresses.has(addressKey)) {
            this.stats.duplicates++;
            this.addWarning(docId, `Doublon potentiel: ${data.street} ${data.number}, ${data.commune}`);
        } else {
            seenAddresses.add(addressKey);
        }
    }

    /**
     * 🔗 Validation de la cohérence des données
     */
    validateDataConsistency(data, docId) {
        // Validation du numéro (doit être numérique ou numérique + lettre)
        if (!/^[0-9]+[a-zA-Z]?$/.test(data.number.toString())) {
            this.addWarning(docId, `Format de numéro suspect: ${data.number}`);
        }

        // Validation de l'adresse complète
        if (data.fullAddress) {
            const shouldContain = [data.number, data.street, data.postalCode, data.commune];
            const hasAllElements = shouldContain.every(element =>
                data.fullAddress.toLowerCase().includes(element.toString().toLowerCase())
            );

            if (!hasAllElements) {
                this.addWarning(docId, 'FullAddress incohérente avec les champs individuels');
            }
        }

        // Validation des searchTerms
        if (data.searchTerms && data.searchTerms.length > 0) {
            const hasStreet = data.searchTerms.some(term =>
                term.toLowerCase().includes(data.street.toLowerCase())
            );
            if (!hasStreet) {
                this.addWarning(docId, 'SearchTerms ne contiennent pas le nom de rue');
            }
        }
    }

    /**
     * 📊 Mise à jour des statistiques
     */
    updateStatistics(data) {
        // Par commune
        if (data.commune) {
            this.stats.communes[data.commune] = (this.stats.communes[data.commune] || 0) + 1;
        }

        // Par code postal
        if (data.postalCode) {
            this.stats.postalCodes[data.postalCode] = (this.stats.postalCodes[data.postalCode] || 0) + 1;
        }

        // Par source
        if (data.source) {
            this.stats.sources[data.source] = (this.stats.sources[data.source] || 0) + 1;
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
        console.log(`   Coordonnées: ${this.stats.missingData.coordinates}`);
        console.log(`   SearchTerms: ${this.stats.missingData.searchTerms}`);
        console.log(`   FullAddress: ${this.stats.missingData.fullAddress}`);
        console.log(`   Street: ${this.stats.missingData.street}`);
        console.log(`   Number: ${this.stats.missingData.number}`);

        // Répartition par commune
        console.log('\n🏘️ RÉPARTITION PAR COMMUNE:');
        Object.entries(this.stats.communes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .forEach(([commune, count]) => {
                const percentage = (count / this.stats.total * 100).toFixed(1);
                console.log(`   ${commune}: ${count} (${percentage}%)`);
            });

        // Répartition par source
        console.log('\n📊 RÉPARTITION PAR SOURCE:');
        Object.entries(this.stats.sources)
            .sort((a, b) => b[1] - a[1])
            .forEach(([source, count]) => {
                const percentage = (count / this.stats.total * 100).toFixed(1);
                console.log(`   ${source}: ${count} (${percentage}%)`);
            });

        // Top codes postaux
        console.log('\n📮 TOP CODES POSTAUX:');
        Object.entries(this.stats.postalCodes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .forEach(([code, count]) => {
                console.log(`   ${code}: ${count}`);
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

        if (parseFloat(qualityScore) >= 95) {
            console.log('✅ Excellente qualité des données!');
        } else if (parseFloat(qualityScore) >= 85) {
            console.log('🟡 Bonne qualité, quelques améliorations possibles');
        } else {
            console.log('🔴 Qualité insuffisante, nettoyage recommandé');
        }

        // Recommandations
        this.generateRecommendations();
    }

    /**
     * 💡 Génération des recommandations
     */
    generateRecommendations() {
        console.log('\n💡 RECOMMANDATIONS:');

        if (this.stats.invalid > 0) {
            console.log(`   🔧 Corriger ${this.stats.invalid} adresses invalides`);
        }

        if (this.stats.duplicates > 0) {
            console.log(`   🗑️ Supprimer ${this.stats.duplicates} doublons`);
        }

        if (this.stats.missingData.searchTerms > 50) {
            console.log(`   🔍 Générer searchTerms pour ${this.stats.missingData.searchTerms} adresses`);
        }

        if (this.stats.missingData.fullAddress > 50) {
            console.log(`   📝 Générer fullAddress pour ${this.stats.missingData.fullAddress} adresses`);
        }

        const validRate = (this.stats.valid / this.stats.total * 100);
        if (validRate < 90) {
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
    console.log('🔍 VALIDATION DES ADRESSES BRUXELLES');

    // Initialisation Firebase
    if (!admin.apps.length) {
        admin.initializeApp();
    }

    const validator = new AddressValidator();

    try {
        await validator.validateAll();

        const qualityScore = (validator.stats.valid - validator.stats.duplicates) / validator.stats.total;

        if (qualityScore >= 0.85) {
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

module.exports = { AddressValidator, main };

// Exécution si appelé directement
if (require.main === module) {
    main();
}