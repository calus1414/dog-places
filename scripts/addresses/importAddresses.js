const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * 📥 IMPORT D'ADRESSES EN BATCH FIRESTORE
 *
 * Importe les adresses récupérées par fetchOpenAddresses.js
 * dans la collection Firestore 'brussels_addresses'
 *
 * Coût : 0€ - Pas d'API externe, juste Firestore
 */

class AddressImporter {
    constructor() {
        this.firestore = admin.firestore();
        this.BATCH_SIZE = 500; // Limite max Firestore
        this.COLLECTION_NAME = 'brussels_addresses';

        this.stats = {
            total: 0,
            processed: 0,
            saved: 0,
            skipped: 0,
            errors: 0,
            duplicates: 0,
            startTime: Date.now()
        };
    }

    /**
     * 🔍 Chargement du fichier d'adresses
     */
    loadAddressesFile(filename = 'brussels_addresses.json') {
        const filePath = path.join(__dirname, '..', 'data', filename);

        if (!fs.existsSync(filePath)) {
            throw new Error(`Fichier non trouvé: ${filePath}`);
        }

        console.log(`📂 Chargement du fichier: ${filePath}`);

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        if (!data.addresses || !Array.isArray(data.addresses)) {
            throw new Error('Format de fichier invalide - adresses manquantes');
        }

        console.log(`✅ ${data.addresses.length} adresses chargées`);
        console.log(`📊 Source: ${data.metadata?.source || 'Inconnue'}`);
        console.log(`📅 Récupérées le: ${data.metadata?.fetchedAt || 'Inconnu'}`);

        return data.addresses;
    }

    /**
     * 🔧 Préparation des données pour Firestore
     */
    prepareAddressForFirestore(address) {
        // Génération de l'ID unique
        const docId = this.generateAddressId(address);

        // Génération des termes de recherche
        const searchTerms = this.generateSearchTerms(address);

        // Adresse complète
        const fullAddress = `${address.number} ${address.street}, ${address.postalCode} ${address.commune}`;

        return {
            id: docId,
            data: {
                street: address.street.trim(),
                number: address.number.toString().trim(),
                commune: address.commune.trim(),
                postalCode: address.postalCode,
                fullAddress,
                coordinates: {
                    latitude: parseFloat(address.coordinates.latitude),
                    longitude: parseFloat(address.coordinates.longitude)
                },
                searchTerms,
                source: address.source || 'UNKNOWN',
                isActive: true,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        };
    }

    /**
     * 🆔 Génération d'ID unique
     */
    generateAddressId(address) {
        const clean = (str) => str.toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 20);

        return `${clean(address.commune)}_${clean(address.street)}_${address.number}`;
    }

    /**
     * 🔍 Génération des termes de recherche
     */
    generateSearchTerms(address) {
        const terms = [
            address.street.toLowerCase(),
            `${address.number} ${address.street}`.toLowerCase(),
            address.commune.toLowerCase(),
            address.postalCode,
            `${address.street} ${address.commune}`.toLowerCase()
        ];

        // Ajouter des variantes
        const streetWords = address.street.toLowerCase().split(' ');
        terms.push(...streetWords.filter(word => word.length > 2));

        return [...new Set(terms.filter(term => term && term.length > 0))];
    }

    /**
     * 📥 Import principal en batches
     */
    async importToFirestore(addresses) {
        console.log(`\n📥 IMPORT VERS FIRESTORE`);
        console.log(`📊 ${addresses.length} adresses à traiter`);

        this.stats.total = addresses.length;

        // Vérifier les doublons existants
        await this.checkExistingAddresses();

        const collection = this.firestore.collection(this.COLLECTION_NAME);
        let batchCount = 0;

        // Traitement par batches
        for (let i = 0; i < addresses.length; i += this.BATCH_SIZE) {
            batchCount++;
            const batchAddresses = addresses.slice(i, i + this.BATCH_SIZE);

            await this.processBatch(collection, batchAddresses, batchCount);

            // Pause entre les batches pour éviter les rate limits
            if (i + this.BATCH_SIZE < addresses.length) {
                await this.sleep(200);
            }
        }

        console.log(`\n🎉 IMPORT TERMINÉ!`);
        this.generateImportReport();
    }

    /**
     * 📦 Traitement d'un batch
     */
    async processBatch(collection, addresses, batchNumber) {
        const batch = this.firestore.batch();
        let batchProcessed = 0;

        for (const address of addresses) {
            try {
                const prepared = this.prepareAddressForFirestore(address);

                // Vérification basique de validité
                if (!this.isValidAddress(prepared.data)) {
                    this.stats.skipped++;
                    continue;
                }

                const docRef = collection.doc(prepared.id);
                batch.set(docRef, prepared.data, { merge: true });

                batchProcessed++;
                this.stats.processed++;

            } catch (error) {
                this.stats.errors++;
                if (this.stats.errors % 10 === 0) {
                    console.warn(`⚠️ ${this.stats.errors} erreurs de préparation`);
                }
            }
        }

        try {
            await batch.commit();
            this.stats.saved += batchProcessed;

            const totalBatches = Math.ceil(this.stats.total / this.BATCH_SIZE);
            const progress = ((this.stats.processed / this.stats.total) * 100).toFixed(1);

            console.log(`✅ Batch ${batchNumber}/${totalBatches}: ${batchProcessed} adresses sauvegardées (${progress}%)`);

        } catch (error) {
            this.stats.errors += batchProcessed;
            console.error(`❌ Erreur batch ${batchNumber}:`, error.message);

            // Retry avec une pause plus longue
            console.log(`🔄 Retry batch ${batchNumber} dans 3s...`);
            await this.sleep(3000);

            try {
                await batch.commit();
                this.stats.saved += batchProcessed;
                console.log(`✅ Retry batch ${batchNumber} réussi`);
            } catch (retryError) {
                console.error(`❌ Retry batch ${batchNumber} échoué:`, retryError.message);
            }
        }
    }

    /**
     * 🔍 Vérification des adresses existantes
     */
    async checkExistingAddresses() {
        try {
            const collection = this.firestore.collection(this.COLLECTION_NAME);
            const snapshot = await collection.count().get();
            const existingCount = snapshot.data().count;

            if (existingCount > 0) {
                console.log(`⚠️ ${existingCount} adresses déjà présentes dans la collection`);
                console.log(`💡 Utilisation de merge: true pour éviter les écrasements`);
            } else {
                console.log(`✅ Collection vide - import initial`);
            }

        } catch (error) {
            console.warn(`⚠️ Impossible de vérifier les adresses existantes:`, error.message);
        }
    }

    /**
     * ✅ Validation d'une adresse
     */
    isValidAddress(addressData) {
        return addressData.street &&
               addressData.street.length > 0 &&
               addressData.coordinates &&
               typeof addressData.coordinates.latitude === 'number' &&
               typeof addressData.coordinates.longitude === 'number' &&
               addressData.coordinates.latitude >= 50.7641 &&
               addressData.coordinates.latitude <= 50.9228 &&
               addressData.coordinates.longitude >= 4.2177 &&
               addressData.coordinates.longitude <= 4.4821;
    }

    /**
     * 📊 Rapport d'import
     */
    generateImportReport() {
        const duration = (Date.now() - this.stats.startTime) / 1000;
        const successRate = ((this.stats.saved / this.stats.total) * 100).toFixed(1);

        console.log(`\n📊 RAPPORT D'IMPORT`);
        console.log(`==================`);
        console.log(`⏱️  Durée: ${duration.toFixed(1)}s`);
        console.log(`📊 Total: ${this.stats.total} adresses`);
        console.log(`✅ Sauvegardées: ${this.stats.saved} (${successRate}%)`);
        console.log(`⏭️  Ignorées: ${this.stats.skipped}`);
        console.log(`❌ Erreurs: ${this.stats.errors}`);
        console.log(`🚀 Performance: ${(this.stats.saved / duration).toFixed(1)} adresses/seconde`);
        console.log(`💰 Coût: 0€ (import local)`);

        if (this.stats.saved > 0) {
            console.log(`\n✅ Collection Firestore: '${this.COLLECTION_NAME}'`);
            console.log(`🔍 Recherche optimisée avec searchTerms`);
        }

        if (successRate < 90) {
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
    console.log('📥 IMPORT D\'ADRESSES EN FIRESTORE');
    console.log('=================================');
    console.log('📅', new Date().toLocaleString('fr-BE'));

    // Initialisation Firebase
    if (!admin.apps.length) {
        admin.initializeApp();
    }

    const importer = new AddressImporter();

    try {
        // 1. Chargement du fichier
        const addresses = importer.loadAddressesFile();

        if (addresses.length === 0) {
            console.error('❌ Aucune adresse à importer');
            process.exit(1);
        }

        // 2. Import en Firestore
        await importer.importToFirestore(addresses);

        console.log('\n🎉 IMPORT RÉUSSI!');
        console.log('💡 Prochaine étape: npm run validate:addresses');

    } catch (error) {
        console.error('💥 Erreur lors de l\'import:', error.message);
        process.exit(1);
    }
}

module.exports = { AddressImporter, main };

// Exécution si appelé directement
if (require.main === module) {
    main();
}