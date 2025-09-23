import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';
import {
    UrbisAddress,
    UrbisAddressSchema,
    API_CONFIG,
    FIRESTORE_CONFIG,
    SEARCH_CONFIG,
    CACHE_CONFIG,
    validateCoordinates
} from '../../config/addressConfig.js';

export interface AddressSearchResult {
    id: string;
    street: string;
    number: string;
    commune: string;
    postalCode: string;
    fullAddress: string;
    coordinates: {
        latitude: number;
        longitude: number;
    };
    source: 'LOCAL' | 'NOMINATIM';
    confidence: number;
}

export interface AddressSearchOptions {
    maxResults?: number;
    fuzzySearch?: boolean;
    commune?: string;
    postalCode?: string;
}

/**
 * 🚀 SERVICE DE GÉOCODAGE OPTIMISÉ POUR BRUXELLES
 *
 * Performance: <100ms par recherche
 * Sources: 1. Firestore local → 2. Nominatim fallback
 * Cache: Mémoire + TTL pour requêtes fréquentes
 */
export class BrusselsGeocodingService {
    private firestore = getFirestore();
    private searchCache = new Map<string, { result: AddressSearchResult[]; timestamp: number }>();
    private suggestionCache = new Map<string, { result: string[]; timestamp: number }>();

    /**
     * 🔍 RECHERCHE D'ADRESSE PRINCIPALE
     * Ordre: Cache → Firestore → Nominatim
     */
    async searchAddress(
        query: string,
        options: AddressSearchOptions = {}
    ): Promise<AddressSearchResult[]> {
        const startTime = Date.now();
        const normalizedQuery = this.normalizeQuery(query);

        // 1. Vérification cache mémoire
        const cached = this.getCachedSearch(normalizedQuery);
        if (cached) {
            console.log(`🟢 Cache hit: ${query} (${Date.now() - startTime}ms)`);
            return cached;
        }

        try {
            // 2. Recherche locale Firestore (priorité)
            let results = await this.searchInFirestore(normalizedQuery, options);

            // 3. Fallback Nominatim si pas de résultats
            if (results.length === 0) {
                console.log(`🌐 Fallback Nominatim pour: ${query}`);
                results = await this.searchInNominatim(normalizedQuery, options);
            }

            // 4. Cache du résultat
            this.setCachedSearch(normalizedQuery, results);

            const duration = Date.now() - startTime;
            console.log(`🔍 Recherche "${query}": ${results.length} résultats (${duration}ms)`);

            return results;

        } catch (error) {
            console.error(`❌ Erreur recherche "${query}":`, error);
            return [];
        }
    }

    /**
     * 🏠 RECHERCHE DANS FIRESTORE LOCAL
     * Index: searchTerms pour performance
     */
    private async searchInFirestore(
        query: string,
        options: AddressSearchOptions
    ): Promise<AddressSearchResult[]> {
        const collection = this.firestore.collection(FIRESTORE_CONFIG.collection);
        const searchTerms = this.generateSearchTerms(query);

        let dbQuery = collection
            .where('isActive', '==', true)
            .limit(options.maxResults || SEARCH_CONFIG.maxResults);

        // Filtres optionnels
        if (options.commune) {
            dbQuery = dbQuery.where('commune', '==', options.commune);
        }
        if (options.postalCode) {
            dbQuery = dbQuery.where('postalCode', '==', options.postalCode);
        }

        try {
            const snapshot = await dbQuery.get();
            let addresses: AddressSearchResult[] = [];

            snapshot.forEach(doc => {
                const data = doc.data() as UrbisAddress & {
                    fullAddress: string;
                    searchTerms: string[];
                    source: string;
                };

                // Score de correspondance basé sur searchTerms
                const confidence = this.calculateConfidence(query, data.searchTerms || []);

                if (confidence > 0.3) { // Seuil minimum
                    addresses.push({
                        id: doc.id,
                        street: data.street,
                        number: data.number,
                        commune: data.commune,
                        postalCode: data.postalCode,
                        fullAddress: data.fullAddress || `${data.number} ${data.street}, ${data.postalCode} ${data.commune}`,
                        coordinates: data.coordinates,
                        source: 'LOCAL',
                        confidence
                    });
                }
            });

            // Tri par pertinence
            addresses.sort((a, b) => b.confidence - a.confidence);

            // Recherche floue si peu de résultats
            if (addresses.length < 3 && options.fuzzySearch !== false) {
                const fuzzyResults = await this.fuzzySearchInFirestore(query, options);
                addresses = [...addresses, ...fuzzyResults].slice(0, options.maxResults || SEARCH_CONFIG.maxResults);
            }

            return addresses;

        } catch (error) {
            console.error('❌ Erreur recherche Firestore:', error);
            return [];
        }
    }

    /**
     * 🔤 RECHERCHE FLOUE AVEC DISTANCE LEVENSHTEIN
     */
    private async fuzzySearchInFirestore(
        query: string,
        options: AddressSearchOptions
    ): Promise<AddressSearchResult[]> {
        const collection = this.firestore.collection(FIRESTORE_CONFIG.collection);

        // Recherche plus large sans filtres strictes
        const snapshot = await collection
            .where('isActive', '==', true)
            .limit(100) // Plus de données pour la recherche floue
            .get();

        const results: AddressSearchResult[] = [];

        snapshot.forEach(doc => {
            const data = doc.data() as UrbisAddress & {
                fullAddress: string;
                searchTerms: string[];
            };

            // Calcul distance Levenshtein
            const fuzzyScore = this.calculateFuzzyScore(query, data.fullAddress);

            if (fuzzyScore > SEARCH_CONFIG.fuzzySearchThreshold) {
                results.push({
                    id: doc.id,
                    street: data.street,
                    number: data.number,
                    commune: data.commune,
                    postalCode: data.postalCode,
                    fullAddress: data.fullAddress,
                    coordinates: data.coordinates,
                    source: 'LOCAL',
                    confidence: fuzzyScore
                });
            }
        });

        return results.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * 🌐 FALLBACK NOMINATIM
     */
    private async searchInNominatim(
        query: string,
        options: AddressSearchOptions
    ): Promise<AddressSearchResult[]> {
        try {
            const response = await axios.get(`${API_CONFIG.NOMINATIM.baseUrl}/search`, {
                params: {
                    q: `${query}, Brussels, Belgium`,
                    format: 'json',
                    addressdetails: 1,
                    limit: options.maxResults || 5,
                    countrycodes: 'be',
                    bounded: 1,
                    viewbox: '4.2177,50.9228,4.4821,50.7641' // Brussels bounds
                },
                timeout: API_CONFIG.NOMINATIM.timeout
            });

            return response.data
                .filter((item: any) => {
                    const lat = parseFloat(item.lat);
                    const lng = parseFloat(item.lon);
                    return validateCoordinates(lat, lng);
                })
                .map((item: any, index: number) => ({
                    id: `nominatim_${item.place_id}`,
                    street: item.address?.road || 'Rue inconnue',
                    number: item.address?.house_number || '',
                    commune: item.address?.city || item.address?.town || 'Bruxelles',
                    postalCode: item.address?.postcode || '1000',
                    fullAddress: item.display_name,
                    coordinates: {
                        latitude: parseFloat(item.lat),
                        longitude: parseFloat(item.lon)
                    },
                    source: 'NOMINATIM' as const,
                    confidence: Math.max(0.5 - (index * 0.1), 0.1) // Score décroissant
                }));

        } catch (error) {
            console.error('❌ Erreur Nominatim:', error);
            return [];
        }
    }

    /**
     * 💡 AUTOCOMPLÉTION RAPIDE
     */
    async getAddressSuggestions(partial: string): Promise<string[]> {
        if (partial.length < SEARCH_CONFIG.minQueryLength) {
            return [];
        }

        const normalizedPartial = this.normalizeQuery(partial);

        // Cache des suggestions
        const cached = this.getCachedSuggestions(normalizedPartial);
        if (cached) {
            return cached;
        }

        try {
            const collection = this.firestore.collection(FIRESTORE_CONFIG.collection);

            // Recherche par préfixe dans les searchTerms
            const snapshot = await collection
                .where('isActive', '==', true)
                .limit(20)
                .get();

            const suggestions = new Set<string>();

            snapshot.forEach(doc => {
                const data = doc.data() as UrbisAddress & { fullAddress: string; searchTerms: string[] };

                // Vérifier si partial correspond au début de searchTerms
                data.searchTerms?.forEach(term => {
                    if (term.toLowerCase().startsWith(normalizedPartial)) {
                        suggestions.add(data.fullAddress);
                    }
                });

                // Également vérifier l'adresse complète
                if (data.fullAddress?.toLowerCase().includes(normalizedPartial)) {
                    suggestions.add(data.fullAddress);
                }
            });

            const result = Array.from(suggestions).slice(0, 10);
            this.setCachedSuggestions(normalizedPartial, result);

            return result;

        } catch (error) {
            console.error('❌ Erreur suggestions:', error);
            return [];
        }
    }

    /**
     * 🧮 UTILITAIRES
     */
    private normalizeQuery(query: string): string {
        return query
            .toLowerCase()
            .trim()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ');
    }

    private generateSearchTerms(query: string): string[] {
        const normalized = this.normalizeQuery(query);
        const words = normalized.split(' ').filter(w => w.length > 1);

        return [
            normalized,
            ...words,
            ...words.map(w => w.substring(0, 3)) // Préfixes
        ];
    }

    private calculateConfidence(query: string, searchTerms: string[]): number {
        const queryWords = this.normalizeQuery(query).split(' ');
        let matches = 0;
        let totalWords = queryWords.length;

        queryWords.forEach(word => {
            const found = searchTerms.some(term =>
                term.includes(word) || word.includes(term)
            );
            if (found) matches++;
        });

        return totalWords > 0 ? matches / totalWords : 0;
    }

    private calculateFuzzyScore(query: string, target: string): number {
        const distance = this.levenshteinDistance(
            this.normalizeQuery(query),
            this.normalizeQuery(target)
        );
        const maxLength = Math.max(query.length, target.length);
        return maxLength > 0 ? 1 - (distance / maxLength) : 0;
    }

    private levenshteinDistance(str1: string, str2: string): number {
        const matrix = Array(str2.length + 1).fill(null).map(() =>
            Array(str1.length + 1).fill(null)
        );

        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1, // deletion
                    matrix[j - 1][i] + 1, // insertion
                    matrix[j - 1][i - 1] + substitutionCost // substitution
                );
            }
        }

        return matrix[str2.length][str1.length];
    }

    /**
     * 🗄️ GESTION DU CACHE MÉMOIRE
     */
    private getCachedSearch(query: string): AddressSearchResult[] | null {
        const cached = this.searchCache.get(query);
        if (cached && (Date.now() - cached.timestamp) < CACHE_CONFIG.searchCache.ttl) {
            return cached.result;
        }
        return null;
    }

    private setCachedSearch(query: string, result: AddressSearchResult[]): void {
        if (this.searchCache.size >= CACHE_CONFIG.searchCache.maxSize) {
            // Supprimer le plus ancien
            const oldestKey = this.searchCache.keys().next().value;
            this.searchCache.delete(oldestKey);
        }
        this.searchCache.set(query, { result, timestamp: Date.now() });
    }

    private getCachedSuggestions(query: string): string[] | null {
        const cached = this.suggestionCache.get(query);
        if (cached && (Date.now() - cached.timestamp) < CACHE_CONFIG.addressCache.ttl) {
            return cached.result;
        }
        return null;
    }

    private setCachedSuggestions(query: string, result: string[]): void {
        if (this.suggestionCache.size >= CACHE_CONFIG.addressCache.maxSize) {
            const oldestKey = this.suggestionCache.keys().next().value;
            this.suggestionCache.delete(oldestKey);
        }
        this.suggestionCache.set(query, { result, timestamp: Date.now() });
    }

    /**
     * 📊 MÉTRIQUES ET MONITORING
     */
    async getServiceMetrics(): Promise<{
        firestoreDocuments: number;
        cacheHitRate: number;
        averageResponseTime: number;
    }> {
        try {
            const collection = this.firestore.collection(FIRESTORE_CONFIG.collection);
            const snapshot = await collection.where('isActive', '==', true).count().get();

            return {
                firestoreDocuments: snapshot.data().count,
                cacheHitRate: 0, // TODO: Implémenter tracking des hits
                averageResponseTime: 0 // TODO: Implémenter tracking du temps
            };
        } catch (error) {
            console.error('❌ Erreur métriques:', error);
            return {
                firestoreDocuments: 0,
                cacheHitRate: 0,
                averageResponseTime: 0
            };
        }
    }

    /**
     * 🧹 NETTOYAGE DU CACHE
     */
    clearCache(): void {
        this.searchCache.clear();
        this.suggestionCache.clear();
        console.log('🧹 Cache nettoyé');
    }
}

// Instance singleton
export const geocodingService = new BrusselsGeocodingService();