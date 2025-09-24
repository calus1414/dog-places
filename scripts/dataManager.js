const readline = require('readline');
const { spawn } = require('child_process');
const path = require('path');

/**
 * 🎛️ DATA MANAGER - MENU INTERACTIF
 *
 * Menu central pour choisir entre les workflows gratuits et payants :
 *   - ADDRESSES (Gratuit) : OpenAddresses.io + OSM
 *   - PLACES (Payant) : Google Places API
 *   - Validation et gestion des données
 */

class DataManager {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    /**
     * 🎯 Menu principal
     */
    async showMainMenu() {
        console.clear();
        console.log('🐕 DOG PLACES BRUSSELS - DATA MANAGER');
        console.log('=====================================');
        console.log('📅', new Date().toLocaleString('fr-BE'));

        console.log('\n🏠 QUE VOULEZ-VOUS IMPORTER ?');
        console.log('');
        console.log('1. 🏠 ADDRESSES (💰 GRATUIT)');
        console.log('   - Source: OpenAddresses.io + OpenStreetMap');
        console.log('   - Contenu: ~500,000 adresses résidentielles');
        console.log('   - Collection: brussels_addresses');
        console.log('   - Coût: 0€');
        console.log('');
        console.log('2. 🐕 PLACES (💳 PAYANT)');
        console.log('   - Source: Google Places API');
        console.log('   - Contenu: Lieux pour chiens (parcs, vétérinaires, etc.)');
        console.log('   - Collection: brussels_places');
        console.log('   - Coût: ~$2-5 selon quota');
        console.log('');
        console.log('3. 🚀 LES DEUX (Séquentiellement)');
        console.log('   - Addresses d\'abord (gratuit), puis Places (payant)');
        console.log('   - Import complet pour application complète');
        console.log('');
        console.log('4. 🔍 VALIDATION & MAINTENANCE');
        console.log('   - Valider les données existantes');
        console.log('   - Statistiques et nettoyage');
        console.log('');
        console.log('5. 📊 STATUTS & INFORMATIONS');
        console.log('   - Voir l\'état des collections');
        console.log('   - Informations sur les coûts');
        console.log('');
        console.log('6. ❌ QUITTER');

        return this.promptChoice('\n🎯 Votre choix (1-6): ', ['1', '2', '3', '4', '5', '6']);
    }

    /**
     * 🏠 Workflow addresses (gratuit)
     */
    async handleAddressesWorkflow() {
        console.log('\n🏠 WORKFLOW ADDRESSES - GRATUIT');
        console.log('================================');

        console.log('\n✅ AVANTAGES:');
        console.log('   • 100% gratuit (0€)');
        console.log('   • ~500,000 adresses officielles');
        console.log('   • Sources: OpenAddresses.io + OpenStreetMap');
        console.log('   • Pas de quotas ou limites');

        console.log('\n📋 ÉTAPES:');
        console.log('   1. Récupération des adresses (OpenAddresses.io)');
        console.log('   2. Import en batch vers Firestore');
        console.log('   3. Validation des données');

        const confirm = await this.promptChoice('\n▶️ Lancer le workflow addresses ? (y/n): ', ['y', 'n', 'Y', 'N']);

        if (confirm.toLowerCase() === 'y') {
            await this.runAddressesWorkflow();
        } else {
            console.log('❌ Workflow annulé');
        }
    }

    /**
     * 🐕 Workflow places (payant)
     */
    async handlePlacesWorkflow() {
        console.log('\n🐕 WORKFLOW PLACES - PAYANT');
        console.log('============================');

        console.log('\n⚠️  IMPORTANT:');
        console.log('   • Nécessite une clé Google Places API');
        console.log('   • Coût estimé: $2-5 selon les quotas');
        console.log('   • ~200-500 lieux selon la zone');
        console.log('   • Billing Google Cloud requis');

        console.log('\n📋 ÉTAPES:');
        console.log('   1. Récupération via Google Places API');
        console.log('   2. Import en batch vers Firestore');
        console.log('   3. Validation des données');

        // Vérifier la clé API
        const hasApiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (!hasApiKey) {
            console.log('\n❌ GOOGLE_PLACES_API_KEY manquante dans .env');
            console.log('\n📋 CONFIGURATION REQUISE:');
            console.log('1. Obtenez une clé Google Places API');
            console.log('2. Ajoutez GOOGLE_PLACES_API_KEY=votre_clé dans .env');
            console.log('3. Activez la billing sur Google Cloud Console');

            const configure = await this.promptChoice('\n🔧 Configurer maintenant ? (y/n): ', ['y', 'n', 'Y', 'N']);

            if (configure.toLowerCase() === 'y') {
                await this.showGooglePlacesConfiguration();
                return;
            } else {
                console.log('❌ Configuration requise pour continuer');
                return;
            }
        }

        console.log('\n✅ Clé API Google Places détectée');

        const confirm = await this.promptChoice('\n▶️ Lancer le workflow places (PAYANT) ? (y/n): ', ['y', 'n', 'Y', 'N']);

        if (confirm.toLowerCase() === 'y') {
            await this.runPlacesWorkflow();
        } else {
            console.log('❌ Workflow annulé');
        }
    }

    /**
     * 🚀 Workflow complet (les deux)
     */
    async handleBothWorkflows() {
        console.log('\n🚀 WORKFLOW COMPLET');
        console.log('==================');

        console.log('\n📋 PLAN D\'EXÉCUTION:');
        console.log('   1. 🏠 ADDRESSES (Gratuit) - ~10 minutes');
        console.log('   2. 🐕 PLACES (Payant) - ~5 minutes');
        console.log('   3. 🔍 Validation globale');

        console.log('\n💰 COÛT TOTAL: ~$2-5 (uniquement Google Places)');

        const hasApiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (!hasApiKey) {
            console.log('\n❌ GOOGLE_PLACES_API_KEY requise pour les places');
            console.log('💡 Vous pouvez lancer uniquement les addresses (gratuit)');

            const addressesOnly = await this.promptChoice('\n🏠 Lancer uniquement addresses (gratuit) ? (y/n): ', ['y', 'n', 'Y', 'N']);

            if (addressesOnly.toLowerCase() === 'y') {
                await this.runAddressesWorkflow();
            }
            return;
        }

        const confirm = await this.promptChoice('\n▶️ Lancer le workflow complet ? (y/n): ', ['y', 'n', 'Y', 'N']);

        if (confirm.toLowerCase() === 'y') {
            console.log('\n🚀 LANCEMENT DU WORKFLOW COMPLET...');
            await this.runAddressesWorkflow();

            console.log('\n🔄 Passage aux places...');
            await this.sleep(2000);
            await this.runPlacesWorkflow();

            console.log('\n🎉 WORKFLOW COMPLET TERMINÉ!');
        } else {
            console.log('❌ Workflow annulé');
        }
    }

    /**
     * 🔍 Menu validation & maintenance
     */
    async handleValidationMenu() {
        console.log('\n🔍 VALIDATION & MAINTENANCE');
        console.log('===========================');

        console.log('\n1. 🏠 Valider addresses');
        console.log('2. 🐕 Valider places');
        console.log('3. 📊 Statistiques globales');
        console.log('4. 🧹 Nettoyage automatique');
        console.log('5. ⬅️ Retour menu principal');

        const choice = await this.promptChoice('\n🎯 Votre choix (1-5): ', ['1', '2', '3', '4', '5']);

        switch (choice) {
            case '1':
                await this.runScript(['node', 'scripts/addresses/validateAddresses.js']);
                break;
            case '2':
                await this.runScript(['node', 'scripts/places/validatePlaces.js']);
                break;
            case '3':
                await this.showGlobalStats();
                break;
            case '4':
                await this.runCleanup();
                break;
            case '5':
                return;
        }

        await this.promptChoice('\n📱 Appuyez sur Entrée pour continuer...', null, true);
    }

    /**
     * 📊 Informations et statuts
     */
    async handleStatusMenu() {
        console.log('\n📊 STATUTS & INFORMATIONS');
        console.log('=========================');

        try {
            // Simulation de vérification des collections
            // Dans un vrai cas, on se connecterait à Firestore
            console.log('\n🔍 Vérification des collections...');

            console.log('\n📈 ÉTAT DES COLLECTIONS:');
            console.log('   🏠 brussels_addresses: À vérifier');
            console.log('   🐕 brussels_places: À vérifier');

            console.log('\n💰 ESTIMATIONS DE COÛT:');
            console.log('   🏠 Addresses (OpenAddresses): 0€');
            console.log('   🐕 Places (Google API): $2-5');
            console.log('   💾 Firestore reads/writes: ~$0.01');

            console.log('\n⚡ PERFORMANCES:');
            console.log('   🏠 Import addresses: ~10 minutes');
            console.log('   🐕 Import places: ~5 minutes');
            console.log('   🔍 Validation: ~1 minute');

            console.log('\n🔗 RESSOURCES:');
            console.log('   📚 OpenAddresses.io: https://openaddresses.io/');
            console.log('   🗺️  OpenStreetMap: https://www.openstreetmap.org/');
            console.log('   🔑 Google Places API: https://cloud.google.com/maps-platform/places/');

        } catch (error) {
            console.log('⚠️ Erreur lors de la vérification:', error.message);
        }

        await this.promptChoice('\n📱 Appuyez sur Entrée pour continuer...', null, true);
    }

    /**
     * 🔧 Configuration Google Places
     */
    async showGooglePlacesConfiguration() {
        console.log('\n🔧 CONFIGURATION GOOGLE PLACES API');
        console.log('==================================');

        console.log('\n📋 ÉTAPES DÉTAILLÉES:');
        console.log('\n1. 🌐 Allez sur Google Cloud Console:');
        console.log('   https://console.cloud.google.com/');

        console.log('\n2. 📂 Créez ou sélectionnez un projet');

        console.log('\n3. 🔑 Activez l\'API Google Places:');
        console.log('   - APIs & Services > Library');
        console.log('   - Recherchez "Places API"');
        console.log('   - Cliquez "Enable"');

        console.log('\n4. 💳 Configurez la billing:');
        console.log('   - Billing > Link a billing account');
        console.log('   - Ajoutez une carte de crédit');

        console.log('\n5. 🔑 Créez une clé API:');
        console.log('   - APIs & Services > Credentials');
        console.log('   - Create Credentials > API Key');

        console.log('\n6. 🔒 Sécurisez la clé (recommandé):');
        console.log('   - Restrict Key > API restrictions');
        console.log('   - Sélectionnez "Places API"');

        console.log('\n7. 📝 Ajoutez dans votre fichier .env:');
        console.log('   GOOGLE_PLACES_API_KEY=votre_clé_ici');

        console.log('\n💰 COÛTS ESTIMÉS:');
        console.log('   - Text Search: $0.032 per request');
        console.log('   - Place Details: $0.017 per request');
        console.log('   - Pour ~200 lieux: $2-5 total');

        await this.promptChoice('\n📱 Appuyez sur Entrée pour continuer...', null, true);
    }

    /**
     * 🏠 Exécution du workflow addresses
     */
    async runAddressesWorkflow() {
        console.log('\n🏠 EXÉCUTION WORKFLOW ADDRESSES');
        console.log('===============================');

        try {
            console.log('\n1/3 🌍 Récupération des adresses...');
            await this.runScript(['node', 'scripts/addresses/fetchOpenAddresses.js']);

            console.log('\n2/3 📥 Import en Firestore...');
            await this.runScript(['node', 'scripts/addresses/importAddresses.js']);

            console.log('\n3/3 🔍 Validation...');
            await this.runScript(['node', 'scripts/addresses/validateAddresses.js']);

            console.log('\n🎉 WORKFLOW ADDRESSES TERMINÉ AVEC SUCCÈS!');
            console.log('✅ Collection: brussels_addresses');
            console.log('💰 Coût: 0€');

        } catch (error) {
            console.log('\n❌ ERREUR DANS LE WORKFLOW ADDRESSES');
            console.log('Message:', error.message);
        }
    }

    /**
     * 🐕 Exécution du workflow places
     */
    async runPlacesWorkflow() {
        console.log('\n🐕 EXÉCUTION WORKFLOW PLACES');
        console.log('============================');

        try {
            console.log('\n1/3 🔍 Récupération via Google Places API...');
            await this.runScript(['node', 'scripts/places/fetchGooglePlaces.js']);

            console.log('\n2/3 📥 Import en Firestore...');
            await this.runScript(['node', 'scripts/places/importPlaces.js']);

            console.log('\n3/3 🔍 Validation...');
            await this.runScript(['node', 'scripts/places/validatePlaces.js']);

            console.log('\n🎉 WORKFLOW PLACES TERMINÉ AVEC SUCCÈS!');
            console.log('✅ Collection: brussels_places');
            console.log('💳 Coût estimé: $2-5');

        } catch (error) {
            console.log('\n❌ ERREUR DANS LE WORKFLOW PLACES');
            console.log('Message:', error.message);

            if (error.message.includes('API key')) {
                console.log('\n💡 Vérifiez votre configuration Google Places API');
            }
        }
    }

    /**
     * 📊 Statistiques globales
     */
    async showGlobalStats() {
        console.log('\n📊 STATISTIQUES GLOBALES');
        console.log('========================');

        console.log('\n🔍 Analyse des collections...');
        // Ici on pourrait se connecter à Firestore pour les vraies stats
        console.log('   (Simulation - connectez à Firestore pour les vraies données)');

        console.log('\n📈 RÉSUMÉ:');
        console.log('   🏠 Addresses: À analyser');
        console.log('   🐕 Places: À analyser');
        console.log('   📊 Total documents: À calculer');
        console.log('   💾 Taille des données: À estimer');
        console.log('   💰 Coût total: À calculer');
    }

    /**
     * 🧹 Nettoyage automatique
     */
    async runCleanup() {
        console.log('\n🧹 NETTOYAGE AUTOMATIQUE');
        console.log('========================');

        console.log('\n⚠️ Cette opération va:');
        console.log('   • Supprimer les doublons');
        console.log('   • Nettoyer les données invalides');
        console.log('   • Optimiser les index');

        const confirm = await this.promptChoice('\n❓ Continuer ? (y/n): ', ['y', 'n', 'Y', 'N']);

        if (confirm.toLowerCase() === 'y') {
            console.log('\n🧹 Nettoyage en cours...');
            // Ici on lancerait les scripts de nettoyage
            console.log('✅ Nettoyage terminé (simulation)');
        }
    }

    /**
     * 🛠️ Exécution d'un script
     */
    async runScript(command) {
        return new Promise((resolve, reject) => {
            console.log(`\n▶️ Exécution: ${command.join(' ')}`);

            const process = spawn(command[0], command.slice(1), {
                stdio: 'inherit',
                shell: true
            });

            process.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Script terminé avec succès');
                    resolve();
                } else {
                    console.log(`❌ Script terminé avec erreur (code ${code})`);
                    reject(new Error(`Exit code ${code}`));
                }
            });

            process.on('error', (error) => {
                console.log('❌ Erreur d\'exécution:', error.message);
                reject(error);
            });
        });
    }

    /**
     * 💬 Prompt utilisateur
     */
    async promptChoice(question, validChoices = null, anyKey = false) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                if (anyKey) {
                    resolve(answer);
                } else if (validChoices && !validChoices.includes(answer)) {
                    console.log('❌ Choix invalide');
                    this.promptChoice(question, validChoices).then(resolve);
                } else {
                    resolve(answer);
                }
            });
        });
    }

    /**
     * 💤 Pause
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 🔄 Boucle principale
     */
    async run() {
        while (true) {
            try {
                const choice = await this.showMainMenu();

                switch (choice) {
                    case '1':
                        await this.handleAddressesWorkflow();
                        break;
                    case '2':
                        await this.handlePlacesWorkflow();
                        break;
                    case '3':
                        await this.handleBothWorkflows();
                        break;
                    case '4':
                        await this.handleValidationMenu();
                        break;
                    case '5':
                        await this.handleStatusMenu();
                        break;
                    case '6':
                        console.log('\n👋 Au revoir!');
                        this.rl.close();
                        return;
                }

                // Pause avant retour au menu
                await this.sleep(1000);

            } catch (error) {
                console.log('\n❌ Erreur:', error.message);
                await this.promptChoice('\n📱 Appuyez sur Entrée pour continuer...', null, true);
            }
        }
    }

    /**
     * 🧹 Nettoyage à la fermeture
     */
    cleanup() {
        this.rl.close();
    }
}

/**
 * 🎯 FONCTION PRINCIPALE
 */
async function main() {
    const manager = new DataManager();

    // Gestion de la fermeture propre
    process.on('SIGINT', () => {
        console.log('\n\n👋 Arrêt en cours...');
        manager.cleanup();
        process.exit(0);
    });

    try {
        await manager.run();
    } catch (error) {
        console.error('💥 Erreur fatale:', error.message);
        manager.cleanup();
        process.exit(1);
    }
}

module.exports = { DataManager };

// Exécution si appelé directement
if (require.main === module) {
    main();
}