// src/config/SchedulingConfig.ts

import {
  SchedulingConfig,
  DataSource,
  UpdateStrategy,
  FeatureFlags,
  MonitoringConfig,
  NotificationConfig
} from '../types/DataAcquisition.js';

// Configuration environment-aware
export class SchedulingConfigManager {
  private config: SchedulingConfig;
  private environment: 'development' | 'staging' | 'production';

  constructor() {
    this.environment = (process.env.NODE_ENV as any) || 'development';
    this.config = this.buildConfig();
  }

  private buildConfig(): SchedulingConfig {
    const baseConfig: SchedulingConfig = {
      environment: this.environment,
      enabledPipelines: this.getEnabledPipelines(),
      globalTimeout: this.getGlobalTimeout(),
      maxConcurrentPipelines: this.getMaxConcurrentPipelines(),
      monitoring: this.getMonitoringConfig(),
      notifications: this.getNotificationConfig(),
      featureFlags: this.getFeatureFlags()
    };

    return baseConfig;
  }

  private getEnabledPipelines() {
    const enabled = process.env.ENABLED_PIPELINES?.split(',') || ['addresses', 'dogPlaces'];
    return enabled.filter(p => ['addresses', 'dogPlaces'].includes(p)) as any[];
  }

  private getGlobalTimeout(): number {
    const timeouts = {
      development: 5 * 60 * 1000,   // 5 minutes
      staging: 15 * 60 * 1000,      // 15 minutes
      production: 60 * 60 * 1000    // 1 hour
    };
    return parseInt(process.env.GLOBAL_TIMEOUT || timeouts[this.environment].toString());
  }

  private getMaxConcurrentPipelines(): number {
    const defaults = {
      development: 1,
      staging: 2,
      production: 3
    };
    return parseInt(process.env.MAX_CONCURRENT_PIPELINES || defaults[this.environment].toString());
  }

  private getMonitoringConfig(): MonitoringConfig {
    return {
      enableMetrics: process.env.ENABLE_METRICS !== 'false',
      enableLogs: process.env.ENABLE_LOGS !== 'false',
      logLevel: (process.env.LOG_LEVEL as any) || (this.environment === 'production' ? 'info' : 'debug'),
      metricsRetention: parseInt(process.env.METRICS_RETENTION || '30')
    };
  }

  private getNotificationConfig(): NotificationConfig {
    return {
      enableSlack: process.env.ENABLE_SLACK_NOTIFICATIONS === 'true',
      enableEmail: process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true',
      slackWebhook: process.env.SLACK_WEBHOOK_URL,
      emailRecipients: process.env.EMAIL_RECIPIENTS?.split(',') || [],
      notifyOnSuccess: process.env.NOTIFY_ON_SUCCESS === 'true',
      notifyOnFailure: process.env.NOTIFY_ON_FAILURE !== 'false',
      notifyOnQuotaWarning: process.env.NOTIFY_ON_QUOTA_WARNING !== 'false'
    };
  }

  private getFeatureFlags(): FeatureFlags {
    return {
      enableURBIS: process.env.ENABLE_URBIS !== 'false',
      enableOSM: process.env.ENABLE_OSM !== 'false',
      enableGoogle: process.env.ENABLE_GOOGLE !== 'false',
      enableFoursquare: process.env.ENABLE_FOURSQUARE !== 'false',
      enableFallback: process.env.ENABLE_FALLBACK !== 'false',
      enableValidation: process.env.ENABLE_VALIDATION !== 'false',
      enableDeduplication: process.env.ENABLE_DEDUPLICATION !== 'false'
    };
  }

  getConfig(): SchedulingConfig {
    return this.config;
  }

  // Méthodes pour update dynamique
  updateFeatureFlag(flag: keyof FeatureFlags, value: boolean): void {
    this.config.featureFlags[flag] = value;
  }

  isFeatureEnabled(flag: keyof FeatureFlags): boolean {
    return this.config.featureFlags[flag];
  }
}

// Configuration des sources de données par environment
export class DataSourceConfigManager {
  private environment: string;

  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
  }

  getAddressDataSources(): DataSource[] {
    const sources: DataSource[] = [];

    // Google Places (toujours disponible)
    if (process.env.GOOGLE_PLACES_API_KEY) {
      sources.push({
        provider: 'Google',
        priority: 1,
        isActive: process.env.ENABLE_GOOGLE !== 'false',
        quota: {
          daily: parseInt(process.env.GOOGLE_DAILY_QUOTA || '1000'),
          monthly: parseInt(process.env.GOOGLE_MONTHLY_QUOTA || '30000'),
          current: 0,
          resetTime: this.getNextMidnight(),
          warningThreshold: 80
        },
        reliability: {
          score: 95,
          uptime: 99.5,
          avgResponseTime: 200,
          errorRate: 0.5,
          consecutiveFailures: 0
        },
        config: {
          apiKey: process.env.GOOGLE_PLACES_API_KEY,
          baseUrl: 'https://maps.googleapis.com/maps/api',
          version: 'v1',
          timeout: 10000,
          rateLimit: this.environment === 'production' ? 2 : 5 // req/sec
        }
      });
    }

    // URBIS (uniquement pour production/staging)
    if (['production', 'staging'].includes(this.environment)) {
      sources.push({
        provider: 'URBIS',
        priority: 2,
        isActive: process.env.ENABLE_URBIS === 'true',
        quota: {
          daily: 10000,
          monthly: 300000,
          current: 0,
          resetTime: this.getNextMidnight(),
          warningThreshold: 90
        },
        reliability: {
          score: 88,
          uptime: 97.8,
          avgResponseTime: 500,
          errorRate: 2.2,
          consecutiveFailures: 0
        },
        config: {
          baseUrl: process.env.URBIS_API_URL || 'https://geoservices-urbis.irisnet.be',
          timeout: 15000,
          rateLimit: 1
        }
      });
    }

    // OpenStreetMap (fallback)
    sources.push({
      provider: 'OSM',
      priority: 3,
      isActive: process.env.ENABLE_OSM !== 'false',
      quota: {
        daily: 100000,
        monthly: 3000000,
        current: 0,
        resetTime: this.getNextMidnight(),
        warningThreshold: 95
      },
      reliability: {
        score: 92,
        uptime: 99.1,
        avgResponseTime: 300,
        errorRate: 0.9,
        consecutiveFailures: 0
      },
      config: {
        baseUrl: 'https://nominatim.openstreetmap.org',
        timeout: 8000,
        rateLimit: 1,
        customHeaders: {
          'User-Agent': 'DogPlacesBrussels/1.0'
        }
      }
    });

    return sources.filter(source => source.isActive);
  }

  getDogPlacesDataSources(): DataSource[] {
    const sources: DataSource[] = [];

    // Google Places (priorité haute)
    if (process.env.GOOGLE_PLACES_API_KEY) {
      sources.push({
        provider: 'Google',
        priority: 1,
        isActive: process.env.ENABLE_GOOGLE !== 'false',
        quota: {
          daily: parseInt(process.env.GOOGLE_DAILY_QUOTA || '1000'),
          monthly: parseInt(process.env.GOOGLE_MONTHLY_QUOTA || '30000'),
          current: 0,
          resetTime: this.getNextMidnight(),
          warningThreshold: 80
        },
        reliability: {
          score: 95,
          uptime: 99.5,
          avgResponseTime: 200,
          errorRate: 0.5,
          consecutiveFailures: 0
        },
        config: {
          apiKey: process.env.GOOGLE_PLACES_API_KEY,
          baseUrl: 'https://maps.googleapis.com/maps/api',
          version: 'v1',
          timeout: 10000,
          rateLimit: this.environment === 'production' ? 2 : 5
        }
      });
    }

    // Foursquare (si disponible)
    if (process.env.FOURSQUARE_API_KEY) {
      sources.push({
        provider: 'Foursquare',
        priority: 2,
        isActive: process.env.ENABLE_FOURSQUARE === 'true',
        quota: {
          daily: parseInt(process.env.FOURSQUARE_DAILY_QUOTA || '500'),
          monthly: parseInt(process.env.FOURSQUARE_MONTHLY_QUOTA || '15000'),
          current: 0,
          resetTime: this.getNextMidnight(),
          warningThreshold: 85
        },
        reliability: {
          score: 87,
          uptime: 98.2,
          avgResponseTime: 400,
          errorRate: 1.8,
          consecutiveFailures: 0
        },
        config: {
          apiKey: process.env.FOURSQUARE_API_KEY,
          baseUrl: 'https://api.foursquare.com/v3',
          timeout: 12000,
          rateLimit: 3
        }
      });
    }

    // OpenStreetMap
    sources.push({
      provider: 'OSM',
      priority: 3,
      isActive: process.env.ENABLE_OSM !== 'false',
      quota: {
        daily: 50000,
        monthly: 1500000,
        current: 0,
        resetTime: this.getNextMidnight(),
        warningThreshold: 95
      },
      reliability: {
        score: 90,
        uptime: 98.8,
        avgResponseTime: 350,
        errorRate: 1.2,
        consecutiveFailures: 0
      },
      config: {
        baseUrl: 'https://overpass-api.de/api',
        timeout: 10000,
        rateLimit: 1,
        customHeaders: {
          'User-Agent': 'DogPlacesBrussels/1.0'
        }
      }
    });

    return sources.filter(source => source.isActive);
  }

  private getNextMidnight(): Date {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }
}

// Update Strategy selon l'environment
export class UpdateStrategyManager {
  private environment: string;

  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
  }

  getUpdateStrategy(): UpdateStrategy {
    const baseStrategy: UpdateStrategy = {
      addresses: {
        frequency: 'biannual',
        priority: 'low',
        sources: ['URBIS', 'OSM', 'Google'],
        schedule: this.getAddressUpdateSchedule()
      },
      dogPlaces: {
        frequency: 'weekly',
        priority: 'high',
        sources: ['Google', 'Foursquare', 'OSM'],
        schedule: this.getDogPlacesUpdateSchedule()
      }
    };

    // Ajustements selon l'environment
    if (this.environment === 'development') {
      // En dev, plus fréquent pour les tests
      baseStrategy.addresses.frequency = 'weekly';
      baseStrategy.dogPlaces.frequency = 'daily';
    } else if (this.environment === 'staging') {
      // En staging, fréquence intermédiaire
      baseStrategy.addresses.frequency = 'monthly';
      baseStrategy.dogPlaces.frequency = 'weekly';
    }

    return baseStrategy;
  }

  private getAddressUpdateSchedule(): string[] {
    const schedules = {
      development: ['2025-01-01', '2025-07-01'], // Test dates
      staging: ['2025-01-15', '2025-07-15'],     // Standard dates
      production: ['2025-01-15', '2025-07-15']   // Production dates
    };

    return schedules[this.environment as keyof typeof schedules] || schedules.production;
  }

  private getDogPlacesUpdateSchedule(): string {
    const schedules = {
      development: '0 2 * * *',    // Tous les jours à 2h (dev/test)
      staging: '0 2 * * 0',        // Dimanche à 2h
      production: '0 2 * * 0'      // Dimanche à 2h
    };

    return schedules[this.environment as keyof typeof schedules] || schedules.production;
  }
}

// Calendar optimisé
export const UPDATE_CALENDAR = {
  addresses: {
    schedule: (env: string) => {
      const manager = new UpdateStrategyManager();
      return manager.getUpdateStrategy().addresses.schedule;
    },
    estimatedDuration: '2h',
    maxRetries: 3,
    preferredHours: [2, 3, 4], // Heures creuses
    avoidDates: [
      '12-24', '12-25', '12-31', '01-01', // Fêtes
      '07-21', '08-15' // Vacances belges
    ]
  },
  dogPlaces: {
    schedule: (env: string) => {
      const schedules = {
        development: 'every-day-02:00',
        staging: 'every-sunday-02:00',
        production: 'every-sunday-02:00'
      };
      return schedules[env as keyof typeof schedules] || schedules.production;
    },
    estimatedDuration: '30min',
    maxRetries: 5,
    throttling: {
      googleMaps: process.env.NODE_ENV === 'production' ? '100req/hour' : '200req/hour',
      foursquare: '200req/hour',
      osm: '3600req/hour'
    }
  }
};

// Factory pour créer la configuration complète
export class ConfigurationFactory {
  static createConfiguration(): {
    scheduling: SchedulingConfig;
    addressSources: DataSource[];
    dogPlacesSources: DataSource[];
    updateStrategy: UpdateStrategy;
  } {
    const schedulingManager = new SchedulingConfigManager();
    const sourceManager = new DataSourceConfigManager();
    const strategyManager = new UpdateStrategyManager();

    return {
      scheduling: schedulingManager.getConfig(),
      addressSources: sourceManager.getAddressDataSources(),
      dogPlacesSources: sourceManager.getDogPlacesDataSources(),
      updateStrategy: strategyManager.getUpdateStrategy()
    };
  }
}