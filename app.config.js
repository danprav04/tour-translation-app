module.exports = ({ config }) => {
  const isDev = process.env.APP_VARIANT === 'development';

  if (isDev) {
    config.name = `${config.name} (Dev)`;
    if (config.android && config.android.package) {
      config.android.package = `${config.android.package}.dev`;
    }
    if (config.ios && config.ios.bundleIdentifier) {
      config.ios.bundleIdentifier = `${config.ios.bundleIdentifier}.dev`;
    }
  }

  return config;
};
