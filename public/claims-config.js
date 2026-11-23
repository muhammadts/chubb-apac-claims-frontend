// Public runtime configuration. Replace these values for your deployment; never place secrets here.
window.__CLAIMS_CONFIG__ = {
  mode: 'api',
  apiBaseUrl: '/api/v1',
  // Visible claim-detail refresh interval; set to 0 to disable (allowed range: 30-300 seconds).
  claimRefreshIntervalMs: 60000,
  // Populate only with market codes and display names approved by the backend owner.
  // Default values are deliberately mock-only. Replace them with owner-approved
  // backend market/team data before using API mode.
  markets: [{ code: 'MOCK', name: 'Mock market (demo only)' }],
  // Populate only with approved team and officer IDs/names; no directory endpoint exists.
  staffDirectory: {
    teams: [{
      teamId: 'MOCK-TEAM',
      displayName: 'Mock team (demo only)',
      officers: [{ subjectId: 'mock-officer', displayName: 'Mock officer (demo only)' }],
    }],
  },
  oidc: {
    issuer: 'http://localhost:8080/realms/chubb-claims',
    clientId: 'chubb-claims-frontend',
    redirectUri: `${window.location.origin}/`,
    scope: 'openid profile',
  },
};
