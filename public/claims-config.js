// Public runtime configuration. Replace these values for your deployment; never place secrets here.
window.__CLAIMS_CONFIG__ = {
  mode: 'mock',
  apiBaseUrl: 'http://localhost:4301/api/v1',
  // Visible claim-detail refresh interval; set to 0 to disable (allowed range: 30-300 seconds).
  claimRefreshIntervalMs: 60000,
  // Populate only with market codes and display names approved by the backend owner.
  markets: [],
  // Populate only with approved team and officer IDs/names; no directory endpoint exists.
  staffDirectory: { teams: [] },
  oidc: {
    issuer: '',
    clientId: '',
    redirectUri: `${window.location.origin}/`,
    scope: 'openid profile',
  },
};
