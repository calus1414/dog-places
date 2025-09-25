const readline = require('readline');

/**
 * 🧪 TEST WORKFLOW LOCAL
 *
 * Simule les choix du workflow GitHub pour tests locaux
 * avant de lancer sur GitHub Actions
 */

class WorkflowTester {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async testWorkflow() {
        console.log('🧪 TEST WORKFLOW LOCAL');
        console.log('======================');
        console.log('Simulation du workflow GitHub Actions en local\n');

        // Choix du type de workflow
        console.log('📋 TYPES DE WORKFLOW DISPONIBLES:');
        console.log('1. 🏠 addresses  - Adresses (Gratuit, ~10min)');
        console.log('2. 🐕 places     - Lieux pour chiens (Payant $2-5, ~5min)');
        console.log('3. 🚀 both       - Les deux séquentiellement (~15min)');
        console.log('4. 📚 legacy     - Anciens scripts (Lent, €200+, 13h+)');
        console.log('5. ❌ cancel     - Annuler');

        const choice = await this.promptChoice('\n🎯 Votre choix (1-5): ', ['1', '2', '3', '4', '5']);

        const workflowTypes = {
            '1': 'addresses',
            '2': 'places',
            '3': 'both',
            '4': 'legacy',
            '5': 'cancel'
        };

        const workflowType = workflowTypes[choice];

        if (workflowType === 'cancel') {
            console.log('❌ Test annulé');
            this.rl.close();
            return;
        }

        // Mode test
        const dryRun = await this.promptChoice('\n🧪 Mode test (pas de sauvegarde réelle) ? (y/n): ', ['y', 'n', 'Y', 'N']);
        const isDryRun = dryRun.toLowerCase() === 'y';

        console.log('\n🎯 CONFIGURATION DU TEST:');
        console.log(`   Workflow: ${workflowType}`);
        console.log(`   Mode test: ${isDryRun ? 'Oui (simulation)' : 'Non (production)'}`);

        const confirm = await this.promptChoice('\n▶️ Lancer le test ? (y/n): ', ['y', 'n', 'Y', 'N']);

        if (confirm.toLowerCase() === 'n') {
            console.log('❌ Test annulé');
            this.rl.close();
            return;
        }

        // Lancement du test
        await this.executeWorkflow(workflowType, isDryRun);

        this.rl.close();
    }

    async executeWorkflow(workflowType, isDryRun) {
        console.log('\n🚀 LANCEMENT DU TEST');
        console.log('====================');

        // Vérifications préalables
        await this.checkEnvironment(workflowType);

        const { spawn } = require('child_process');

        return new Promise((resolve, reject) => {
            let command, args;

            switch (workflowType) {
                case 'addresses':
                    console.log('🏠 Test workflow ADDRESSES (Gratuit)...');
                    command = 'npm';
                    args = isDryRun ? ['run', 'fetch:addresses'] : ['run', 'import:addresses'];
                    break;

                case 'places':
                    console.log('🐕 Test workflow PLACES (Payant)...');
                    command = 'npm';
                    args = isDryRun ? ['run', 'fetch:places'] : ['run', 'import:places'];
                    break;

                case 'both':
                    console.log('🚀 Test workflow COMPLET...');
                    console.log('   Cette option lancera addresses puis places');
                    command = 'npm';
                    args = ['run', 'import:addresses'];
                    // Note: Pour 'both', on lance juste addresses en test
                    break;

                case 'legacy':
                    console.log('📚 Test scripts LEGACY...');
                    command = 'node';
                    args = ['scripts/scheduleManager.js', 'execute'];
                    break;

                default:
                    console.log('❌ Type de workflow invalide');
                    reject(new Error('Invalid workflow type'));
                    return;
            }

            console.log(`\n▶️ Exécution: ${command} ${args.join(' ')}`);

            const process = spawn(command, args, {
                stdio: 'inherit',
                shell: true
            });

            process.on('close', (code) => {
                if (code === 0) {
                    console.log('\n✅ TEST RÉUSSI!');
                    console.log('💡 Le workflow peut être lancé sur GitHub Actions');

                    if (workflowType === 'both' && !isDryRun) {
                        console.log('\n🔄 Pour le workflow complet, lancez aussi:');
                        console.log('   npm run import:places');
                    }

                    resolve();
                } else {
                    console.log(`\n❌ TEST ÉCHOUÉ (code ${code})`);
                    console.log('🔧 Corrigez les erreurs avant de lancer sur GitHub');
                    reject(new Error(`Test failed with code ${code}`));
                }
            });

            process.on('error', (error) => {
                console.log('\n❌ ERREUR D\'EXÉCUTION:', error.message);
                reject(error);
            });
        });
    }

    async checkEnvironment(workflowType) {
        console.log('\n🔍 Vérification de l\'environnement...');

        // Vérifier .env
        require('dotenv').config();

        const requiredEnvs = [
            'FIREBASE_CLIENT_EMAIL',
            'FIREBASE_PRIVATE_KEY',
            'EXPO_PUBLIC_FIREBASE_PROJECT_ID'
        ];

        let missingEnvs = [];

        requiredEnvs.forEach(env => {
            if (!process.env[env]) {
                missingEnvs.push(env);
            }
        });

        // Vérification spécifique pour places
        if ((workflowType === 'places' || workflowType === 'both') && !process.env.GOOGLE_PLACES_API_KEY) {
            missingEnvs.push('GOOGLE_PLACES_API_KEY');
        }

        if (missingEnvs.length > 0) {
            console.log('\n⚠️ Variables d\'environnement manquantes:');
            missingEnvs.forEach(env => {
                console.log(`   ❌ ${env}`);
            });
            console.log('\n💡 Ajoutez ces variables dans votre fichier .env');

            if (workflowType === 'places' && missingEnvs.includes('GOOGLE_PLACES_API_KEY')) {
                console.log('\n🔑 Pour GOOGLE_PLACES_API_KEY:');
                console.log('   1. Allez sur Google Cloud Console');
                console.log('   2. Activez Google Places API');
                console.log('   3. Créez une clé API');
                console.log('   4. Ajoutez GOOGLE_PLACES_API_KEY=votre_clé dans .env');
            }

            const continueAnyway = await this.promptChoice('\n❓ Continuer malgré les variables manquantes ? (y/n): ', ['y', 'n', 'Y', 'N']);
            if (continueAnyway.toLowerCase() === 'n') {
                throw new Error('Variables d\'environnement manquantes');
            }
        } else {
            console.log('✅ Toutes les variables requises sont présentes');
        }

        // Vérifications spécifiques par workflow
        if (workflowType === 'places' || workflowType === 'both') {
            console.log('💳 ATTENTION: Le workflow places utilise Google Places API (PAYANT)');
            console.log('   Coût estimé: $2-5 par exécution');
            console.log('   Surveillez vos quotas Google Cloud');
        }

        if (workflowType === 'legacy') {
            console.log('⚠️ ATTENTION: Les scripts legacy sont très lents et coûteux');
            console.log('   Durée: 13+ heures, Coût: €200+');
            console.log('   💡 Utilisez plutôt "addresses" (gratuit) ou "both"');
        }
    }

    async promptChoice(question, validChoices) {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                if (validChoices && !validChoices.includes(answer)) {
                    console.log('❌ Choix invalide');
                    this.promptChoice(question, validChoices).then(resolve);
                } else {
                    resolve(answer);
                }
            });
        });
    }
}

/**
 * 🎯 FONCTION PRINCIPALE
 */
async function main() {
    const tester = new WorkflowTester();

    try {
        await tester.testWorkflow();
        console.log('\n👋 Test terminé');
    } catch (error) {
        console.error('\n💥 Erreur lors du test:', error.message);
        process.exit(1);
    }
}

// Exécution si appelé directement
if (require.main === module) {
    main();
}