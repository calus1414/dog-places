const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

/**
 * 🐕 RECHERCHE AMÉLIORÉE - LIEUX POUR CHIENS BRUXELLES
 *
 * Script avancé pour récupérer tous les lieux liés aux chiens via Google Places API
 * - Parcs canins (dédiés aux chiens)
 * - Parcs classiques (où les chiens sont acceptés)
 * - Vétérinaires (tous types)
 * - Restaurants/cafés dog-friendly
 */

class EnhancedDogPlacesSearcher {
    constructor() {
        this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
        this.dataDir = path.join(__dirname, '../../data');
        this.outputFile = path.join(this.dataDir, 'enhanced_dog_places.json');

        // Centre de Bruxelles
        this.center = { lat: 50.8503, lng: 4.3517 };

        // Configuration de recherche par type
        this.searchConfigs = {
            'all_dog_places': {
                name: 'Tous les lieux pour chiens',
                searches: [
                    'dog_parks_dedicated',
                    'parks_general',
                    'veterinary_comprehensive',
                    'restaurants_dog_friendly'
                ]
            },
            'dog_parks_only': {
                name: 'Uniquement parcs canins',
                searches: ['dog_parks_dedicated']
            },
            'parks_all': {
                name: 'Tous les parcs (canins + normaux)',
                searches: ['dog_parks_dedicated', 'parks_general']
            },
            'veterinary_only': {
                name: 'Uniquement vétérinaires',
                searches: ['veterinary_comprehensive']
            },
            'restaurants_only': {
                name: 'Uniquement restaurants dog-friendly',
                searches: ['restaurants_dog_friendly']
            }
        };

        // Définitions de recherche détaillées
        this.searchDefinitions = {
            // Parcs canins dédiés
            dog_parks_dedicated: {
                queries: [
                    'parc canin Bruxelles',
                    'parc à chiens Bruxelles',
                    'dog park Brussels',
                    'espace chien Bruxelles',
                    'aire de détente canine Bruxelles',
                    'zone sans laisse chien Bruxelles'
                ],
                type: 'park',
                placeType: 'dog_park'
            },

            // Parcs généraux (où chiens acceptés)
            parks_general: {
                queries: [
                    // Recherches générales par type
                    'park Brussels',
                    'parc Bruxelles',
                    'parc public Bruxelles',
                    'parc urbain Bruxelles',
                    'jardin public Bruxelles',
                    'jardin Bruxelles',
                    'espace vert Bruxelles',
                    'square Bruxelles',
                    'place publique Bruxelles',

                    // Recherches par commune
                    'parc Ixelles',
                    'parc Uccle',
                    'parc Schaerbeek',
                    'parc Etterbeek',
                    'parc Saint-Gilles',
                    'parc Forest',
                    'parc Anderlecht',
                    'parc Molenbeek',
                    'parc Jette',
                    'parc Ganshoren',
                    'parc Berchem-Sainte-Agathe',
                    'parc Koekelberg',
                    'parc Laeken',
                    'parc Woluwe-Saint-Lambert',
                    'parc Woluwe-Saint-Pierre',
                    'parc Auderghem',
                    'parc Watermael-Boitsfort',
                    'parc Evere',
                    'parc Bruxelles-ville',

                    // Parcs connus spécifiques
                    'Parc du Cinquantenaire',
                    'Parc de Bruxelles',
                    'Parc Josaphat',
                    'Parc Léopold',
                    'Parc de Wolvendael',
                    'Parc de Laeken',
                    'Parc de Forest',
                    'Parc Duden',
                    'Parc Malou',
                    'Parc de Woluwe',
                    'Bois de la Cambre',
                    'Forêt de Soignes Bruxelles',
                    'Parc Parmentier'
                ],
                type: 'park',
                placeType: 'general_park'
            },

            // Vétérinaires (recherche exhaustive)
            veterinary_comprehensive: {
                queries: [
                    'vétérinaire Bruxelles',
                    'clinique vétérinaire Bruxelles',
                    'cabinet vétérinaire Bruxelles',
                    'veterinary clinic Brussels',
                    'animal hospital Brussels',
                    'soins animaux Bruxelles'
                ],
                type: 'veterinary_care',
                placeType: 'veterinary'
            },

            // Restaurants et cafés dog-friendly
            restaurants_dog_friendly: {
                queries: [
                    'restaurant chien accepté Bruxelles',
                    'café avec chien Bruxelles',
                    'dog friendly restaurant Brussels',
                    'pet friendly café Brussels',
                    'terrasse chien Bruxelles',
                    'bar avec chien Bruxelles'
                ],
                type: 'restaurant',
                placeType: 'dog_friendly_restaurant'
            }
        };
    }

    async searchEnhancedDogPlaces(searchType = 'all_dog_places', radiusKm = 20, dryRun = false) {
        console.log('🐕 RECHERCHE AMÉLIORÉE - LIEUX POUR CHIENS');
        console.log('==========================================');
        console.log(`Type: ${this.searchConfigs[searchType]?.name || searchType}`);
        console.log(`Rayon: ${radiusKm}km`);
        console.log(`Mode test: ${dryRun}`);
        console.log('');

        // Vérifications
        await this.checkApiKey();
        await this.ensureDataDirectory();

        const config = this.searchConfigs[searchType];
        if (!config) {
            throw new Error(`Type de recherche invalide: ${searchType}`);
        }

        let allPlaces = [];
        const searchStats = {};

        // Exécuter chaque type de recherche
        for (const searchKey of config.searches) {
            const definition = this.searchDefinitions[searchKey];
            console.log(`\n🔍 Recherche: ${searchKey}`);
            console.log(`   Queries: ${definition.queries.length}`);

            const places = await this.performSearches(definition, radiusKm * 1000);

            searchStats[searchKey] = {
                queries: definition.queries.length,
                places: places.length
            };

            allPlaces = allPlaces.concat(places);
            console.log(`   ✅ ${places.length} lieux trouvés`);
        }

        // Déduplication
        const uniquePlaces = this.deduplicatePlaces(allPlaces);
        console.log(`\n📊 RÉSULTATS:`);
        console.log(`   Total brut: ${allPlaces.length}`);
        console.log(`   Après déduplication: ${uniquePlaces.length}`);

        // Statistiques détaillées
        console.log(`\n📈 DÉTAIL PAR TYPE:`);
        Object.entries(searchStats).forEach(([key, stats]) => {
            console.log(`   ${key}: ${stats.places} lieux (${stats.queries} requêtes)`);
        });

        // Sauvegarde
        if (!dryRun) {
            await this.savePlaces(uniquePlaces);
            console.log(`\n💾 Sauvegardé: ${this.outputFile}`);
        } else {
            console.log(`\n🧪 Mode test - pas de sauvegarde`);
        }

        return uniquePlaces;
    }

    async performSearches(definition, radiusMeters) {
        const allPlaces = [];

        for (const query of definition.queries) {
            try {
                console.log(`     🔎 "${query}"`);
                const places = await this.searchPlaces(query, radiusMeters);

                // Analyser et typer les lieux selon leur contenu
                const analyzedPlaces = places.map(place => {
                    const analyzedType = this.analyzePlaceType(place, definition.placeType, query);
                    return {
                        ...place,
                        dogPlaceType: analyzedType,
                        searchQuery: query,
                        originalPlaceType: definition.placeType
                    };
                });

                allPlaces.push(...analyzedPlaces);

                // Pause pour éviter les limites de taux
                await this.delay(500);

            } catch (error) {
                console.log(`     ❌ Erreur: ${error.message}`);
            }
        }

        return allPlaces;
    }

    /**
     * 🧠 Analyse intelligente du type de lieu
     */
    analyzePlaceType(place, defaultType, searchQuery) {
        const name = (place.name || '').toLowerCase();
        const address = (place.formatted_address || '').toLowerCase();
        const query = searchQuery.toLowerCase();

        // Mots-clés pour identifier les parcs canins
        const dogParkKeywords = [
            'parc canin', 'parc à chien', 'dog park', 'espace chien',
            'aire de détente canine', 'zone sans laisse', 'parc à chiens',
            'hondenpark', 'hondenspeelplaats', 'chien sans laisse',
            'aire canine', 'enclos chien', 'zone chien'
        ];

        // Mots-clés pour identifier les parcs normaux (mais pas canins)
        const generalParkKeywords = [
            'parc', 'park', 'jardin', 'garden', 'square', 'espace vert',
            'bois', 'forêt', 'cinquantenaire', 'léopold', 'josaphat',
            'wolvendael', 'laeken', 'forest', 'duden', 'malou', 'woluwe'
        ];

        // Vérifier s'il s'agit d'un parc canin spécifique
        const isDogPark = dogParkKeywords.some(keyword =>
            name.includes(keyword) || address.includes(keyword) || query.includes(keyword)
        );

        if (isDogPark) {
            return 'dog_park';
        }

        // Si c'était recherché comme parc général et contient des mots-clés de parc
        if (defaultType === 'general_park' && generalParkKeywords.some(keyword => name.includes(keyword))) {
            return 'general_park';
        }

        // Retourner le type par défaut
        return defaultType;
    }

    async searchPlaces(query, radius) {
        const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
        const params = {
            query,
            location: `${this.center.lat},${this.center.lng}`,
            radius,
            key: this.apiKey,
            language: 'fr'
        };

        try {
            const response = await axios.get(url, { params });

            if (response.data.status === 'OK') {
                return response.data.results || [];
            } else if (response.data.status === 'ZERO_RESULTS') {
                return [];
            } else {
                // Gestion d'erreurs détaillée
                let errorMsg = `API Error: ${response.data.status}`;
                if (response.data.error_message) {
                    errorMsg += ` - ${response.data.error_message}`;
                }

                // Messages d'erreur spécifiques
                if (response.data.status === 'REQUEST_DENIED') {
                    errorMsg += '\n💡 Vérifiez votre clé API Google Places et ses permissions';
                } else if (response.data.status === 'OVER_QUERY_LIMIT') {
                    errorMsg += '\n💡 Quota API dépassé - vérifiez votre billing Google Cloud';
                } else if (response.data.status === 'INVALID_REQUEST') {
                    errorMsg += '\n💡 Paramètres de requête invalides';
                }

                throw new Error(errorMsg);
            }
        } catch (error) {
            if (error.response) {
                throw new Error(`HTTP ${error.response.status}: ${error.response.data?.error_message || error.message}`);
            }
            throw error;
        }
    }

    deduplicatePlaces(places) {
        const seen = new Set();
        const unique = [];

        for (const place of places) {
            if (!seen.has(place.place_id)) {
                seen.add(place.place_id);
                unique.push(place);
            }
        }

        return unique;
    }

    async savePlaces(places) {
        const formattedData = {
            timestamp: new Date().toISOString(),
            source: 'Google Places API - Enhanced Dog Places Search',
            totalPlaces: places.length,
            placesByType: this.groupByType(places),
            places: places
        };

        await fs.writeFile(this.outputFile, JSON.stringify(formattedData, null, 2), 'utf8');
    }

    groupByType(places) {
        const groups = {};
        places.forEach(place => {
            const type = place.dogPlaceType || 'unknown';
            groups[type] = (groups[type] || 0) + 1;
        });
        return groups;
    }

    async checkApiKey() {
        if (!this.apiKey) {
            throw new Error('GOOGLE_PLACES_API_KEY manquante dans les variables d\'environnement');
        }
        console.log('✅ Clé API Google Places configurée');
    }

    async ensureDataDirectory() {
        try {
            await fs.access(this.dataDir);
        } catch {
            await fs.mkdir(this.dataDir, { recursive: true });
            console.log('📁 Répertoire data/ créé');
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * 🎯 FONCTION PRINCIPALE
 */
async function main() {
    const [searchType, radiusKm, dryRun] = process.argv.slice(2);

    const searcher = new EnhancedDogPlacesSearcher();

    try {
        const radius = parseInt(radiusKm) || 20;
        const isDryRun = dryRun === 'true';

        const places = await searcher.searchEnhancedDogPlaces(
            searchType || 'all_dog_places',
            radius,
            isDryRun
        );

        console.log('\n🎉 RECHERCHE TERMINÉE!');
        console.log(`📊 ${places.length} lieux pour chiens collectés`);

    } catch (error) {
        console.error('\n💥 ERREUR:', error.message);
        process.exit(1);
    }
}

// Exécution si appelé directement
if (require.main === module) {
    main();
}

module.exports = EnhancedDogPlacesSearcher;