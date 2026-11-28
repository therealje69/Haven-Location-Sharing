export interface WebAppManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: 'any' | 'maskable' | 'monochrome';
}

export interface WebAppManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  display_override: string[];
  orientation: 'portrait' | 'landscape' | 'any';
  dir: 'ltr' | 'rtl' | 'auto';
  lang: string;
  theme_color: string;
  background_color: string;
  categories: string[];
  prefer_related_applications: boolean;
  launch_handler: {
    client_mode: string | string[];
  };
  icons: WebAppManifestIcon[];
}

export const HAVEN_WEB_APP_MANIFEST: WebAppManifest = {
  id: '/',
  name: 'Haven',
  short_name: 'Haven',
  description:
    'A safe space for shared presence. Private, metered location check-ins between two people.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  display_override: ['standalone', 'minimal-ui'],
  orientation: 'portrait',
  dir: 'ltr',
  lang: 'en-US',
  theme_color: '#091326',
  background_color: '#091326',
  categories: ['lifestyle', 'utilities'],
  prefer_related_applications: false,
  launch_handler: {
    client_mode: ['navigate-existing', 'auto'],
  },
  icons: [
    {
      src: '/pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/pwa-maskable-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};

function normalizeSafeOrigin(origin?: string): string {
  if (!origin || typeof origin !== 'string') return '';
  try {
    const parsed = new URL(origin.trim());
    if (parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return parsed.origin;
    }
  } catch {
    // Ignore invalid origin strings
  }
  return '';
}

/**
 * Builds the Haven Web App Manifest.
 * When an optional HTTPS origin is provided, icon/start/scope URLs can be prefixed for
 * standalone manifest inspection; by default uses root-relative paths recommended by PWABuilder.
 */
export function buildHavenManifest(options?: { origin?: string }): WebAppManifest {
  const safeOrigin = normalizeSafeOrigin(options?.origin);
  if (!safeOrigin) {
    return {
      ...HAVEN_WEB_APP_MANIFEST,
      display_override: [...HAVEN_WEB_APP_MANIFEST.display_override],
      categories: [...HAVEN_WEB_APP_MANIFEST.categories],
      launch_handler: { ...HAVEN_WEB_APP_MANIFEST.launch_handler },
      icons: HAVEN_WEB_APP_MANIFEST.icons.map((icon) => ({ ...icon })),
    };
  }

  return {
    ...HAVEN_WEB_APP_MANIFEST,
    id: `${safeOrigin}/`,
    start_url: `${safeOrigin}/`,
    scope: `${safeOrigin}/`,
    display_override: [...HAVEN_WEB_APP_MANIFEST.display_override],
    categories: [...HAVEN_WEB_APP_MANIFEST.categories],
    launch_handler: { ...HAVEN_WEB_APP_MANIFEST.launch_handler },
    icons: HAVEN_WEB_APP_MANIFEST.icons.map((icon) => ({
      ...icon,
      src: `${safeOrigin}${icon.src}`,
    })),
  };
}

export function serializeHavenManifest(options?: { origin?: string }): string {
  return `${JSON.stringify(buildHavenManifest(options), null, 2)}\n`;
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateWebAppManifest(manifest: Partial<WebAppManifest>): ManifestValidationResult {
  const errors: string[] = [];

  if (!manifest.id) errors.push('Missing required field: id');
  if (!manifest.name) errors.push('Missing required field: name');
  if (!manifest.short_name) {
    errors.push('Missing required field: short_name');
  } else if (manifest.short_name.length > 12) {
    errors.push('short_name must be 12 characters or fewer');
  }
  if (!manifest.start_url) errors.push('Missing required field: start_url');
  if (!manifest.scope) errors.push('Missing required field: scope');
  if (!manifest.display) errors.push('Missing required field: display');
  if (!manifest.theme_color) errors.push('Missing required field: theme_color');
  if (!manifest.background_color) errors.push('Missing required field: background_color');

  const icons = manifest.icons || [];
  const has192 = icons.some((i) => i.sizes === '192x192' && i.type === 'image/png' && i.purpose === 'any');
  const has512 = icons.some((i) => i.sizes === '512x512' && i.type === 'image/png' && i.purpose === 'any');
  const hasMaskable512 = icons.some(
    (i) => i.sizes === '512x512' && i.type === 'image/png' && i.purpose === 'maskable'
  );
  const hasCombinedPurpose = icons.some((i) => String(i.purpose).includes(' '));

  if (!has192) errors.push('Missing 192x192 PNG icon with purpose "any"');
  if (!has512) errors.push('Missing 512x512 PNG icon with purpose "any"');
  if (!hasMaskable512) errors.push('Missing 512x512 PNG icon with purpose "maskable"');
  if (hasCombinedPurpose) errors.push('Icons must separate "any" and "maskable" purposes');

  return {
    valid: errors.length === 0,
    errors,
  };
}
