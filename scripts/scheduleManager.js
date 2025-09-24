// scripts/scheduleManager.js
// Pont entre les scripts existants et la nouvelle architecture

require('dotenv').config();
const { pathToFileURL } = require('url');
const path = require('path');

class ScheduleManagerBridge {
  constructor() {
    this.scheduler = null;
    this.isInitialized = false;
  }

  /**
   * Initialise le nouveau système de scheduling
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('🔄 Initializing TypeScript scheduling system...');

      // Import dynamique du scheduler TypeScript
      const schedulerModule = await import(pathToFileURL(
        path.resolve(__dirname, '../src/services/scheduling/UpdateScheduler.js')
      ).href);

      const { UpdateScheduler } = schedulerModule;
      this.scheduler = new UpdateScheduler();

      await this.scheduler.start();
      this.isInitialized = true;

      console.log('✅ Scheduling system initialized');
    } catch (error) {
      console.error('❌ Failed to initialize scheduling system:', error);
      console.log('🔄 Using new architecture instead of TypeScript scheduler...');

      // Utiliser la nouvelle architecture refactorisée
      await this.runNewArchitecture();
    }
  }

  /**
   * Exécute un pipeline spécifique
   */
  async executePipeline(type) {
    if (!this.isInitialized) {
      console.log('⚠️  Scheduler not initialized, using legacy scripts');
      return await this.runLegacyScript(type);
    }

    try {
      const pipelineId = `${type}_pipeline`;
      await this.scheduler.executeNow(pipelineId);
      console.log(`✅ Pipeline ${type} executed via new scheduler`);
    } catch (error) {
      console.error(`❌ Pipeline ${type} failed via new scheduler:`, error);
      console.log('🔄 Falling back to legacy script...');
      await this.runLegacyScript(type);
    }
  }

  /**
   * Retourne le statut du système
   */
  getStatus() {
    if (!this.isInitialized || !this.scheduler) {
      return {
        system: 'legacy',
        isRunning: false,
        message: 'Using legacy scripts'
      };
    }

    return {
      system: 'typescript',
      ...this.scheduler.getStatus()
    };
  }

  /**
   * Utilise la nouvelle architecture refactorisée
   */
  async runNewArchitecture() {
    console.log('🚀 Running new architecture scripts...');

    try {
      // 1. Import des adresses (GRATUIT)
      console.log('🏠 Starting addresses workflow (FREE)...');
      await this.runNewScript('addresses');

      await new Promise(resolve => setTimeout(resolve, 3000)); // Pause entre workflows

      // 2. Import des places (PAYANT - seulement si API key disponible)
      if (process.env.GOOGLE_PLACES_API_KEY) {
        console.log('🐕 Starting places workflow (PAID)...');
        await this.runNewScript('places');
      } else {
        console.log('⚠️ Google Places API key not found, skipping places import');
        console.log('💡 Add GOOGLE_PLACES_API_KEY to .env for places import');
      }

      console.log('✅ New architecture workflow completed');

    } catch (error) {
      console.error('❌ New architecture failed, falling back to legacy...', error);
      await this.runLegacyScripts();
    }
  }

  /**
   * Exécute un workflow de la nouvelle architecture
   */
  async runNewScript(type) {
    const { spawn } = require('child_process');

    console.log(`🔄 Running ${type} workflow...`);

    return new Promise((resolve, reject) => {
      const npmScript = type === 'addresses' ? 'import:addresses' : 'import:places';

      const process = spawn('npm', ['run', npmScript], {
        stdio: 'inherit',
        shell: true,
        cwd: path.resolve(__dirname, '..')  // Root du projet
      });

      process.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ ${type} workflow completed successfully`);
          resolve();
        } else {
          console.error(`❌ ${type} workflow failed with code ${code}`);
          reject(new Error(`${type} workflow failed`));
        }
      });

      process.on('error', (error) => {
        console.error(`❌ ${type} workflow error:`, error);
        reject(error);
      });
    });
  }

  /**
   * Fallback vers les scripts legacy
   */
  async runLegacyScripts() {
    console.log('🔄 Running legacy scripts...');

    try {
      // Exécute les scripts legacy dans l'ordre
      await this.runLegacyScript('dogPlaces');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Pause entre scripts
      await this.runLegacyScript('addresses');
    } catch (error) {
      console.error('❌ Legacy scripts failed:', error);
      throw error;
    }
  }

  /**
   * Exécute un script legacy spécifique
   */
  async runLegacyScript(type) {
    const scripts = {
      dogPlaces: 'legacy/fillFirebase.js',
      addresses: 'legacy/fetchAllBrusselsAddresses.js'
    };

    const scriptName = scripts[type];
    if (!scriptName) {
      throw new Error(`Unknown script type: ${type}`);
    }

    console.log(`📜 Running legacy script: ${scriptName}`);

    try {
      // Import et exécution du script
      const scriptPath = path.resolve(__dirname, scriptName);
      const { main } = require(scriptPath);

      if (typeof main === 'function') {
        await main();
        console.log(`✅ Legacy script ${scriptName} completed`);
      } else {
        console.warn(`⚠️  Script ${scriptName} does not export a main function`);
      }
    } catch (error) {
      console.error(`❌ Legacy script ${scriptName} failed:`, error);
      throw error;
    }
  }

  /**
   * Arrête le scheduler
   */
  stop() {
    if (this.scheduler) {
      this.scheduler.stop();
    }
    this.isInitialized = false;
  }
}

// Interface CLI
async function main() {
  const action = process.argv[2] || 'start';
  const manager = new ScheduleManagerBridge();

  try {
    switch (action) {
      case 'start':
        console.log('🚀 Starting schedule manager...');
        await manager.initialize();

        // Garde le processus vivant
        process.on('SIGINT', () => {
          console.log('\\n🛑 Shutting down...');
          manager.stop();
          process.exit(0);
        });

        console.log('⏰ Schedule manager running. Press Ctrl+C to stop.');
        break;

      case 'execute':
        const type = process.argv[3];
        if (!type) {
          console.error('❌ Please specify pipeline type: dogPlaces or addresses');
          process.exit(1);
        }

        await manager.initialize();
        await manager.executePipeline(type);
        break;

      case 'status':
        await manager.initialize();
        const status = manager.getStatus();
        console.log('📊 Scheduler Status:');
        console.log(JSON.stringify(status, null, 2));
        break;

      case 'legacy':
        const legacyType = process.argv[3];
        if (!legacyType) {
          console.error('❌ Please specify script type: dogPlaces or addresses');
          process.exit(1);
        }

        await manager.runLegacyScript(legacyType);
        break;

      default:
        console.log('Usage:');
        console.log('  node scheduleManager.js start           # Start scheduler');
        console.log('  node scheduleManager.js execute <type>  # Execute pipeline');
        console.log('  node scheduleManager.js status          # Show status');
        console.log('  node scheduleManager.js legacy <type>   # Run legacy script');
        console.log('');
        console.log('Types: dogPlaces, addresses');
        break;
    }
  } catch (error) {
    console.error('💥 Schedule manager error:', error);
    process.exit(1);
  }
}

// Export pour utilisation en module
module.exports = { ScheduleManagerBridge, main };

// Exécution directe
if (require.main === module) {
  main();
}