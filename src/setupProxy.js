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

  app.use(
    '/generateNews', // Firebase Cloud Function proxy
    createProxyMiddleware({
      target: 'https://generatenews-ncrh4bwrmq-uc.a.run.app', // Deploy function URL
      changeOrigin: true,
      pathRewrite: {
        '^/generateNews': '', // Remove prefix
      },
    })
  );
};