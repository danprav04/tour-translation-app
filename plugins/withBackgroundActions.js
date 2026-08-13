const { withAndroidManifest } = require('@expo/config-plugins');

const withBackgroundActions = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const application = androidManifest.manifest.application[0];

    // Find the existing service if it exists to avoid duplicates
    const serviceName = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';
    let serviceExists = false;

    if (!application.service) {
      application.service = [];
    }

    for (let service of application.service) {
      if (service.$['android:name'] === serviceName) {
        serviceExists = true;
        // Ensure the correct types are set (dataSync removed due to Android 15+ 6h timeout)
        service.$['android:foregroundServiceType'] = 'microphone|mediaPlayback';
        break;
      }
    }

    if (!serviceExists) {
      application.service.push({
        $: {
          'android:name': serviceName,
          'android:foregroundServiceType': 'microphone|mediaPlayback',
        },
      });
    }

    return config;
  });
};

module.exports = withBackgroundActions;
