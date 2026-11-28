import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHavenManifest,
  serializeHavenManifest,
  validateWebAppManifest,
} from './pwaManifest.ts';

test('default Haven manifest passes all PWABuilder and PWA installability checks', () => {
  const manifest = buildHavenManifest();
  const result = validateWebAppManifest(manifest);

  assert.equal(result.valid, true, `Unexpected validation errors: ${result.errors.join(', ')}`);
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.short_name.length <= 12);
  assert.equal(manifest.icons.length, 3);
});

test('buildHavenManifest supports safe HTTPS origin prefixing and ignores unsafe protocols', () => {
  const withHttps = buildHavenManifest({ origin: 'https://haven.example.com/some/path' });
  assert.equal(withHttps.start_url, 'https://haven.example.com/');
  assert.equal(withHttps.icons[0].src, 'https://haven.example.com/pwa-192x192.png');

  const withUnsafe = buildHavenManifest({ origin: 'javascript:alert(1)' });
  assert.equal(withUnsafe.start_url, '/');
  assert.equal(withUnsafe.icons[0].src, '/pwa-192x192.png');
});

test('serializeHavenManifest outputs valid pretty-printed JSON', () => {
  const json = serializeHavenManifest();
  const parsed = JSON.parse(json);
  assert.equal(parsed.name, 'Haven');
  assert.equal(validateWebAppManifest(parsed).valid, true);
});
