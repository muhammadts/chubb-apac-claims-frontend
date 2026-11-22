// Public runtime configuration. Replace these values for your deployment; never place secrets here.
window.__CLAIMS_CONFIG__ = {
  mode: 'mock',
  apiBaseUrl: 'http://localhost:4301/api/v1',
  oidc: {
    issuer: '',
    clientId: '',
    redirectUri: `${window.location.origin}/`,
    scope: 'openid profile',
  },
};
