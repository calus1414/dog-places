// src/services/scheduling/ScheduledDataService.ts

import {
  DataUpdatePipeline,
  DataType,
  DataSourceProvider,
  PipelineStatus,
  DataSource,
  AddressData,
  DogPlaceData,
  DataAcquisitionError,
  QuotaExceededError,
  ValidationError,
  DataUpdateEvent,
  DataUpdateEventType
} from '../../types/DataAcquisition.js';
import { DataVersionService, UpdateStrategyFactory } from './DataVersionService.js';

export class ScheduledDataService {
  private pipelines: Map<string, DataUpdatePipeline> = new Map();
  private versionService: DataVersionService;
  private eventCallbacks: Map<DataUpdateEventType, ((event: DataUpdateEvent) => void)[]> = new Map();

  constructor(versionService: DataVersionService) {
    this.versionService = versionService;
  }

  /**
   * Initialise les pipelines de données
   */
  initializePipelines(config: PipelineConfiguration[]): void {
    for (const pipelineConfig of config) {
      const pipeline: DataUpdatePipeline = {
        id: `${pipelineConfig.type}_pipeline`,
        type: pipelineConfig.type,
        frequency: pipelineConfig.frequency,
        lastUpdate: null,
        nextUpdate: this.calculateNextUpdate(null, pipelineConfig.frequency),
        sources: pipelineConfig.sources,
        status: 'idle',
        config: pipelineConfig.config,
        metrics: {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          avgDuration: 0,
          recordsProcessed: 0,
          recordsAdded: 0,
          recordsUpdated: 0,
          recordsSkipped: 0
        }
      };

      this.pipelines.set(pipeline.id, pipeline);
    }
  }

  /**
   * Exécute un pipeline de données
   */
  async executePipeline(pipelineId: string): Promise<PipelineExecutionResult> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${pipelineId}`);
    }

    const startTime = Date.now();

    try {
      // Mise à jour du statut
      this.updatePipelineStatus(pipeline, 'running');
      this.emitEvent('pipeline_started', pipeline.id, { pipeline });

      // Exécution avec fallback et retry
      const result = await this.executeWithFallback(pipeline);

      // Mise à jour des métriques
      const duration = Date.now() - startTime;
      this.updatePipelineMetrics(pipeline, true, duration, result);
      this.updatePipelineStatus(pipeline, 'completed');

      // Calcul de la prochaine exécution
      pipeline.lastUpdate = new Date();
      pipeline.nextUpdate = this.calculateNextUpdate(pipeline.lastUpdate, pipeline.frequency);

      this.emitEvent('pipeline_completed', pipeline.id, { result, duration });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updatePipelineMetrics(pipeline, false, duration, null);
      this.updatePipelineStatus(pipeline, 'failed');

      this.emitEvent('pipeline_failed', pipeline.id, { error: error.message, duration });

      throw error;
    }
  }

  /**
   * Exécution avec stratégie de fallback
   */
  private async executeWithFallback(pipeline: DataUpdatePipeline): Promise<PipelineExecutionResult> {
    const activeSources = pipeline.sources
      .filter(source => source.isActive)
      .sort((a, b) => a.priority - b.priority);

    let lastError: Error | null = null;
    let combinedData: (AddressData | DogPlaceData)[] = [];
    let sourcesUsed: DataSourceProvider[] = [];

    for (const source of activeSources) {
      try {
        // Vérification du quota
        if (!this.hasAvailableQuota(source)) {
          throw new QuotaExceededError(source.provider, source.quota.resetTime);
        }

        this.emitEvent('source_connected', pipeline.id, { source: source.provider });

        // Acquisition des données
        const data = await this.acquireDataFromSource(source, pipeline.type);

        // Validation des données
        const validatedData = await this.validateData(data, pipeline.config.validation);

        combinedData.push(...validatedData);
        sourcesUsed.push(source.provider);

        // Mise à jour des métriques de fiabilité
        this.updateSourceReliability(source, true);

        // Si on a assez de données de qualité, on peut s'arrêter
        if (this.hasMinimumQualityData(combinedData, pipeline.config.validation.qualityThreshold)) {
          break;
        }

      } catch (error) {
        lastError = error;
        this.updateSourceReliability(source, false);
        this.emitEvent('source_failed', pipeline.id, {
          source: source.provider,
          error: error.message
        });

        // Si c'est une erreur de quota, attendre avant le prochain source
        if (error instanceof QuotaExceededError) {
          await this.delay(source.config.timeout || 5000);
        }

        // Si fallback est désactivé, propager l'erreur
        if (!pipeline.config.fallback.enableFallback) {
          throw error;
        }

        continue;
      }
    }

    if (combinedData.length === 0 && lastError) {
      throw lastError;
    }

    // Déduplication et nettoyage final
    const uniqueData = this.deduplicateData(combinedData);

    // Persistance des données
    const persistResult = await this.persistData(uniqueData, pipeline.type);

    this.emitEvent('data_persisted', pipeline.id, {
      recordCount: persistResult.recordsPersisted,
      sources: sourcesUsed
    });

    return {
      success: true,
      recordsProcessed: combinedData.length,
      recordsPersisted: persistResult.recordsPersisted,
      recordsSkipped: persistResult.recordsSkipped,
      sourcesUsed,
      qualityScore: this.versionService.calculateQualityMetrics(uniqueData).overallScore,
      errors: []
    };
  }

  /**
   * Acquisition de données depuis une source spécifique
   */
  private async acquireDataFromSource(
    source: DataSource,
    type: DataType
  ): Promise<(AddressData | DogPlaceData)[]> {

    // Throttling
    await this.applyThrottling(source);

    switch (source.provider) {
      case 'Google':
        return await this.acquireFromGoogle(source, type);
      case 'URBIS':
        return await this.acquireFromURBIS(source, type);
      case 'OSM':
        return await this.acquireFromOSM(source, type);
      case 'Foursquare':
        return await this.acquireFromFoursquare(source, type);
      default:
        throw new DataAcquisitionError(
          `Unsupported source: ${source.provider}`,
          'UNSUPPORTED_SOURCE',
          source.provider
        );
    }
  }

  /**
   * Acquisition depuis Google Places API
   */
  private async acquireFromGoogle(
    source: DataSource,
    type: DataType
  ): Promise<(AddressData | DogPlaceData)[]> {

    const { GooglePlacesService } = await import('../providers/GooglePlacesService.js');
    const service = new GooglePlacesService(source.config);

    if (type === 'addresses') {
      return await service.getAllBrusselsAddresses();
    } else {
      return await service.getAllDogPlaces();
    }
  }

  /**
   * Acquisition depuis URBIS (addresses uniquement)
   */
  private async acquireFromURBIS(
    source: DataSource,
    type: DataType
  ): Promise<AddressData[]> {

    if (type !== 'addresses') {
      throw new DataAcquisitionError(
        'URBIS only supports address data',
        'INVALID_TYPE',
        source.provider
      );
    }

    const { URBISService } = await import('../providers/URBISService.js');
    const service = new URBISService(source.config);

    return await service.getAllAddresses();
  }

  /**
   * Acquisition depuis OpenStreetMap
   */
  private async acquireFromOSM(
    source: DataSource,
    type: DataType
  ): Promise<(AddressData | DogPlaceData)[]> {

    const { OSMService } = await import('../providers/OSMService.js');
    const service = new OSMService(source.config);

    if (type === 'addresses') {
      return await service.getAllBrusselsAddresses();
    } else {
      return await service.getAllDogPlaces();
    }
  }

  /**
   * Acquisition depuis Foursquare
   */
  private async acquireFromFoursquare(
    source: DataSource,
    type: DataType
  ): Promise<DogPlaceData[]> {

    if (type !== 'dogPlaces') {
      throw new DataAcquisitionError(
        'Foursquare only supports dog places data',
        'INVALID_TYPE',
        source.provider
      );
    }

    const { FoursquareService } = await import('../providers/FoursquareService.js');
    const service = new FoursquareService(source.config);

    return await service.getAllDogPlaces();
  }

  /**
   * Validation des données
   */
  private async validateData(
    data: (AddressData | DogPlaceData)[],
    config: any
  ): Promise<(AddressData | DogPlaceData)[]> {

    const validData: (AddressData | DogPlaceData)[] = [];

    for (const item of data) {
      try {
        // Validation des champs requis
        for (const field of config.requiredFields) {
          if (!(field in item) || (item as any)[field] == null) {
            throw new ValidationError(
              `Missing required field: ${field}`,
              item.source,
              item
            );
          }
        }

        // Validation géographique
        if (config.geoValidation) {
          const { latitude, longitude } = item.location;
          if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            throw new ValidationError(
              'Invalid coordinates',
              item.source,
              item
            );
          }

          // Vérification que c'est bien dans Bruxelles
          if (!this.isInBrussels(latitude, longitude)) {
            continue; // Skip mais ne pas considérer comme erreur
          }
        }

        validData.push(item);

      } catch (error) {
        if (error instanceof ValidationError) {
          // Log l'erreur mais continue
          console.warn(`Validation error for ${item.id}:`, error.message);
          continue;
        }
        throw error;
      }
    }

    this.emitEvent('data_validated', 'unknown', {
      total: data.length,
      valid: validData.length
    });

    return validData;
  }

  /**
   * Vérification des coordonnées de Bruxelles
   */
  private isInBrussels(latitude: number, longitude: number): boolean {
    return latitude >= 50.7642 && latitude <= 50.9073 &&
           longitude >= 4.2423 && longitude <= 4.4812;
  }

  /**
   * Déduplication des données
   */
  private deduplicateData(data: (AddressData | DogPlaceData)[]): (AddressData | DogPlaceData)[] {
    const seen = new Set<string>();
    const unique: (AddressData | DogPlaceData)[] = [];

    for (const item of data) {
      // Clé basée sur place_id ou coordonnées
      const key = item.placeId || `${item.location.latitude},${item.location.longitude}`;

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }

    return unique;
  }

  /**
   * Persistance des données
   */
  private async persistData(
    data: (AddressData | DogPlaceData)[],
    type: DataType
  ): Promise<PersistResult> {

    const { FirestoreService } = await import('../persistence/FirestoreService.js');
    const firestore = new FirestoreService();

    return await firestore.batchUpsert(data, type);
  }

  /**
   * Gestion des événements
   */
  addEventListener(type: DataUpdateEventType, callback: (event: DataUpdateEvent) => void): void {
    if (!this.eventCallbacks.has(type)) {
      this.eventCallbacks.set(type, []);
    }
    this.eventCallbacks.get(type)!.push(callback);
  }

  private emitEvent(type: DataUpdateEventType, pipelineId: string, data: any): void {
    const event: DataUpdateEvent = {
      id: `${type}_${Date.now()}_${Math.random()}`,
      pipelineId,
      type,
      timestamp: new Date(),
      data,
      metadata: {}
    };

    const callbacks = this.eventCallbacks.get(type) || [];
    for (const callback of callbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error(`Error in event callback for ${type}:`, error);
      }
    }
  }

  // Méthodes utilitaires
  private calculateNextUpdate(lastUpdate: Date | null, frequency: string): Date {
    const strategy = UpdateStrategyFactory.createStrategy(frequency);
    return strategy.getNextUpdateTime(lastUpdate, frequency);
  }

  private updatePipelineStatus(pipeline: DataUpdatePipeline, status: PipelineStatus): void {
    pipeline.status = status;
  }

  private updatePipelineMetrics(
    pipeline: DataUpdatePipeline,
    success: boolean,
    duration: number,
    result: PipelineExecutionResult | null
  ): void {
    pipeline.metrics.totalRuns++;

    if (success) {
      pipeline.metrics.successfulRuns++;
      if (result) {
        pipeline.metrics.recordsProcessed += result.recordsProcessed;
        pipeline.metrics.recordsAdded += result.recordsPersisted;
      }
    } else {
      pipeline.metrics.failedRuns++;
    }

    // Calcul de la durée moyenne
    const totalDuration = pipeline.metrics.avgDuration * (pipeline.metrics.totalRuns - 1) + duration;
    pipeline.metrics.avgDuration = totalDuration / pipeline.metrics.totalRuns;
    pipeline.metrics.lastRunDuration = duration;
  }

  private updateSourceReliability(source: DataSource, success: boolean): void {
    if (success) {
      source.reliability.consecutiveFailures = 0;
      source.reliability.uptime = Math.min(100, source.reliability.uptime + 0.1);
    } else {
      source.reliability.consecutiveFailures++;
      source.reliability.lastFailure = new Date();
      source.reliability.uptime = Math.max(0, source.reliability.uptime - 1);
    }

    // Recalcule le score de fiabilité
    source.reliability.score = this.calculateReliabilityScore(source.reliability);
  }

  private calculateReliabilityScore(reliability: any): number {
    const uptimeWeight = 0.4;
    const errorWeight = 0.3;
    const freshnessWeight = 0.3;

    const uptimeScore = reliability.uptime;
    const errorScore = Math.max(0, 100 - (reliability.errorRate * 10));
    const freshnessScore = reliability.lastFailure ?
      Math.max(0, 100 - ((Date.now() - reliability.lastFailure.getTime()) / (24 * 60 * 60 * 1000))) : 100;

    return uptimeWeight * uptimeScore + errorWeight * errorScore + freshnessWeight * freshnessScore;
  }

  private hasAvailableQuota(source: DataSource): boolean {
    const dailyUsage = source.quota.current;
    const dailyLimit = source.quota.daily;
    const warningThreshold = source.quota.warningThreshold / 100;

    if (dailyUsage >= dailyLimit) {
      return false;
    }

    if (dailyUsage >= (dailyLimit * warningThreshold)) {
      this.emitEvent('quota_warning', 'unknown', {
        source: source.provider,
        usage: dailyUsage,
        limit: dailyLimit
      });
    }

    return true;
  }

  private async applyThrottling(source: DataSource): Promise<void> {
    // Implémentation simple du throttling
    const delayMs = 1000 / (source.config.rateLimit || 1);
    await this.delay(delayMs);
  }

  private hasMinimumQualityData(data: (AddressData | DogPlaceData)[], threshold: number): boolean {
    if (data.length === 0) return false;

    const qualityScore = this.versionService.calculateQualityMetrics(data).overallScore;
    return qualityScore >= threshold;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Getters publics
  getPipeline(id: string): DataUpdatePipeline | undefined {
    return this.pipelines.get(id);
  }

  getAllPipelines(): DataUpdatePipeline[] {
    return Array.from(this.pipelines.values());
  }

  getPipelinesByStatus(status: PipelineStatus): DataUpdatePipeline[] {
    return Array.from(this.pipelines.values()).filter(p => p.status === status);
  }
}

// Interfaces supplémentaires
export interface PipelineConfiguration {
  type: DataType;
  frequency: string;
  sources: DataSource[];
  config: any;
}

export interface PipelineExecutionResult {
  success: boolean;
  recordsProcessed: number;
  recordsPersisted: number;
  recordsSkipped: number;
  sourcesUsed: DataSourceProvider[];
  qualityScore: number;
  errors: string[];
}

export interface PersistResult {
  recordsPersisted: number;
  recordsSkipped: number;
  errors: string[];
}