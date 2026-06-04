const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api', // O prefixo que acionará o proxy
    createProxyMiddleware({
      target: 'https://www.cmpacatuba.ce.gov.br', // O servidor de destino
      changeOrigin: true, // Essencial para que o servidor de destino aceite a requisição
      pathRewrite: {
        '^/api': '', // Remove o prefixo '/api' antes de enviar a requisição
      },
    })
  );

  const functionsBaseUrl = process.env.REACT_APP_FUNCTIONS_BASE_URL ||
      'https://us-central1-blu-app-camara.cloudfunctions.net/generateNews';
  const functionsTarget = functionsBaseUrl.endsWith('/generateNews') ?
      functionsBaseUrl : `${functionsBaseUrl.replace(/\/$/, '')}/generateNews`;

  app.use(
    '/generateNews', // Firebase Cloud Function proxy
    createProxyMiddleware({
      target: functionsTarget,
      changeOrigin: true,
      pathRewrite: {
        '^/generateNews': '', // Remove prefix
      },
    })
  );
};