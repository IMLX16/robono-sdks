const {withInfoPlist, withAndroidManifest, createRunOncePlugin} = require('expo/config-plugins');
function withCallingRuntime(config) {
  config = withInfoPlist(config, value => {
    value.modResults.UIBackgroundModes = [...new Set([...(value.modResults.UIBackgroundModes || []), 'audio'])];
    return value;
  });
  return withAndroidManifest(config, value => {
    const manifest = value.modResults.manifest;
    const permissions = manifest['uses-permission'] ||= [];
    for (const name of ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'INTERNET', 'WAKE_LOCK', 'POST_NOTIFICATIONS', 'BLUETOOTH_CONNECT']) {
      const permission = `android.permission.${name}`;
      if (!permissions.some(item => item.$['android:name'] === permission)) permissions.push({$: {'android:name': permission}});
    }
    return value;
  });
}
module.exports = createRunOncePlugin(withCallingRuntime, '@robono/calling-react-native', '0.1.0');
