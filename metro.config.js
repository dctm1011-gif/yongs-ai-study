const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Optimize bundle size
config.resolver = {
  ...config.resolver,
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

// Use Metro's default cache configuration
// Removing custom cacheStores to avoid initialization issues

module.exports = config;
