// src/services/scheduling/UpdateScheduler.ts

import { ScheduledDataService } from './ScheduledDataService.js';
import { DataVersionService } from './DataVersionService.js';
import { ConfigurationFactory } from '../../config/SchedulingConfig.js';
import {
  DataUpdatePipeline,
  DataType,
  PipelineStatus,
  DataUpdateEvent,
  SchedulingConfig
} from '../../types/DataAcquisition.js';

export class UpdateScheduler {
  private scheduledService: ScheduledDataService;
  private versionService: DataVersionService;
  private config: SchedulingConfig;
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  constructor() {
    this.versionService = new DataVersionService();
    this.scheduledService = new ScheduledDataService(this.versionService);
    this.config = ConfigurationFactory.createConfiguration().scheduling;
    this.setupEventListeners();
  }

  /**
   * Initialise et démarre le scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('📅 Scheduler already running');
      return;
    }

    console.log('🚀 Starting Update Scheduler...');
    console.log(`Environment: ${this.config.environment}`);
    console.log(`Enabled pipelines: ${this.config.enabledPipelines.join(', ')}`);

    try {
      // Initialise les pipelines
      await this.initializePipelines();

      // Programme les exécutions
      this.scheduleAllPipelines();

      this.isRunning = true;
      console.log('✅ Update Scheduler started successfully');

    } catch (error) {
      console.error('❌ Failed to start scheduler:', error);
      throw error;
    }
  }

  /**
   * Arrête le scheduler
   */
  stop(): void {
    console.log('🛑 Stopping Update Scheduler...');

    // Annule tous les timers
    for (const [pipelineId, timer] of this.timers) {
      clearTimeout(timer);
      console.log(`  Cancelled timer for ${pipelineId}`);
    }
    this.timers.clear();

    this.isRunning = false;
    console.log('✅ Update Scheduler stopped');
  }

  /**
   * Exécute manuellement un pipeline
   */
  async executeNow(pipelineId: string): Promise<void> {
    console.log(`🔧 Manual execution requested for ${pipelineId}`);

    const pipeline = this.scheduledService.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    if (pipeline.status === 'running') {
      throw new Error(`Pipeline ${pipelineId} is already running`);
    }

    try {
      await this.scheduledService.executePipeline(pipelineId);
      console.log(`✅ Manual execution of ${pipelineId} completed`);

      // Reprogramme la prochaine exécution
      this.reschedulePipeline(pipeline);

    } catch (error) {
      console.error(`❌ Manual execution of ${pipelineId} failed:`, error);
      throw error;
    }
  }

  /**
   * Retourne le statut du scheduler
   */
  getStatus(): SchedulerStatus {
    const pipelines = this.scheduledService.getAllPipelines();

    return {
      isRunning: this.isRunning,
      environment: this.config.environment,
      totalPipelines: pipelines.length,
      runningPipelines: pipelines.filter(p => p.status === 'running').length,
      scheduledPipelines: pipelines.filter(p => p.status === 'idle').length,
      failedPipelines: pipelines.filter(p => p.status === 'failed').length,
      nextExecution: this.getNextExecutionTime(),
      uptime: this.isRunning ? Date.now() - this.startTime : 0
    };
  }

  private startTime: number = Date.now();

  /**
   * Initialise les pipelines selon la configuration
   */
  private async initializePipelines(): Promise<void> {
    const fullConfig = ConfigurationFactory.createConfiguration();

    const pipelineConfigs = [];

    // Pipeline des adresses
    if (this.config.enabledPipelines.includes('addresses')) {
      pipelineConfigs.push({
        type: 'addresses' as DataType,
        frequency: fullConfig.updateStrategy.addresses.frequency,
        sources: fullConfig.addressSources,
        config: {
          maxRetries: 3,
          timeoutMs: this.config.globalTimeout,
          batchSize: 500,
          throttling: {
            requestsPerSecond: 2,
            requestsPerMinute: 120,
            requestsPerHour: 7200,
            burstLimit: 10
          },
          validation: {
            requiredFields: ['id', 'location', 'formattedAddress'],
            geoValidation: true,
            duplicateDetection: true,
            qualityThreshold: 80
          },
          fallback: {
            enableFallback: this.config.featureFlags.enableFallback,
            fallbackSources: ['OSM'],
            fallbackDelay: 5000
          }
        }
      });
    }

    // Pipeline des lieux pour chiens
    if (this.config.enabledPipelines.includes('dogPlaces')) {
      pipelineConfigs.push({
        type: 'dogPlaces' as DataType,
        frequency: fullConfig.updateStrategy.dogPlaces.frequency,
        sources: fullConfig.dogPlacesSources,
        config: {
          maxRetries: 5,
          timeoutMs: this.config.globalTimeout,
          batchSize: 200,
          throttling: {
            requestsPerSecond: 1,
            requestsPerMinute: 60,
            requestsPerHour: 3600,
            burstLimit: 5
          },
          validation: {
            requiredFields: ['id', 'name', 'location', 'type'],
            geoValidation: true,
            duplicateDetection: true,
            qualityThreshold: 85
          },
          fallback: {
            enableFallback: this.config.featureFlags.enableFallback,
            fallbackSources: ['OSM'],
            fallbackDelay: 3000
          }
        }
      });
    }

    this.scheduledService.initializePipelines(pipelineConfigs);
    console.log(`📋 Initialized ${pipelineConfigs.length} pipelines`);
  }

  /**
   * Programme toutes les exécutions
   */
  private scheduleAllPipelines(): void {
    const pipelines = this.scheduledService.getAllPipelines();

    for (const pipeline of pipelines) {
      this.schedulePipeline(pipeline);
    }

    console.log(`⏰ Scheduled ${pipelines.length} pipelines`);
  }

  /**
   * Programme l'exécution d'un pipeline
   */
  private schedulePipeline(pipeline: DataUpdatePipeline): void {
    // Annule le timer existant si il y en a un
    const existingTimer = this.timers.get(pipeline.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const now = Date.now();
    const nextExecution = pipeline.nextUpdate.getTime();
    const delay = Math.max(0, nextExecution - now);

    console.log(`📅 Scheduling ${pipeline.id}:`);
    console.log(`  Next execution: ${pipeline.nextUpdate.toISOString()}`);
    console.log(`  Delay: ${Math.round(delay / 1000 / 60)} minutes`);

    const timer = setTimeout(async () => {
      await this.executePipelineWithRetry(pipeline);
    }, delay);

    this.timers.set(pipeline.id, timer);
  }

  /**
   * Reprogramme un pipeline après exécution
   */
  private reschedulePipeline(pipeline: DataUpdatePipeline): void {
    // Recalcule la prochaine exécution
    const strategy = this.versionService.constructor.name; // Simplified
    // pipeline.nextUpdate sera mis à jour par le ScheduledDataService

    // Reprogramme
    this.schedulePipeline(pipeline);
  }

  /**
   * Exécute un pipeline avec retry automatique
   */
  private async executePipelineWithRetry(pipeline: DataUpdatePipeline): Promise<void> {
    const maxRetries = pipeline.config.maxRetries;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        console.log(`🔄 Executing ${pipeline.id} (attempt ${attempt + 1}/${maxRetries})`);

        await this.scheduledService.executePipeline(pipeline.id);

        console.log(`✅ ${pipeline.id} executed successfully`);
        break;

      } catch (error) {
        attempt++;
        console.error(`❌ ${pipeline.id} failed (attempt ${attempt}):`, error.message);

        if (attempt >= maxRetries) {
          console.error(`💥 ${pipeline.id} failed after ${maxRetries} attempts`);

          // Notifie l'échec
          this.notifyFailure(pipeline, error as Error);
          break;
        }

        // Attente exponentielle avant retry
        const retryDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
        console.log(`⏳ Retrying ${pipeline.id} in ${retryDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    // Reprogramme la prochaine exécution
    this.reschedulePipeline(pipeline);
  }

  /**
   * Configure les écouteurs d'événements
   */
  private setupEventListeners(): void {
    // Écoute les événements de pipeline
    this.scheduledService.addEventListener('pipeline_started', (event) => {
      console.log(`🚀 Pipeline ${event.pipelineId} started`);
    });

    this.scheduledService.addEventListener('pipeline_completed', (event) => {
      console.log(`✅ Pipeline ${event.pipelineId} completed in ${event.data.duration}ms`);
      this.notifySuccess(event);
    });

    this.scheduledService.addEventListener('pipeline_failed', (event) => {
      console.error(`❌ Pipeline ${event.pipelineId} failed: ${event.data.error}`);
    });

    this.scheduledService.addEventListener('quota_warning', (event) => {
      console.warn(`⚠️  Quota warning for ${event.data.source}: ${event.data.usage}/${event.data.limit}`);
      this.notifyQuotaWarning(event);
    });

    this.scheduledService.addEventListener('quota_exceeded', (event) => {
      console.error(`🚫 Quota exceeded for ${event.data.source}`);
    });
  }

  /**
   * Notifie le succès d'un pipeline
   */
  private notifySuccess(event: DataUpdateEvent): void {
    if (!this.config.notifications.notifyOnSuccess) return;

    const message = `✅ Pipeline ${event.pipelineId} completed successfully\n` +
                   `Duration: ${event.data.duration}ms\n` +
                   `Records: ${event.data.result?.recordsPersisted || 0}`;

    this.sendNotification(message, 'success');
  }

  /**
   * Notifie l'échec d'un pipeline
   */
  private notifyFailure(pipeline: DataUpdatePipeline, error: Error): void {
    if (!this.config.notifications.notifyOnFailure) return;

    const message = `❌ Pipeline ${pipeline.id} failed after ${pipeline.config.maxRetries} attempts\n` +
                   `Error: ${error.message}\n` +
                   `Next retry: ${pipeline.nextUpdate.toISOString()}`;

    this.sendNotification(message, 'error');
  }

  /**
   * Notifie un avertissement de quota
   */
  private notifyQuotaWarning(event: DataUpdateEvent): void {
    if (!this.config.notifications.notifyOnQuotaWarning) return;

    const message = `⚠️  Quota warning for ${event.data.source}\n` +
                   `Usage: ${event.data.usage}/${event.data.limit}\n` +
                   `Consider reducing frequency or increasing limits`;

    this.sendNotification(message, 'warning');
  }

  /**
   * Envoie une notification
   */
  private sendNotification(message: string, type: 'success' | 'error' | 'warning'): void {
    // Implémentation simplifiée - à étendre selon les besoins
    console.log(`📢 Notification (${type}): ${message}`);

    // TODO: Implémenter Slack, email, etc.
    if (this.config.notifications.enableSlack && this.config.notifications.slackWebhook) {
      this.sendSlackNotification(message, type);
    }

    if (this.config.notifications.enableEmail && this.config.notifications.emailRecipients.length > 0) {
      this.sendEmailNotification(message, type);
    }
  }

  private async sendSlackNotification(message: string, type: string): Promise<void> {
    // TODO: Implémenter l'envoi Slack
    console.log(`📱 Would send Slack notification: ${message}`);
  }

  private async sendEmailNotification(message: string, type: string): Promise<void> {
    // TODO: Implémenter l'envoi email
    console.log(`📧 Would send Email notification: ${message}`);
  }

  /**
   * Retourne la prochaine heure d'exécution
   */
  private getNextExecutionTime(): Date | null {
    const pipelines = this.scheduledService.getAllPipelines();
    if (pipelines.length === 0) return null;

    const nextTimes = pipelines.map(p => p.nextUpdate.getTime());
    return new Date(Math.min(...nextTimes));
  }

  // Méthodes publiques pour monitoring
  getPipelineStatus(pipelineId: string): DataUpdatePipeline | undefined {
    return this.scheduledService.getPipeline(pipelineId);
  }

  getAllPipelines(): DataUpdatePipeline[] {
    return this.scheduledService.getAllPipelines();
  }

  getRunningPipelines(): DataUpdatePipeline[] {
    return this.scheduledService.getPipelinesByStatus('running');
  }

  getFailedPipelines(): DataUpdatePipeline[] {
    return this.scheduledService.getPipelinesByStatus('failed');
  }
}

export interface SchedulerStatus {
  isRunning: boolean;
  environment: string;
  totalPipelines: number;
  runningPipelines: number;
  scheduledPipelines: number;
  failedPipelines: number;
  nextExecution: Date | null;
  uptime: number;
}