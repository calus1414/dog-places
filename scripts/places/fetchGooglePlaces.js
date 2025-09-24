const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * 🐕 FETCH PLACES - GOOGLE PLACES API (PAYANT)
 *
 * Récupère les lieux d'intérêt pour chiens à Bruxelles :
 *   - Parcs à chiens
 *   - Vétérinaires
 *   - Animaleries
 *   - Cafés dog-friendly
 *
 * ⚠️ COÛT : Selon pricing Google Places API
 * 📊 Quota recommandé : 2000 requêtes/jour
 */

class GooglePlacesFetcher {
    constructor() {
        this.GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
        this.PLACES_API_URL = 'https://maps.googleapis.com/maps/api/place';

        if (!this.GOOGLE_PLACES_API_KEY) {
            throw new Error('GOOGLE_PLACES_API_KEY manquante dans .env');
        }

        // Centre de Bruxelles
        this.BRUSSELS_CENTER = {
            lat: 50.8503,
            lng: 4.3517
        };

        this.SEARCH_RADIUS = 15000; // 15km pour couvrir toute la région

        this.stats = {
            totalRequests: 0,
            totalResults: 0,
            byCategory: {},
            errors: 0,
            duplicates: 0,
            apiCost: 0,
            startTime: Date.now()
        };

        // Catégories de lieux pour chiens
        this.DOG_PLACE_CATEGORIES = [
            {
                name: 'dog_parks',
                displayName: 'Parcs à chiens',
                query: 'dog park',
                types: ['park'],
                keywords: ['dog', 'chien', 'parc à chien', 'dog park', 'aire pour chiens']
            },
            {
                name: 'veterinary',
                displayName: 'Vétérinaires',
                query: 'veterinaire',
                types: ['veterinary_care'],
                keywords: ['veterinaire', 'clinique veterinaire', 'veterinary']
            },
            {
                name: 'pet_stores',
                displayName: 'Animaleries',
                query: 'animalerie',
                types: ['pet_store'],
                keywords: ['animalerie', 'pet store', 'animaux', 'nourriture chien']
            },
            {
                name: 'dog_friendly_cafes',
                displayName: 'Cafés dog-friendly',
                query: 'dog friendly cafe restaurant',
                types: ['restaurant', 'cafe'],
                keywords: ['dog friendly', 'chien accepté', 'pet friendly']
            }
        ];
    }

    /**
     * 🔍 Récupération de tous les types de lieux
     */
    async fetchAllPlaces() {
        console.log('🐕 RÉCUPÉRATION DES LIEUX POUR CHIENS');
        console.log('====================================');
        console.log('📍 Zone: Bruxelles et environs (15km)');
        console.log('🔑 API: Google Places (payant)');
        console.log('📅', new Date().toLocaleString('fr-BE'));

        const allPlaces = [];

        for (const category of this.DOG_PLACE_CATEGORIES) {
            console.log(`\n🔍 Recherche: ${category.displayName}...`);

            try {
                const places = await this.fetchPlacesByCategory(category);
                allPlaces.push(...places);

                console.log(`✅ ${places.length} ${category.displayName.toLowerCase()} trouvés`);
                this.stats.byCategory[category.name] = places.length;

            } catch (error) {
                console.error(`❌ Erreur ${category.displayName}:`, error.message);
                this.stats.errors++;
                this.stats.byCategory[category.name] = 0;
            }

            // Pause pour respecter les rate limits
            await this.sleep(1000);
        }

        return allPlaces;
    }

    /**
     * 🏷️ Récupération par catégorie
     */
    async fetchPlacesByCategory(category) {
        const places = [];
        let nextPageToken = null;

        do {
            const response = await this.searchPlaces(category, nextPageToken);

            if (response.results) {
                // Enrichir chaque lieu avec des détails
                for (const place of response.results) {
                    try {
                        const enrichedPlace = await this.enrichPlaceDetails(place, category);
                        places.push(enrichedPlace);

                        // Pause pour respecter les quotas
                        await this.sleep(200);

                    } catch (error) {
                        console.warn(`⚠️ Impossible d'enrichir ${place.name}:`, error.message);
                        places.push(this.createBasicPlace(place, category));
                    }
                }
            }

            nextPageToken = response.next_page_token;

            // Pause obligatoire avant la page suivante
            if (nextPageToken) {
                console.log('   📄 Page suivante dans 3s...');
                await this.sleep(3000);
            }

        } while (nextPageToken && places.length < 50); // Limite à 50 par catégorie

        return places;
    }

    /**
     * 🔎 Recherche Places API
     */
    async searchPlaces(category, pageToken = null) {
        const params = {
            query: category.query,
            location: `${this.BRUSSELS_CENTER.lat},${this.BRUSSELS_CENTER.lng}`,
            radius: this.SEARCH_RADIUS,
            key: this.GOOGLE_PLACES_API_KEY
        };

        if (pageToken) {
            params.pagetoken = pageToken;
        }

        const response = await axios.get(`${this.PLACES_API_URL}/textsearch/json`, {
            params,
            timeout: 10000
        });

        this.stats.totalRequests++;
        this.stats.apiCost += 0.032; // ~$0.032 per Text Search request

        if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
            throw new Error(`Google Places API Error: ${response.data.status}`);
        }

        return response.data;
    }

    /**
     * 🔍 Enrichissement avec Place Details
     */
    async enrichPlaceDetails(place, category) {
        try {
            const detailsResponse = await axios.get(`${this.PLACES_API_URL}/details/json`, {
                params: {
                    place_id: place.place_id,
                    fields: 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours,price_level,photos',
                    key: this.GOOGLE_PLACES_API_KEY
                },
                timeout: 10000
            });

            this.stats.totalRequests++;
            this.stats.apiCost += 0.017; // ~$0.017 per Place Details request

            const details = detailsResponse.data.result;

            return {
                id: place.place_id,
                name: details.name || place.name,
                type: category.name,
                category: category.displayName,
                location: {
                    latitude: place.geometry.location.lat,
                    longitude: place.geometry.location.lng
                },
                address: details.formatted_address || place.formatted_address,
                phone: details.formatted_phone_number || null,
                website: details.website || null,
                rating: details.rating || null,
                ratingsCount: details.user_ratings_total || 0,
                openingHours: details.opening_hours?.weekday_text || [],
                priceLevel: details.price_level || null,
                photos: this.processPhotos(details.photos),
                source: 'Google Places API',
                isActive: true,
                lastFetched: new Date().toISOString()
            };

        } catch (error) {
            console.warn(`⚠️ Details API error for ${place.name}`);
            return this.createBasicPlace(place, category);
        }
    }

    /**
     * 🖼️ Traitement des photos
     */
    processPhotos(photos) {
        if (!photos || photos.length === 0) return [];

        return photos.slice(0, 3).map(photo => ({
            reference: photo.photo_reference,
            width: photo.width,
            height: photo.height,
            url: `${this.PLACES_API_URL}/photo?maxwidth=400&photo_reference=${photo.photo_reference}&key=${this.GOOGLE_PLACES_API_KEY}`
        }));
    }

    /**
     * 🏪 Création d'un lieu basique (sans enrichissement)
     */
    createBasicPlace(place, category) {
        return {
            id: place.place_id,
            name: place.name,
            type: category.name,
            category: category.displayName,
            location: {
                latitude: place.geometry.location.lat,
                longitude: place.geometry.location.lng
            },
            address: place.formatted_address,
            phone: null,
            website: null,
            rating: place.rating || null,
            ratingsCount: place.user_ratings_total || 0,
            openingHours: [],
            priceLevel: place.price_level || null,
            photos: [],
            source: 'Google Places API',
            isActive: true,
            lastFetched: new Date().toISOString()
        };
    }

    /**
     * 🚫 Suppression des doublons
     */
    removeDuplicates(places) {
        const seen = new Set();
        const unique = [];

        for (const place of places) {
            const key = `${place.name}_${place.location.latitude}_${place.location.longitude}`;

            if (!seen.has(key)) {
                seen.add(key);
                unique.push(place);
            } else {
                this.stats.duplicates++;
            }
        }

        return unique;
    }

    /**
     * 💾 Sauvegarde en fichier JSON
     */
    async saveToFile(places, filename = 'brussels_places.json') {
        const filePath = path.join(__dirname, '..', 'data', filename);

        // Créer le dossier data s'il n'existe pas
        const dataDir = path.dirname(filePath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const data = {
            metadata: {
                source: 'GooglePlacesFetcher',
                fetchedAt: new Date().toISOString(),
                count: places.length,
                center: this.BRUSSELS_CENTER,
                radius: this.SEARCH_RADIUS,
                categories: this.DOG_PLACE_CATEGORIES.map(cat => ({
                    name: cat.name,
                    displayName: cat.displayName,
                    count: this.stats.byCategory[cat.name] || 0
                })),
                stats: this.stats,
                apiCostEstimate: `$${this.stats.apiCost.toFixed(3)}`
            },
            places: places
        };

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`💾 ${places.length} lieux sauvegardés dans ${filePath}`);

        return filePath;
    }

    /**
     * 📊 Rapport final
     */
    generateReport() {
        this.stats.totalResults = Object.values(this.stats.byCategory).reduce((sum, count) => sum + count, 0);
        const duration = (Date.now() - this.stats.startTime) / 1000;

        console.log('\n📊 RAPPORT DE RÉCUPÉRATION');
        console.log('===========================');
        console.log(`⏱️  Durée: ${duration.toFixed(1)}s`);
        console.log(`🔍 Requêtes API: ${this.stats.totalRequests}`);
        console.log(`📊 Total lieux: ${this.stats.totalResults}`);
        console.log(`🚫 Doublons supprimés: ${this.stats.duplicates}`);
        console.log(`❌ Erreurs: ${this.stats.errors}`);
        console.log(`💰 Coût estimé: $${this.stats.apiCost.toFixed(3)}`);

        console.log('\n🏷️ PAR CATÉGORIE:');
        this.DOG_PLACE_CATEGORIES.forEach(category => {
            const count = this.stats.byCategory[category.name] || 0;
            console.log(`   ${category.displayName}: ${count} lieux`);
        });

        if (this.stats.apiCost > 5) {
            console.log('\n⚠️ ATTENTION: Coût API élevé!');
            console.log('💡 Considérez réduire la fréquence des appels');
        }
    }

    /**
     * 💤 Pause utilitaire
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * 🎯 FONCTION PRINCIPALE
 */
async function main() {
    console.log('🐕 RÉCUPÉRATION DES LIEUX POUR CHIENS - GOOGLE PLACES');

    try {
        const fetcher = new GooglePlacesFetcher();

        // 1. Récupération des lieux
        console.log('\n🔍 Récupération en cours...');
        let places = await fetcher.fetchAllPlaces();

        if (places.length === 0) {
            console.error('❌ Aucun lieu récupéré');
            process.exit(1);
        }

        // 2. Suppression des doublons
        console.log('\n🚫 Suppression des doublons...');
        places = fetcher.removeDuplicates(places);

        // 3. Sauvegarde
        console.log('\n💾 Sauvegarde...');
        const filePath = await fetcher.saveToFile(places);

        // 4. Rapport final
        fetcher.generateReport();

        console.log('\n🎉 RÉCUPÉRATION TERMINÉE AVEC SUCCÈS!');
        console.log(`📁 Fichier: ${filePath}`);
        console.log('💡 Prochaine étape: npm run import:places:process');
        console.log('⚠️ N\'oubliez pas de surveiller vos quotas Google Places!');

    } catch (error) {
        console.error('💥 Erreur lors de la récupération:', error.message);

        if (error.message.includes('API key')) {
            console.log('\n🔑 Configuration requise:');
            console.log('1. Obtenez une clé Google Places API');
            console.log('2. Ajoutez GOOGLE_PLACES_API_KEY dans .env');
            console.log('3. Activez la billing sur votre projet Google Cloud');
        }

        process.exit(1);
    }
}

module.exports = { GooglePlacesFetcher, main };

// Exécution si appelé directement
if (require.main === module) {
    main();
}