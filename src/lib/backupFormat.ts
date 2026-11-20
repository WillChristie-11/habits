// The backup file format, kept free of native modules so it can be unit-tested.

export const BACKUP_APP = 'habits';

export interface Backup {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  /** every table, rows exactly as stored */
  tables: Record<string, Record<string, unknown>[]>;
}

/**
 * Throws with a readable message if `data` isn't a backup this app can restore.
 * `currentVersion` = the app's schema version; newer backups are refused.
 */
export function validateBackup(data: unknown, currentVersion = Number.MAX_SAFE_INTEGER): Backup {
  const b = data as Partial<Backup> | null;
  if (!b || typeof b !== 'object' || b.app !== BACKUP_APP || typeof b.tables !== 'object' || !b.tables) {
    throw new Error('This file is not a Habits backup.');
  }
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > currentVersion) {
    throw new Error('This backup is from a newer version of the app. Update the app, then import again.');
  }
  if (!Array.isArray(b.tables.habits)) throw new Error('This backup has no habits table.');
  return b as Backup;
}
