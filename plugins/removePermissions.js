const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Removes unwanted permissions that are injected by third-party libraries.
 * expo-av adds RECORD_AUDIO even when audio recording is not used.
 */
module.exports = function removePermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const PERMISSIONS_TO_REMOVE = [
      'android.permission.RECORD_AUDIO',
    ];

    if (manifest['uses-permission']) {
      manifest['uses-permission'] = manifest['uses-permission'].filter(
        (perm) => !PERMISSIONS_TO_REMOVE.includes(perm.$['android:name'])
      );
    }

    return config;
  });
};
