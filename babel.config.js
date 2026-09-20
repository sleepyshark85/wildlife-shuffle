// Reanimated's Babel plugin MUST be the last entry in the plugin list
// (docs/v2/ui.md §8.3 ¶4, AC-829 / AC-1304). Without this file Reanimated 4
// silently does nothing — no error, no warning, just an app where none of the
// motion spec happens. v1 had no babel.config.js at all.
//
// `react-native-reanimated/plugin` re-exports `react-native-worklets/plugin` in
// Reanimated 4.x; the ACs name the reanimated path, and it is the supported one.
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
