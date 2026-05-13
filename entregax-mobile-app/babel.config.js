/**
 * Babel config:
 * - En producción elimina console.log / console.info / console.debug del bundle
 *   (mantiene console.warn y console.error para que Sentry siga capturando).
 * - En desarrollo no toca nada, así Metro logs siguen funcionando.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      production: {
        plugins: [
          ['transform-remove-console', { exclude: ['error', 'warn'] }],
        ],
      },
    },
  };
};
