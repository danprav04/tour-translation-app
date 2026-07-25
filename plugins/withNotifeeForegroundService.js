const { withAndroidManifest } = require('@expo/config-plugins');

const withNotifeeForegroundService = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const application = androidManifest.manifest.application[0];

    // Find or create the service tag for app.notifee.core.ForegroundService
    if (!application.service) {
      application.service = [];
    }

    let notifeeService = application.service.find(
      (s) => s.$['android:name'] === 'app.notifee.core.ForegroundService'
    );

    if (!notifeeService) {
      notifeeService = {
        $: {
          'android:name': 'app.notifee.core.ForegroundService',
        },
      };
      application.service.push(notifeeService);
    }

    // Set the foregroundServiceType
    notifeeService.$['android:foregroundServiceType'] = 'shortService|microphone|mediaPlayback';

    return config;
  });
};

module.exports = withNotifeeForegroundService;
