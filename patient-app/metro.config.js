// Metro's package.json "exports" resolution (on by default in recent Expo SDKs)
// resolves `firebase/auth` to the wrong build in React Native, which throws
// "Component auth has not been registered yet" at runtime — a widely reported
// Firebase JS SDK + Metro incompatibility. Disabling it is the standard fix.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
