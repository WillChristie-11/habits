// JSON backup through the iOS share sheet, and restore from a picked file.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as db from '../db/db';
import { todayKey } from './dates';

/** Write a backup file and open the share sheet (Save to Files, AirDrop, Mail…). */
export async function exportBackup(): Promise<void> {
  const data = await db.exportAll();
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('No place to write the backup file.');
  const uri = `${dir}habits-backup-${todayKey()}.json`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(data, null, 1));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save your Habits backup' });
}

export interface PickedBackup {
  backup: db.Backup;
  name: string;
  counts: { habits: number; records: number; pages: number };
}

/** Let the user pick a backup file; returns null if they cancel. Throws on an invalid file. */
export async function pickBackup(): Promise<PickedBackup | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const text = await FileSystem.readAsStringAsync(asset.uri);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const backup = db.validateBackup(parsed, db.SCHEMA_VERSION);
  const n = (t: string) => (Array.isArray(backup.tables[t]) ? backup.tables[t].length : 0);
  return { backup, name: asset.name, counts: { habits: n('habits'), records: n('records'), pages: n('pages') } };
}

export const restoreBackup = (b: db.Backup) => db.importAll(b);
