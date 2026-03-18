const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Removes unwanted permissions injected by third-party libraries at Gradle merge time.
 * expo-av adds RECORD_AUDIO even when audio recording is not used.
 *
 * Strategy: add a <uses-permission tools:node="remove"> entry so Android's manifest
 * merger strips the permission from ALL sources (including library manifests).
 */
module.exports = function removePermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure the tools namespace is declared on the root manifest element
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    // Remove any existing entry for RECORD_AUDIO first
    if (manifest['uses-permission']) {
      manifest['uses-permission'] = manifest['uses-permission'].filter(
        (perm) => perm.$['android:name'] !== 'android.permission.RECORD_AUDIO'
      );
    } else {
      manifest['uses-permission'] = [];
    }

    // Add a removal directive — overrides what any library manifest adds
    manifest['uses-permission'].push({
      $: {
        'android:name': 'android.permission.RECORD_AUDIO',
        'tools:node': 'remove',
      },
    });

    return config;
  });
};
