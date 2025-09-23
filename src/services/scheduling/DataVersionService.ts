// src/services/scheduling/DataVersionService.ts

import { createHash } from 'crypto';
import {
  DataVersion,
  DataType,
  DataSourceProvider,
  AddressData,
  DogPlaceData
} from '../../types/DataAcquisition.js';

export class DataVersionService {
  private versions: Map<string, DataVersion> = new Map();

  /**
   * Génère une version pour un dataset
   */
  createVersion(
    type: DataType,
    source: DataSourceProvider,
    data: (AddressData | DogPlaceData)[],
    metadata: {
      apiVersion?: string;
      processingTime: number;
      errors: string[];
      warnings: string[];
    }
  ): DataVersion {
    const dataString = JSON.stringify(
      data.map(item => ({
        id: item.id,
        location: item.location,
        lastUpdated: item.lastUpdated,
        // Champs clés pour le hash
        key: type === 'addresses'
          ? (item as AddressData).formattedAddress
          : (item as DogPlaceData).name
      }))
    );

    const hash = createHash('sha256').update(dataString).digest('hex');
    const versionId = `${type}_${source}_${Date.now()}`;

    const version: DataVersion = {
      id: versionId,
      timestamp: new Date(),
      hash,
      source,
      type,
      recordCount: data.length,
      metadata
    };

    this.versions.set(versionId, version);
    return version;
  }

  /**
   * Compare deux versions pour déterminer si une mise à jour est nécessaire
   */
  compareVersions(
    currentVersion: DataVersion | null,
    newVersion: DataVersion
  ): VersionComparison {
    if (!currentVersion) {
      return {
        needsUpdate: true,
        reason: 'NO_PREVIOUS_VERSION',
        changes: {
          recordsAdded: newVersion.recordCount,
          recordsModified: 0,
          recordsRemoved: 0
        }
      };
    }

    if (currentVersion.hash === newVersion.hash) {
      return {
        needsUpdate: false,
        reason: 'IDENTICAL_HASH',
        changes: {
          recordsAdded: 0,
          recordsModified: 0,
          recordsRemoved: 0
        }
      };
    }

    // Analyse détaillée des changements
    const recordDiff = newVersion.recordCount - currentVersion.recordCount;

    return {
      needsUpdate: true,
      reason: 'DATA_CHANGED',
      changes: {
        recordsAdded: Math.max(0, recordDiff),
        recordsModified: Math.abs(recordDiff),
        recordsRemoved: Math.max(0, -recordDiff)
      },
      previousVersion: currentVersion,
      timeSinceLastUpdate: Date.now() - currentVersion.timestamp.getTime()
    };
  }

  /**
   * Récupère la dernière version pour un type et source donnés
   */
  getLatestVersion(type: DataType, source: DataSourceProvider): DataVersion | null {
    const versions = Array.from(this.versions.values())
      .filter(v => v.type === type && v.source === source)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return versions[0] || null;
  }

  /**
   * Récupère l'historique des versions
   */
  getVersionHistory(
    type: DataType,
    source: DataSourceProvider,
    limit: number = 10
  ): DataVersion[] {
    return Array.from(this.versions.values())
      .filter(v => v.type === type && v.source === source)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Nettoie les anciennes versions (garde les N plus récentes)
   */
  cleanupOldVersions(keepCount: number = 5): void {
    const versionsByTypeSource = new Map<string, DataVersion[]>();

    // Groupe par type et source
    for (const version of this.versions.values()) {
      const key = `${version.type}_${version.source}`;
      if (!versionsByTypeSource.has(key)) {
        versionsByTypeSource.set(key, []);
      }
      versionsByTypeSource.get(key)!.push(version);
    }

    // Garde seulement les N plus récentes pour chaque groupe
    for (const [key, versions] of versionsByTypeSource) {
      const sorted = versions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      const toKeep = sorted.slice(0, keepCount);
      const toRemove = sorted.slice(keepCount);

      // Supprime les anciennes versions
      for (const version of toRemove) {
        this.versions.delete(version.id);
      }
    }
  }

  /**
   * Calcule les métriques de qualité des données
   */
  calculateQualityMetrics(data: (AddressData | DogPlaceData)[]): QualityMetrics {
    const total = data.length;
    if (total === 0) {
      return {
        completenessScore: 0,
        accuracyScore: 0,
        freshnessScore: 0,
        overallScore: 0
      };
    }

    // Complétude : % de champs requis remplis
    const completenessScores = data.map(item => {
      const requiredFields = ['id', 'location', 'lastUpdated'];
      const filledFields = requiredFields.filter(field => {
        const value = (item as any)[field];
        return value !== null && value !== undefined && value !== '';
      });
      return filledFields.length / requiredFields.length;
    });

    const completenessScore = completenessScores.reduce((a, b) => a + b, 0) / total * 100;

    // Précision : % de locations valides
    const validLocations = data.filter(item => {
      const { latitude, longitude } = item.location;
      return latitude >= -90 && latitude <= 90 &&
             longitude >= -180 && longitude <= 180;
    });
    const accuracyScore = (validLocations.length / total) * 100;

    // Fraîcheur : âge moyen des données
    const now = Date.now();
    const ages = data.map(item => now - new Date(item.lastUpdated).getTime());
    const avgAge = ages.reduce((a, b) => a + b, 0) / total;
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 jours
    const freshnessScore = Math.max(0, (1 - avgAge / maxAge) * 100);

    const overallScore = (completenessScore + accuracyScore + freshnessScore) / 3;

    return {
      completenessScore: Math.round(completenessScore),
      accuracyScore: Math.round(accuracyScore),
      freshnessScore: Math.round(freshnessScore),
      overallScore: Math.round(overallScore)
    };
  }
}

export interface VersionComparison {
  needsUpdate: boolean;
  reason: 'NO_PREVIOUS_VERSION' | 'IDENTICAL_HASH' | 'DATA_CHANGED' | 'FORCED_UPDATE';
  changes: {
    recordsAdded: number;
    recordsModified: number;
    recordsRemoved: number;
  };
  previousVersion?: DataVersion;
  timeSinceLastUpdate?: number;
}

export interface QualityMetrics {
  completenessScore: number; // 0-100
  accuracyScore: number;     // 0-100
  freshnessScore: number;    // 0-100
  overallScore: number;      // 0-100
}

// Strategy Pattern pour les différentes fréquences
export abstract class UpdateFrequencyStrategy {
  abstract shouldUpdate(lastUpdate: Date | null, frequency: string): boolean;
  abstract getNextUpdateTime(lastUpdate: Date | null, frequency: string): Date;
}

export class BiannualUpdateStrategy extends UpdateFrequencyStrategy {
  private readonly updateDates = ['01-15', '07-15']; // 15 janvier et 15 juillet

  shouldUpdate(lastUpdate: Date | null, frequency: string): boolean {
    if (!lastUpdate) return true;

    const now = new Date();
    const currentYear = now.getFullYear();

    // Vérifie si on a dépassé une des dates de mise à jour
    for (const dateStr of this.updateDates) {
      const updateDate = new Date(`${currentYear}-${dateStr}T02:00:00.000Z`);
      if (now >= updateDate && lastUpdate < updateDate) {
        return true;
      }
    }

    return false;
  }

  getNextUpdateTime(lastUpdate: Date | null, frequency: string): Date {
    const now = new Date();
    const currentYear = now.getFullYear();

    for (const dateStr of this.updateDates) {
      const updateDate = new Date(`${currentYear}-${dateStr}T02:00:00.000Z`);
      if (now < updateDate) {
        return updateDate;
      }
    }

    // Si toutes les dates de cette année sont passées, retourne la première de l'année suivante
    return new Date(`${currentYear + 1}-${this.updateDates[0]}T02:00:00.000Z`);
  }
}

export class WeeklyUpdateStrategy extends UpdateFrequencyStrategy {
  private readonly dayOfWeek = 0; // Dimanche
  private readonly hour = 2; // 2h du matin

  shouldUpdate(lastUpdate: Date | null, frequency: string): boolean {
    if (!lastUpdate) return true;

    const now = new Date();
    const nextUpdate = this.getNextUpdateTime(lastUpdate, frequency);

    return now >= nextUpdate;
  }

  getNextUpdateTime(lastUpdate: Date | null, frequency: string): Date {
    const now = new Date();
    const nextSunday = new Date(now);

    // Calcule le prochain dimanche à 2h du matin
    const daysUntilSunday = (7 - now.getDay()) % 7;
    nextSunday.setDate(now.getDate() + (daysUntilSunday || 7));
    nextSunday.setHours(this.hour, 0, 0, 0);

    // Si le prochain dimanche est dans le passé, ajoute une semaine
    if (nextSunday <= now) {
      nextSunday.setDate(nextSunday.getDate() + 7);
    }

    return nextSunday;
  }
}

export class UpdateStrategyFactory {
  static createStrategy(frequency: string): UpdateFrequencyStrategy {
    switch (frequency) {
      case 'biannual':
        return new BiannualUpdateStrategy();
      case 'weekly':
        return new WeeklyUpdateStrategy();
      default:
        throw new Error(`Unsupported frequency: ${frequency}`);
    }
  }
}