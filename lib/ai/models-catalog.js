import fs from 'fs';
import { modelsFile } from '../paths.js';

/**
 * Load the models catalog from config/MODELS.json.
 * Returns { available: [{ id, label }] } or null if no catalog exists.
 *
 * @returns {{ available: Array<{ id: string, label: string }> } | null}
 */
export function loadModelsCatalog() {
  try {
    if (!fs.existsSync(modelsFile)) return null;
    const raw = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return {
      available: raw.map((m) => ({
        id: m.id,
        label: m.label || m.id,
      })),
    };
  } catch (err) {
    console.error('[models-catalog] Failed to load MODELS.json:', err.message);
    return null;
  }
}
