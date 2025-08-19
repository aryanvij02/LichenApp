//Metro configuration file which allows us to add more apart from the basic metro configuration that expo provides
//Metro is what runs your development server which serves your bundled application.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add SVG support
config.transformer.assetPlugins = ['expo-asset/tools/hashAssetFiles'];

module.exports = config;