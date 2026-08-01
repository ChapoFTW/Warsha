// https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/#web-setup
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Support wasm assets (required by expo-sqlite on web)
config.resolver.assetExts.push('wasm');

// COEP/COOP headers so SharedArrayBuffer is available on web
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    middleware(req, res, next);
  };
};

module.exports = config;
