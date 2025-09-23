// src/types/DataAcquisition.ts

export interface DataVersion {
  id: string;
  timestamp: Date;
  hash: string;
  source: DataSourceProvider;
  type: DataType;
  recordCount: number;
  metadata: {
    apiVersion?: string;
    processingTime: number;
    errors: string[];
    warnings: string[];
  };
}

export interface DataUpdatePipeline {
  id: string;
  type: DataType;
  frequency: UpdateFrequency;
  lastUpdate: Date | null;
  nextUpdate: Date;
  sources: DataSource[];
  status: PipelineStatus;
  config: PipelineConfig;
  metrics: PipelineMetrics;
}

export interface DataSource {
  provider: DataSourceProvider;
  priority: number;
  isActive: boolean;
  quota: QuotaConfig;
  reliability: ReliabilityMetrics;
  config: SourceConfig;
}

export interface QuotaConfig {
  daily: number;
  monthly: number;
  current: number;
  resetTime: Date;
  warningThreshold: number; // % du quota
}

export interface ReliabilityMetrics {
  score: number; // 0-100
  uptime: number; // %
  avgResponseTime: number; // ms
  errorRate: number; // %
  lastFailure?: Date;
  consecutiveFailures: number;
}

export interface PipelineConfig {
  maxRetries: number;
  timeoutMs: number;
  batchSize: number;
  throttling: ThrottlingConfig;
  validation: ValidationConfig;
  fallback: FallbackConfig;
}

export interface ThrottlingConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  burstLimit: number;
}

export interface ValidationConfig {
  requiredFields: string[];
  geoValidation: boolean;
  duplicateDetection: boolean;
  qualityThreshold: number;
}

export interface FallbackConfig {
  enableFallback: boolean;
  fallbackSources: DataSourceProvider[];
  fallbackDelay: number; // ms
}

export interface PipelineMetrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  avgDuration: number; // ms
  lastRunDuration?: number;
  recordsProcessed: number;
  recordsAdded: number;
  recordsUpdated: number;
  recordsSkipped: number;
}

// Data Types
export type DataType = 'addresses' | 'dogPlaces';

export type UpdateFrequency =
  | 'biannual'
  | 'quarterly'
  | 'monthly'
  | 'weekly'
  | 'daily'
  | 'hourly';

export type DataSourceProvider =
  | 'URBIS'
  | 'OSM'
  | 'Google'
  | 'Foursquare'
  | 'BeST_Address'
  | 'Manual';

export type PipelineStatus =
  | 'idle'
  | 'scheduled'
  | 'running'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

export type SourceConfig = {
  apiKey?: string;
  baseUrl?: string;
  version?: string;
  customHeaders?: Record<string, string>;
  rateLimit?: number;
  timeout?: number;
};

// Strategy Interfaces
export interface UpdateStrategy {
  addresses: {
    frequency: 'biannual';
    priority: 'low';
    sources: DataSourceProvider[];
    schedule: string[]; // Dates spécifiques
  };
  dogPlaces: {
    frequency: 'weekly';
    priority: 'high';
    sources: DataSourceProvider[];
    schedule: string; // Cron expression
  };
}

// Data Models
export interface AddressData {
  id: string;
  placeId?: string;
  name?: string;
  formattedAddress: string;
  streetNumber?: string;
  streetName?: string;
  municipality: string;
  postalCode: string;
  location: GeoLocation;
  addressComponents: AddressComponent[];
  source: DataSourceProvider;
  lastUpdated: Date;
  isActive: boolean;
  metadata: AddressMetadata;
}

export interface DogPlaceData {
  id: string;
  placeId?: string;
  name: string;
  type: DogPlaceType;
  category: string;
  description?: string;
  formattedAddress: string;
  location: GeoLocation;
  contact: ContactInfo;
  hours: OpeningHours[];
  amenities: string[];
  rating?: number;
  ratingsCount?: number;
  photos: Photo[];
  source: DataSourceProvider;
  lastUpdated: Date;
  isActive: boolean;
  metadata: DogPlaceMetadata;
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface AddressComponent {
  longName: string;
  shortName: string;
  types: string[];
}

export interface ContactInfo {
  phone?: string;
  website?: string;
  email?: string;
}

export interface OpeningHours {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  openTime: string; // HH:MM
  closeTime: string; // HH:MM
  isClosed: boolean;
}

export interface Photo {
  reference: string;
  width: number;
  height: number;
  url?: string;
}

export type DogPlaceType =
  | 'park'
  | 'veterinary_care'
  | 'pet_store'
  | 'restaurant'
  | 'grooming'
  | 'training'
  | 'daycare';

export interface AddressMetadata {
  confidence: number;
  isVerified: boolean;
  lastVerified?: Date;
  buildingType?: string;
  accessibility?: string[];
}

export interface DogPlaceMetadata {
  confidence: number;
  isVerified: boolean;
  lastVerified?: Date;
  dogFriendlyScore?: number;
  popularTimes?: PopularTime[];
  priceLevel?: number;
  reviews?: Review[];
}

export interface PopularTime {
  dayOfWeek: number;
  hourOfDay: number;
  popularity: number; // 0-100
}

export interface Review {
  rating: number;
  text: string;
  author: string;
  timestamp: Date;
  source: DataSourceProvider;
}

// Event Types
export interface DataUpdateEvent {
  id: string;
  pipelineId: string;
  type: DataUpdateEventType;
  timestamp: Date;
  data: any;
  metadata: Record<string, any>;
}

export type DataUpdateEventType =
  | 'pipeline_started'
  | 'pipeline_completed'
  | 'pipeline_failed'
  | 'source_connected'
  | 'source_failed'
  | 'data_validated'
  | 'data_persisted'
  | 'quota_warning'
  | 'quota_exceeded';

// Configuration Types
export interface SchedulingConfig {
  environment: 'development' | 'staging' | 'production';
  enabledPipelines: DataType[];
  globalTimeout: number;
  maxConcurrentPipelines: number;
  monitoring: MonitoringConfig;
  notifications: NotificationConfig;
  featureFlags: FeatureFlags;
}

export interface MonitoringConfig {
  enableMetrics: boolean;
  enableLogs: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  metricsRetention: number; // days
}

export interface NotificationConfig {
  enableSlack: boolean;
  enableEmail: boolean;
  slackWebhook?: string;
  emailRecipients: string[];
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  notifyOnQuotaWarning: boolean;
}

export interface FeatureFlags {
  enableURBIS: boolean;
  enableOSM: boolean;
  enableGoogle: boolean;
  enableFoursquare: boolean;
  enableFallback: boolean;
  enableValidation: boolean;
  enableDeduplication: boolean;
}

// Error Types
export class DataAcquisitionError extends Error {
  constructor(
    message: string,
    public code: string,
    public source: DataSourceProvider,
    public retryable: boolean = false,
    public metadata?: Record<string, any>
  ) {
    super(message);
    this.name = 'DataAcquisitionError';
  }
}

export class QuotaExceededError extends DataAcquisitionError {
  constructor(source: DataSourceProvider, resetTime: Date) {
    super(
      `Quota exceeded for ${source}. Resets at ${resetTime.toISOString()}`,
      'QUOTA_EXCEEDED',
      source,
      true,
      { resetTime }
    );
  }
}

export class ValidationError extends DataAcquisitionError {
  constructor(message: string, source: DataSourceProvider, invalidData: any) {
    super(
      message,
      'VALIDATION_ERROR',
      source,
      false,
      { invalidData }
    );
  }
}