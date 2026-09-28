const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
  const region = process.env.REACT_APP_FUNCTIONS_REGION || 'us-central1';
  const configuredBaseUrl = process.env.REACT_APP_FUNCTIONS_BASE_URL?.trim().replace(/\/$/, '');
  const functionsBaseUrl = configuredBaseUrl || (projectId ?
    `https://${region}-${projectId}.cloudfunctions.net` : '');

  if (functionsBaseUrl) {
    app.use(
      '/generateNews',
      createProxyMiddleware({
        target: `${functionsBaseUrl}/generateNews`,
        changeOrigin: true,
        pathRewrite: {'^/generateNews': ''},
      })
    );
  }
};
