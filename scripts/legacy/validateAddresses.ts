// scripts/validateAddresses.ts
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
    UrbisAddressSchema,
    FIRESTORE_CONFIG,
    COMMUNE_MAPPING,
    validateCoordinates
} from '../src/config/addressConfig.js';

/**
 * 🔍 VALIDATION DES ADRESSES IMPORTÉES
 * Vérifie l'intégrité et la qualité des données en base
 */

interface ValidationStats {
    total: number;
    valid: number;
    invalid: number;
    warnings: number;
    errors: string[];
    warnings_list: string[];
    communes: Record<string, number>;
    postalCodes: Record<string, number>;
    duplicates: number;
    missingData: {
        coordinates: number;
        searchTerms: number;
        fullAddress: number;
    };
}

class AddressValidator {
    private firestore = getFirestore();
    private stats: ValidationStats = {
        total: 0,
        valid: 0,
        invalid: 0,
        warnings: 0,
        errors: [],
        warnings_list: [],
        communes: {},
        postalCodes: {},
        duplicates: 0,
        missingData: {
            coordinates: 0,
            searchTerms: 0,
            fullAddress: 0
        }
    };

    async validateAll(): Promise<ValidationStats> {
        console.log('🔍 VALIDATION DES ADRESSES BRUXELLES');
        console.log('📅', new Date().toLocaleString('fr-BE'));

        const collection = this.firestore.collection(FIRESTORE_CONFIG.collection);

        try {
            // Récupération de toutes les adresses
            console.log('📥 Récupération des adresses...');
            const snapshot = await collection.get();
            this.stats.total = snapshot.size;

            console.log(`📊 ${this.stats.total} adresses à valider`);

            // Validation document par document
            const seenAddresses = new Set<string>();

            for (const doc of snapshot.docs) {
                try {
                    await this.validateDocument(doc, seenAddresses);
                } catch (error) {
                    this.stats.invalid++;
                    this.stats.errors.push(`Document ${doc.id}: ${error instanceof Error ? error.message : error}`);
                }

                // Progress update
                if ((this.stats.valid + this.stats.invalid) % 1000 === 0) {
                    const progress = ((this.stats.valid + this.stats.invalid) / this.stats.total * 100).toFixed(1);
                    console.log(`   Progression: ${progress}% (${this.stats.valid} valides, ${this.stats.invalid} invalides)`);
                }
            }

            // Analyse et rapport final
            this.generateReport();
            return this.stats;

        } catch (error) {
            console.error('❌ Erreur lors de la validation:', error);
            throw error;
        }
    }

    private async validateDocument(doc: any, seenAddresses: Set<string>): Promise<void> {
        const data = doc.data();
        const docId = doc.id;

        // 1. Validation du schéma Zod
        try {
            const validatedAddress = UrbisAddressSchema.parse(data);
            this.stats.valid++;

            // Statistiques par commune et code postal
            this.stats.communes[validatedAddress.commune] = (this.stats.communes[validatedAddress.commune] || 0) + 1;
            this.stats.postalCodes[validatedAddress.postalCode] = (this.stats.postalCodes[validatedAddress.postalCode] || 0) + 1;

        } catch (zodError) {
            this.stats.invalid++;
            this.stats.errors.push(`${docId}: Erreur schéma - ${zodError}`);
            return;
        }

        // 2. Validation des coordonnées
        if (data.coordinates) {
            const { latitude, longitude } = data.coordinates;
            if (!validateCoordinates(latitude, longitude)) {
                this.stats.warnings++;
                this.stats.warnings_list.push(`${docId}: Coordonnées hors limites Bruxelles`);
            }
        } else {
            this.stats.missingData.coordinates++;
        }

        // 3. Vérification des données manquantes
        if (!data.searchTerms || data.searchTerms.length === 0) {
            this.stats.missingData.searchTerms++;
        }

        if (!data.fullAddress) {
            this.stats.missingData.fullAddress++;
        }

        // 4. Détection des doublons
        const addressKey = `${data.street}_${data.number}_${data.commune}`.toLowerCase();
        if (seenAddresses.has(addressKey)) {
            this.stats.duplicates++;
            this.stats.warnings++;
            this.stats.warnings_list.push(`${docId}: Doublon potentiel - ${addressKey}`);
        } else {
            seenAddresses.add(addressKey);
        }

        // 5. Validation cohérence commune/code postal
        const expectedCommune = COMMUNE_MAPPING[data.commune];
        if (expectedCommune && expectedCommune.postalCode !== data.postalCode) {
            this.stats.warnings++;
            this.stats.warnings_list.push(`${docId}: Incohérence code postal ${data.postalCode} pour commune ${data.commune}`);
        }

        // 6. Validation format numéro
        if (!data.number || !/^[0-9]+[a-zA-Z]?$/i.test(data.number.toString())) {
            this.stats.warnings++;
            this.stats.warnings_list.push(`${docId}: Format numéro suspect - ${data.number}`);
        }
    }

    private generateReport(): void {
        console.log('\n📋 RAPPORT DE VALIDATION');
        console.log('========================');

        // Statistiques générales
        console.log('\n📊 STATISTIQUES GÉNÉRALES:');
        console.log(`   Total: ${this.stats.total}`);
        console.log(`   Valides: ${this.stats.valid} (${(this.stats.valid / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`   Invalides: ${this.stats.invalid} (${(this.stats.invalid / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`   Avertissements: ${this.stats.warnings}`);
        console.log(`   Doublons: ${this.stats.duplicates}`);

        // Données manquantes
        console.log('\n⚠️ DONNÉES MANQUANTES:');
        console.log(`   Coordonnées: ${this.stats.missingData.coordinates}`);
        console.log(`   SearchTerms: ${this.stats.missingData.searchTerms}`);
        console.log(`   FullAddress: ${this.stats.missingData.fullAddress}`);

        // Répartition par commune
        console.log('\n🏘️ RÉPARTITION PAR COMMUNE:');
        Object.entries(this.stats.communes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .forEach(([commune, count]) => {
                const percentage = (count / this.stats.total * 100).toFixed(1);
                console.log(`   ${commune}: ${count} (${percentage}%)`);
            });

        // Top codes postaux
        console.log('\n📮 TOP CODES POSTAUX:');
        Object.entries(this.stats.postalCodes)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([code, count]) => {
                console.log(`   ${code}: ${count}`);
            });

        // Erreurs critiques
        if (this.stats.errors.length > 0) {
            console.log('\n❌ ERREURS CRITIQUES:');
            this.stats.errors.slice(0, 10).forEach(error => {
                console.log(`   ${error}`);
            });
            if (this.stats.errors.length > 10) {
                console.log(`   ... et ${this.stats.errors.length - 10} autres erreurs`);
            }
        }

        // Avertissements
        if (this.stats.warnings_list.length > 0) {
            console.log('\n⚠️ AVERTISSEMENTS:');
            this.stats.warnings_list.slice(0, 5).forEach(warning => {
                console.log(`   ${warning}`);
            });
            if (this.stats.warnings_list.length > 5) {
                console.log(`   ... et ${this.stats.warnings_list.length - 5} autres avertissements`);
            }
        }

        // Recommandations
        console.log('\n💡 RECOMMANDATIONS:');

        if (this.stats.invalid > 0) {
            console.log(`   🔧 Corriger ${this.stats.invalid} adresses invalides`);
        }

        if (this.stats.duplicates > 0) {
            console.log(`   🗑️ Supprimer ${this.stats.duplicates} doublons`);
        }

        if (this.stats.missingData.searchTerms > 0) {
            console.log(`   🔍 Générer searchTerms pour ${this.stats.missingData.searchTerms} adresses`);
        }

        // Score de qualité global
        const qualityScore = ((this.stats.valid - this.stats.duplicates) / this.stats.total * 100).toFixed(1);
        console.log(`\n🎯 SCORE DE QUALITÉ: ${qualityScore}%`);

        if (parseFloat(qualityScore) >= 95) {
            console.log('✅ Excellente qualité des données!');
        } else if (parseFloat(qualityScore) >= 90) {
            console.log('🟡 Qualité correcte, quelques améliorations possibles');
        } else {
            console.log('🔴 Qualité insuffisante, nettoyage recommandé');
        }
    }

    /**
     * 🧹 NETTOYAGE AUTOMATIQUE
     */
    async autoCleanup(): Promise<void> {
        console.log('\n🧹 NETTOYAGE AUTOMATIQUE');

        const collection = this.firestore.collection(FIRESTORE_CONFIG.collection);
        const batch = this.firestore.batch();
        let operations = 0;

        // 1. Suppression des doublons
        console.log('🗑️ Suppression des doublons...');
        // TODO: Implémenter logic de déduplication

        // 2. Génération des searchTerms manquants
        console.log('🔍 Génération des searchTerms...');
        const snapshot = await collection.where('searchTerms', '==', null).limit(100).get();

        snapshot.forEach(doc => {
            const data = doc.data();
            const searchTerms = [
                data.street?.toLowerCase(),
                `${data.number} ${data.street}`.toLowerCase(),
                data.commune?.toLowerCase(),
                data.postalCode,
                `${data.street} ${data.commune}`.toLowerCase(),
            ].filter(Boolean);

            batch.update(doc.ref, { searchTerms });
            operations++;
        });

        if (operations > 0) {
            await batch.commit();
            console.log(`✅ ${operations} documents mis à jour`);
        }
    }
}

/**
 * 🎯 FONCTION PRINCIPALE
 */
async function main() {
    console.log('🔍 VALIDATION DES ADRESSES BRUXELLES');

    // Initialisation Firebase
    try {
        initializeApp();
    } catch (error) {
        // App déjà initialisée
    }

    const validator = new AddressValidator();

    try {
        // Arguments de ligne de commande
        const args = process.argv.slice(2);
        const shouldCleanup = args.includes('--cleanup');

        // Validation
        const stats = await validator.validateAll();

        // Nettoyage automatique si demandé
        if (shouldCleanup) {
            await validator.autoCleanup();
        }

        // Exit code basé sur la qualité
        const qualityScore = (stats.valid - stats.duplicates) / stats.total;
        if (qualityScore < 0.90) {
            console.log('\n⚠️ Qualité des données insuffisante');
            process.exit(1);
        } else {
            console.log('\n✅ Validation terminée avec succès');
            process.exit(0);
        }

    } catch (error) {
        console.error('💥 Erreur lors de la validation:', error);
        process.exit(1);
    }
}

export { AddressValidator, main };

// Exécution si appelé directement
if (require.main === module) {
    main();
}