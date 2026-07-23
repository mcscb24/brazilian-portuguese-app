import { BundleValidationError, validateBundle } from './bundleValidation';
import type { ContentBundle } from './types';

// import.meta.env.BASE_URL tracks vite.config.ts's base ('./' currently) so this keeps working
// whether the app is served from a domain root or a GitHub Pages subpath later.
const BUNDLE_URL = `${import.meta.env.BASE_URL}content-bundle.json`;

let cached: ContentBundle | null = null;

export type LoadResult =
  | { ok: true; bundle: ContentBundle }
  | { ok: false; reason: 'network' | 'invalid'; message: string };

export async function loadBundle(): Promise<LoadResult> {
  let raw: unknown;
  try {
    const response = await fetch(BUNDLE_URL, { cache: 'no-cache' });
    if (!response.ok) {
      return { ok: false, reason: 'network', message: `Server responded with ${response.status}.` };
    }
    raw = await response.json();
  } catch (err) {
    return {
      ok: false,
      reason: 'network',
      message: err instanceof Error ? err.message : 'Could not reach the server.',
    };
  }

  try {
    cached = validateBundle(raw);
    return { ok: true, bundle: cached };
  } catch (err) {
    if (err instanceof BundleValidationError) {
      return { ok: false, reason: 'invalid', message: err.message };
    }
    throw err;
  }
}

export function getBundle(): ContentBundle {
  if (!cached) {
    throw new Error('getBundle() called before a bundle was successfully loaded.');
  }
  return cached;
}

export function hasBundle(): boolean {
  return cached !== null;
}
