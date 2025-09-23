import { z } from 'zod';

// Brussels bounding box coordinates (precise boundaries of Brussels-Capital Region)
export const BRUSSELS_BOUNDS = {
  minLat: 50.7641,
  maxLat: 50.9228,
  minLng: 4.2177,
  maxLng: 4.4821,
};

// API Configuration
export const API_CONFIG = {
  URBIS: {
    baseUrl: 'https://geoservices-urbis.irisnet.be/geoserver/ows',
    timeout: 60000,
    retryAttempts: 3,
  },
  OVERPASS: {
    baseUrl: 'https://overpass-api.de/api/interpreter',
    timeout: 120000,
    retryAttempts: 2,
  },
  NOMINATIM: {
    baseUrl: 'https://nominatim.openstreetmap.org',
    timeout: 30000,
    retryAttempts: 2,
  },
};

// Brussels communes mapping (French/Dutch name → postal code)
export const COMMUNE_MAPPING: Record<string, {
  postalCode: string;
  frenchName: string;
  dutchName: string;
}> = {
  'Bruxelles': { postalCode: '1000', frenchName: 'Bruxelles', dutchName: 'Brussel' },
  'Brussel': { postalCode: '1000', frenchName: 'Bruxelles', dutchName: 'Brussel' },
  'Laeken': { postalCode: '1020', frenchName: 'Bruxelles', dutchName: 'Brussel' },
  'Neder-Over-Heembeek': { postalCode: '1120', frenchName: 'Bruxelles', dutchName: 'Brussel' },
  'Haren': { postalCode: '1130', frenchName: 'Bruxelles', dutchName: 'Brussel' },
  'Schaerbeek': { postalCode: '1030', frenchName: 'Schaerbeek', dutchName: 'Schaarbeek' },
  'Schaarbeek': { postalCode: '1030', frenchName: 'Schaerbeek', dutchName: 'Schaarbeek' },
  'Etterbeek': { postalCode: '1040', frenchName: 'Etterbeek', dutchName: 'Etterbeek' },
  'Ixelles': { postalCode: '1050', frenchName: 'Ixelles', dutchName: 'Elsene' },
  'Elsene': { postalCode: '1050', frenchName: 'Ixelles', dutchName: 'Elsene' },
  'Saint-Gilles': { postalCode: '1060', frenchName: 'Saint-Gilles', dutchName: 'Sint-Gillis' },
  'Sint-Gillis': { postalCode: '1060', frenchName: 'Saint-Gilles', dutchName: 'Sint-Gillis' },
  'Anderlecht': { postalCode: '1070', frenchName: 'Anderlecht', dutchName: 'Anderlecht' },
  'Molenbeek-Saint-Jean': { postalCode: '1080', frenchName: 'Molenbeek-Saint-Jean', dutchName: 'Sint-Jans-Molenbeek' },
  'Sint-Jans-Molenbeek': { postalCode: '1080', frenchName: 'Molenbeek-Saint-Jean', dutchName: 'Sint-Jans-Molenbeek' },
  'Jette': { postalCode: '1090', frenchName: 'Jette', dutchName: 'Jette' },
  'Evere': { postalCode: '1140', frenchName: 'Evere', dutchName: 'Evere' },
  'Woluwe-Saint-Pierre': { postalCode: '1150', frenchName: 'Woluwe-Saint-Pierre', dutchName: 'Sint-Pieters-Woluwe' },
  'Sint-Pieters-Woluwe': { postalCode: '1150', frenchName: 'Woluwe-Saint-Pierre', dutchName: 'Sint-Pieters-Woluwe' },
  'Auderghem': { postalCode: '1160', frenchName: 'Auderghem', dutchName: 'Oudergem' },
  'Oudergem': { postalCode: '1160', frenchName: 'Auderghem', dutchName: 'Oudergem' },
  'Watermael-Boitsfort': { postalCode: '1170', frenchName: 'Watermael-Boitsfort', dutchName: 'Watermaal-Bosvoorde' },
  'Watermaal-Bosvoorde': { postalCode: '1170', frenchName: 'Watermael-Boitsfort', dutchName: 'Watermaal-Bosvoorde' },
  'Uccle': { postalCode: '1180', frenchName: 'Uccle', dutchName: 'Ukkel' },
  'Ukkel': { postalCode: '1180', frenchName: 'Uccle', dutchName: 'Ukkel' },
  'Forest': { postalCode: '1190', frenchName: 'Forest', dutchName: 'Vorst' },
  'Vorst': { postalCode: '1190', frenchName: 'Forest', dutchName: 'Vorst' },
  'Woluwe-Saint-Lambert': { postalCode: '1200', frenchName: 'Woluwe-Saint-Lambert', dutchName: 'Sint-Lambrechts-Woluwe' },
  'Sint-Lambrechts-Woluwe': { postalCode: '1200', frenchName: 'Woluwe-Saint-Lambert', dutchName: 'Sint-Lambrechts-Woluwe' },
  'Saint-Josse-ten-Noode': { postalCode: '1210', frenchName: 'Saint-Josse-ten-Noode', dutchName: 'Sint-Joost-ten-Node' },
  'Sint-Joost-ten-Node': { postalCode: '1210', frenchName: 'Saint-Josse-ten-Noode', dutchName: 'Sint-Joost-ten-Node' },
};

// Postal code to commune mapping
export const POSTAL_CODE_MAPPING: Record<string, string> = {
  '1000': 'Bruxelles',
  '1020': 'Bruxelles',
  '1030': 'Schaerbeek',
  '1040': 'Etterbeek',
  '1050': 'Ixelles',
  '1060': 'Saint-Gilles',
  '1070': 'Anderlecht',
  '1080': 'Molenbeek-Saint-Jean',
  '1090': 'Jette',
  '1120': 'Bruxelles',
  '1130': 'Bruxelles',
  '1140': 'Evere',
  '1150': 'Woluwe-Saint-Pierre',
  '1160': 'Auderghem',
  '1170': 'Watermael-Boitsfort',
  '1180': 'Uccle',
  '1190': 'Forest',
  '1200': 'Woluwe-Saint-Lambert',
  '1210': 'Saint-Josse-ten-Noode',
};

// Zod validation schemas
export const CoordinatesSchema = z.object({
  latitude: z.number().min(BRUSSELS_BOUNDS.minLat).max(BRUSSELS_BOUNDS.maxLat),
  longitude: z.number().min(BRUSSELS_BOUNDS.minLng).max(BRUSSELS_BOUNDS.maxLng),
});

export const UrbisAddressSchema = z.object({
  street: z.string().min(1),
  number: z.string().min(1),
  commune: z.string().min(1),
  postalCode: z.string().regex(/^10[0-9]{2}$/), // Brussels postal codes: 10xx
  coordinates: CoordinatesSchema,
  fullAddress: z.string().optional(),
  searchTerms: z.array(z.string()).optional(),
  source: z.enum(['URBIS', 'OSM', 'FALLBACK']).optional(),
  geometry: z.any().optional(),
  createdAt: z.date().optional(),
  isActive: z.boolean().optional(),
});

export const OSMResponseSchema = z.object({
  elements: z.array(z.object({
    type: z.string(),
    tags: z.record(z.string()),
    lat: z.number().optional(),
    lon: z.number().optional(),
    geometry: z.array(z.object({
      lat: z.number(),
      lon: z.number(),
    })).optional(),
  })),
});

export const UrbisResponseSchema = z.object({
  features: z.array(z.object({
    properties: z.record(z.any()),
    geometry: z.object({
      coordinates: z.tuple([z.number(), z.number()]),
    }),
  })),
});

// Types
export type UrbisAddress = z.infer<typeof UrbisAddressSchema>;
export type Coordinates = z.infer<typeof CoordinatesSchema>;
export type OSMResponse = z.infer<typeof OSMResponseSchema>;
export type UrbisResponse = z.infer<typeof UrbisResponseSchema>;

// Validation helpers
export function validateCoordinates(lat: number, lng: number): boolean {
  return lat >= BRUSSELS_BOUNDS.minLat &&
         lat <= BRUSSELS_BOUNDS.maxLat &&
         lng >= BRUSSELS_BOUNDS.minLng &&
         lng <= BRUSSELS_BOUNDS.maxLng;
}

export function normalizeCommune(commune: string): string {
  const mapping = COMMUNE_MAPPING[commune];
  return mapping ? mapping.frenchName : commune;
}

export function inferPostalCode(commune: string): string {
  const mapping = COMMUNE_MAPPING[commune];
  return mapping ? mapping.postalCode : '1000';
}

export function inferCommune(postalCode: string): string {
  return POSTAL_CODE_MAPPING[postalCode] || 'Bruxelles';
}

// Cache configuration
export const CACHE_CONFIG = {
  searchCache: {
    maxSize: 1000,
    ttl: 3600000, // 1 hour in milliseconds
  },
  addressCache: {
    maxSize: 5000,
    ttl: 86400000, // 24 hours in milliseconds
  },
};

// Firestore configuration
export const FIRESTORE_CONFIG = {
  collection: 'brussels_addresses',
  batchSize: 500,
  indexFields: ['searchTerms', 'commune', 'postalCode', 'isActive'],
};

// Search configuration
export const SEARCH_CONFIG = {
  maxResults: 50,
  fuzzySearchThreshold: 0.8, // Levenshtein distance threshold
  debounceTime: 300, // milliseconds
  minQueryLength: 2,
};