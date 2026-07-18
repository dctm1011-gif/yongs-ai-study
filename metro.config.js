const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Optimize bundle size
config.resolver = {
  ...config.resolver,
  // Exclude unnecessary modules
  blockList: [
    /node_modules\/react-native\/Libraries\/Animated\/(?!Animated\.js)/,
  ],
};

// Enable optimizations
config.transformer = {
  ...config.transformer,
  // Enable minification for production builds
  minifierPath: 'metro-minify-terser',
  minifierConfig: {
    compress: {
      drop_console: true, // Remove console logs in production
    },
  },
};

// Improve caching behavior
config.cacheStores = [
  new (require('metro-cache').FileStore)({
    dir: '.metro-cache',
  }),
];

module.exports = config;
