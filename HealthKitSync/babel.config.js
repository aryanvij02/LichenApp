module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo']
    ],
    plugins: [
      'nativewind/babel',  // ✅ Add this - it's required for NativeWind
      // Reanimated plugin has to be listed last.
      'react-native-reanimated/plugin',
    ],
  };
};


// module.exports = {
//   presets: ['babel-preset-expo'],
//   plugins: [
//     'nativewind/babel',
//     'react-native-reanimated/plugin',
//   ],
// };