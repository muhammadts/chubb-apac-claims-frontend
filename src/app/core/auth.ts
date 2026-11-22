import { HttpInterceptorFn } from '@angular/common/http';
import { Injectable, InjectionToken, Signal, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export type Role = 'Claimant' | 'ClaimsOfficer' | 'Manager';
export type AppMode = 'mock' | 'api';
export interface Identity { subject: string; role: Role; markets: string[]; teams: string[]; }
export interface OidcSettings { issuer?: string; clientId?: string; redirectUri?: string; scope?: string; }
export interface MarketOption { code: string; name: string; }
export interface StaffOfficerOption { subjectId: string; displayName: string; }
export interface StaffTeamOption { teamId: string; displayName: string; officers: StaffOfficerOption[]; }
export interface StaffDirectoryConfig { teams: StaffTeamOption[]; }
export interface AppSettings { mode: AppMode; apiBaseUrl: string; oidc: OidcSettings; markets: MarketOption[]; staffDirectory: StaffDirectoryConfig; }
declare global { interface Window { __CLAIMS_CONFIG__?: Partial<AppSettings>; } }

export const SETTINGS = new InjectionToken<AppSettings>('APP_SETTINGS', { providedIn: 'root', factory: () => {
  const cfg = window.__CLAIMS_CONFIG__ ?? {};
  const mode = sessionStorage.getItem('claims.mode') ?? cfg.mode;
  const markets = Array.isArray(cfg.markets) ? cfg.markets.filter((market): market is MarketOption =>
    typeof market?.code === 'string' && market.code.trim().length > 0 &&
    typeof market.name === 'string' && market.name.trim().length > 0
  ) : [];
  const teams = Array.isArray(cfg.staffDirectory?.teams) ? cfg.staffDirectory.teams
    .filter((team): team is StaffTeamOption =>
      typeof team?.teamId === 'string' && team.teamId.trim().length > 0 &&
      typeof team.displayName === 'string' && team.displayName.trim().length > 0 &&
      Array.isArray(team.officers)
    )
    .map((team) => ({
      ...team,
      officers: Array.isArray(team.officers) ? team.officers.filter((officer) =>
        typeof officer?.subjectId === 'string' && officer.subjectId.trim().length > 0 &&
        typeof officer.displayName === 'string' && officer.displayName.trim().length > 0
      ) : [],
    })) : [];
  return {
    mode: mode === 'api' ? 'api' : 'mock',
    apiBaseUrl: cfg.apiBaseUrl ?? 'http://localhost:4301/api/v1',
    oidc: cfg.oidc ?? {},
    markets,
    staffDirectory: { teams },
  };
} });

export const MOCK_PERSONAS: Identity[] = [
  { subject: 'mock-claimant', role: 'Claimant', markets: ['MOCK'], teams: ['MOCK-TEAM'] },
  { subject: 'mock-officer', role: 'ClaimsOfficer', markets: ['MOCK'], teams: ['MOCK-TEAM'] },
  { subject: 'mock-manager', role: 'Manager', markets: ['MOCK'], teams: ['MOCK-TEAM'] },
];

export abstract class AuthAdapter {
  abstract readonly identity: Signal<Identity | null>;
  abstract readonly mode: AppMode;
  abstract readonly oidcConfigured: boolean;
  abstract selectPersona(identity: Identity): void;
  abstract signIn(): Promise<void>;
  abstract completeSignIn(): Promise<void>;
  abstract token(): string | null;
}

@Injectable()
export class MockAuthAdapter extends AuthAdapter {
  private readonly _identity = signal<Identity | null>(MOCK_PERSONAS[0]);
  readonly identity = this._identity.asReadonly();
  readonly mode = 'mock' as const;
  readonly oidcConfigured = false;
  selectPersona(identity: Identity): void {
    const fixture = MOCK_PERSONAS.find((p) => p.subject === identity.subject && p.role === identity.role);
    if (fixture) this._identity.set(fixture);
  }
  async signIn(): Promise<void> { return; }
  async completeSignIn(): Promise<void> { return; }
  token(): string | null { return null; }
}

@Injectable()
export class OidcAuthAdapter extends AuthAdapter {
  private readonly settings = inject(SETTINGS);
  private readonly _identity = signal<Identity | null>(null);
  readonly identity = this._identity.asReadonly();
  readonly mode = 'api' as const;
  readonly oidcConfigured = !!(this.settings.oidc.issuer && this.settings.oidc.clientId && this.settings.oidc.redirectUri);
  private accessToken: string | null = null;
  selectPersona(_identity: Identity): void { /* Personas are mock-only. */ }
  async signIn(): Promise<void> {
    if (!this.oidcConfigured) return;
    const settings = this.settings.oidc;
    const discovery = await fetch(`${settings.issuer!.replace(/\/$/, '')}/.well-known/openid-configuration`).then((r) => r.json()) as { authorization_endpoint: string; token_endpoint: string };
    const verifier = randomText(64), state = randomText(32), nonce = randomText(32);
    sessionStorage.setItem('claims.pkce', JSON.stringify({ verifier, state, nonce, tokenEndpoint: discovery.token_endpoint }));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const query = new URLSearchParams({ response_type: 'code', client_id: settings.clientId!, redirect_uri: settings.redirectUri!, scope: settings.scope ?? 'openid profile', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' });
    location.assign(`${discovery.authorization_endpoint}?${query}`);
  }

  async completeSignIn(): Promise<void> {
    if (!this.oidcConfigured) return;
    const code = new URLSearchParams(location.search).get('code');
    if (!code) return;
    const saved = sessionStorage.getItem('claims.pkce');
    sessionStorage.removeItem('claims.pkce');
    const params = new URLSearchParams(location.search);
    if (!saved) throw new Error('Sign-in state expired. Start sign-in again.');
    const pkce = JSON.parse(saved) as { verifier: string; state: string; nonce: string; tokenEndpoint: string };
    if (params.get('state') !== pkce.state) throw new Error('Sign-in state did not match. Start sign-in again.');
    const response = await fetch(pkce.tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: this.settings.oidc.clientId!, redirect_uri: this.settings.oidc.redirectUri!, code, code_verifier: pkce.verifier }) });
    if (!response.ok) throw new Error('The identity provider could not complete sign-in.');
    const token = await response.json() as { access_token: string; id_token?: string };
    this.accessToken = token.access_token;
    if (!token.id_token) throw new Error('The identity provider did not return an OpenID ID token.');
    const claims = decodeJwt(token.id_token);
    if (claims['nonce'] !== pkce.nonce) throw new Error('The identity token nonce did not match. Start sign-in again.');
    const rawRole = claims['role'] ?? claims['roles'];
    const roles = Array.isArray(rawRole) ? rawRole : [rawRole];
    const role = roles.find((x): x is Role => x === 'Claimant' || x === 'ClaimsOfficer' || x === 'Manager');
    if (role && typeof claims['sub'] === 'string') this._identity.set({ subject: claims['sub'], role, markets: strings(claims['markets'] ?? claims['market']), teams: strings(claims['teams'] ?? claims['team']) });
    history.replaceState(null, '', location.pathname);
  }
  token(): string | null { return this.accessToken; }
}

export function authAdapterProvider() {
  return { provide: AuthAdapter, useFactory: (settings: AppSettings) => settings.mode === 'mock' ? new MockAuthAdapter() : new OidcAuthAdapter(), deps: [SETTINGS] };
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthAdapter), settings = inject(SETTINGS);
  if (!req.url.includes('/api/')) return next(req);
  if (auth.mode === 'api') {
    const token = auth.token();
    return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
  }
  if (auth.mode === 'mock' && isLocalMock(settings.apiBaseUrl)) {
    const identity = auth.identity();
    if (!identity) return next(req);
    return next(req.clone({ setHeaders: { 'x-mock-role': identity.role, 'x-mock-sub': identity.subject, 'x-mock-market': identity.markets.join(','), 'x-mock-team': identity.teams.join(',') } }));
  }
  return next(req);
};

function isLocalMock(base: string): boolean { try { const u = new URL(base, location.origin); return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) && u.port === '4301'; } catch { return false; } }
function randomText(bytes: number): string { const data = crypto.getRandomValues(new Uint8Array(bytes)); return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function decodeJwt(token: string): Record<string, unknown> { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : typeof value === 'string' ? [value] : []; }

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthAdapter), router = inject(Router), role = route.data['role'] as Role;
  return auth.identity()?.role === role ? true : router.createUrlTree(['/forbidden']);
};
