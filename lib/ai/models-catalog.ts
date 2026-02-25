import fs from 'fs';
import { modelsFile } from '../paths.js';

export interface ModelEntry {
  id: string;
  label: string;
}

export interface ModelsCatalog {
  available: ModelEntry[];
}

/**
 * Load the models catalog from config/MODELS.json.
 * Returns { available: [{ id, label }] } or null if no catalog exists.
 */
export function loadModelsCatalog(): ModelsCatalog | null {
  try {
    if (!fs.existsSync(modelsFile)) return null;
    const raw: Array<{ id: string; label?: string }> = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return {
      available: raw.map((m) => ({
        id: m.id,
        label: m.label || m.id,
      })),
    };
  } catch (err: unknown) {
    console.error('[models-catalog] Failed to load MODELS.json:', (err as Error).message);
    return null;
  }
}
