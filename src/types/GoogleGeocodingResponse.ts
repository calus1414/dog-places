// src/types/GoogleGeocodingResponse.ts

export interface GoogleGeocodingResponse {
  results: GoogleGeocodingResult[];
  status: GoogleGeocodingStatus;
  error_message?: string;
  info_messages?: string[];
}

export interface GoogleGeocodingResult {
  address_components: GoogleAddressComponent[];
  formatted_address: string;
  geometry: GoogleGeometry;
  place_id: string;
  plus_code?: GooglePlusCode;
  types: string[];
  partial_match?: boolean;
}

export interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: GoogleAddressComponentType[];
}

export interface GoogleGeometry {
  bounds?: GoogleBounds;
  location: GoogleLatLng;
  location_type: GoogleLocationPrecision;
  viewport: GoogleBounds;
}

export interface GoogleLatLng {
  lat: number;
  lng: number;
}

export interface GoogleBounds {
  northeast: GoogleLatLng;
  southwest: GoogleLatLng;
}

export interface GooglePlusCode {
  compound_code?: string;
  global_code: string;
}

// Enum Types
export type GoogleGeocodingStatus =
  | 'OK'
  | 'ZERO_RESULTS'
  | 'OVER_DAILY_LIMIT'
  | 'OVER_QUERY_LIMIT'
  | 'REQUEST_DENIED'
  | 'INVALID_REQUEST'
  | 'UNKNOWN_ERROR';

export type GoogleLocationPrecision =
  | 'ROOFTOP'              // Most precise
  | 'RANGE_INTERPOLATED'   // Interpolated between two points
  | 'GEOMETRIC_CENTER'     // Geometric center of result
  | 'APPROXIMATE';         // Approximate

export type GoogleAddressComponentType =
  | 'street_number'
  | 'route'
  | 'intersection'
  | 'political'
  | 'country'
  | 'administrative_area_level_1'
  | 'administrative_area_level_2'
  | 'administrative_area_level_3'
  | 'administrative_area_level_4'
  | 'administrative_area_level_5'
  | 'colloquial_area'
  | 'locality'
  | 'sublocality'
  | 'sublocality_level_1'
  | 'sublocality_level_2'
  | 'sublocality_level_3'
  | 'sublocality_level_4'
  | 'sublocality_level_5'
  | 'neighborhood'
  | 'premise'
  | 'subpremise'
  | 'plus_code'
  | 'postal_code'
  | 'postal_code_prefix'
  | 'postal_code_suffix'
  | 'postal_town'
  | 'natural_feature'
  | 'airport'
  | 'park'
  | 'point_of_interest'
  | 'floor'
  | 'establishment'
  | 'landmark'
  | 'place_of_worship'
  | 'school'
  | 'university'
  | 'hospital'
  | 'pharmacy'
  | 'post_box'
  | 'room'
  | 'bus_station'
  | 'train_station'
  | 'transit_station'
  | 'transit_line'
  | 'route'
  | 'tourist_attraction'
  | 'spa'
  | 'restaurant'
  | 'lodging'
  | 'food'
  | 'general_contractor'
  | 'finance'
  | 'health'
  | 'insurance_agency'
  | 'lawyer'
  | 'local_government_office'
  | 'real_estate_agency'
  | 'travel_agency';

// Extended Response for our application
export interface ProcessedGeocodingResult {
  id: string;
  place_id: string;
  formatted_address: string;
  street_number?: string;
  street_name?: string;
  municipality?: string;
  postal_code?: string;
  location: {
    latitude: number;
    longitude: number;
  };
  geometry_type: GoogleLocationPrecision;
  address_components: GoogleAddressComponent[];
  source: 'Google_Geocoding';
  original_query: string;
  geohash: string;
  lastUpdated: Date;
  isActive: boolean;
  confidence: number;
  metadata: {
    viewport?: GoogleBounds;
    bounds?: GoogleBounds;
    types: string[];
    partial_match: boolean;
  };
}

// Geocoding Request Parameters
export interface GeocodingRequestParams {
  address?: string;
  components?: string;
  bounds?: string;
  language?: string;
  region?: string;
  key: string;
}

// Brussels-specific types
export interface BrusselsAddress extends ProcessedGeocodingResult {
  municipality: BrusselsMunicipality;
  postal_code: BrusselsPostalCode;
  in_brussels_bounds: boolean;
}

export type BrusselsMunicipality =
  | 'Anderlecht'
  | 'Auderghem'
  | 'Berchem-Sainte-Agathe'
  | 'Bruxelles'
  | 'Etterbeek'
  | 'Evere'
  | 'Forest'
  | 'Ganshoren'
  | 'Ixelles'
  | 'Jette'
  | 'Koekelberg'
  | 'Molenbeek-Saint-Jean'
  | 'Saint-Gilles'
  | 'Saint-Josse-ten-Noode'
  | 'Schaerbeek'
  | 'Uccle'
  | 'Watermael-Boitsfort'
  | 'Woluwe-Saint-Lambert'
  | 'Woluwe-Saint-Pierre';

export type BrusselsPostalCode =
  | '1000' | '1020' | '1030' | '1040' | '1050'
  | '1060' | '1070' | '1080' | '1081' | '1082'
  | '1083' | '1090' | '1120' | '1130' | '1140'
  | '1150' | '1160' | '1170' | '1180' | '1190'
  | '1200' | '1210';

// Error handling
export class GeocodingError extends Error {
  constructor(
    message: string,
    public status: GoogleGeocodingStatus,
    public originalRequest?: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'GeocodingError';
  }
}

export class QuotaExceededError extends GeocodingError {
  constructor(public resetTime?: Date) {
    super(
      'Geocoding API quota exceeded',
      'OVER_DAILY_LIMIT',
      undefined,
      true
    );
  }
}

export class RateLimitError extends GeocodingError {
  constructor(public retryAfter?: number) {
    super(
      'Geocoding API rate limit exceeded',
      'OVER_QUERY_LIMIT',
      undefined,
      true
    );
  }
}

// Statistics and Metrics
export interface GeocodingMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  quotaUsed: number;
  quotaRemaining: number;
  averageResponseTime: number;
  requestsPerSecond: number;
  addressesFound: number;
  duplicatesFiltered: number;
  successRate: number;
  startTime: Date;
  endTime?: Date;
  estimatedCompletion?: Date;
}

export interface GeocodingProgress {
  currentQuery: number;
  totalQueries: number;
  percentage: number;
  municipality: string;
  street: string;
  houseNumber: number;
  eta: string;
  batchesSaved: number;
  lastBatchSize: number;
}

// Configuration
export interface GeocodingConfig {
  apiKey: string;
  rateLimit: number;
  dailyQuota: number;
  batchSize: number;
  retryAttempts: number;
  retryDelay: number;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  geohashPrecision: number;
}

// Validation utilities
export function isValidGeocodingResponse(response: any): response is GoogleGeocodingResponse {
  return response &&
         typeof response.status === 'string' &&
         Array.isArray(response.results);
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return typeof lat === 'number' &&
         typeof lng === 'number' &&
         lat >= -90 && lat <= 90 &&
         lng >= -180 && lng <= 180;
}

export function isInBrussels(lat: number, lng: number, bounds: GeocodingConfig['bounds']): boolean {
  return lat >= bounds.south &&
         lat <= bounds.north &&
         lng >= bounds.west &&
         lng <= bounds.east;
}