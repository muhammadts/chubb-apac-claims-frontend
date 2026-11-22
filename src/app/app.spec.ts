import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { AuthAdapter, authAdapterProvider, authInterceptor, Identity, SETTINGS } from './core/auth';
import { signal } from '@angular/core';
import { routes } from './app.routes';
import { App } from './app';

describe('shared shell and identity modes', () => {
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter(routes), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), authAdapterProvider()] }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('shows the current mock persona and only its role navigation', async () => {
    const fixture = TestBed.createComponent(App); fixture.detectChanges();
    const health = http.expectOne('/api/health');
    expect(health.request.headers.get('x-mock-role')).toBe('Claimant');
    health.flush({ mode: 'mock' }); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Mock mode · Demo data');
    expect(fixture.nativeElement.textContent).toContain('Your claims');
    expect(fixture.nativeElement.textContent).not.toContain('Claims queue');
    fixture.componentInstance.selectPersona('mock-officer'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Claims queue');
    expect(fixture.nativeElement.textContent).not.toContain('Your claims');
  });

  it('navigates to the selected role home and protects another role route', async () => {
    const fixture = TestBed.createComponent(App); fixture.detectChanges();
    http.expectOne('/api/health').flush({ mode: 'mock' }); await fixture.whenStable();
    fixture.componentInstance.selectPersona('mock-manager'); await fixture.whenStable(); fixture.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/manager/overview');
    expect(fixture.nativeElement.textContent).toContain('Workload overview');
    http.expectOne('/api/v1/manager/workload').flush({ asOfUtc: '2026-03-01T00:00:00.000Z', groups: [], ageingDefinition: 'Elapsed UTC days since submission.' });
    await TestBed.inject(Router).navigateByUrl('/officer/queue'); await fixture.whenStable(); fixture.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/forbidden');
    expect(fixture.nativeElement.textContent).toContain('backend authorization remains authoritative');
  });

  it('does not attach mock identity when configured for API mode', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), { provide: SETTINGS, useValue: { mode: 'api', apiBaseUrl: 'https://claims.example/api/v1', oidc: {}, markets: [] } }, authAdapterProvider()] }).compileComponents();
    const client = TestBed.inject((await import('@angular/common/http')).HttpClient);
    http = TestBed.inject(HttpTestingController);
    client.get('/api/v1/claims').subscribe();
    const req = http.expectOne('/api/v1/claims');
    expect(req.request.headers.has('x-mock-role')).toBe(false);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ items: [], nextCursor: null });
  });

  it('blocks mock-mode requests unless the configured target is the local Node mock', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: SETTINGS, useValue: { mode: 'mock', configuredMode: 'mock', apiBaseUrl: 'https://claims.example/api/v1', oidc: {}, markets: [], claimRefreshIntervalMs: 0 } },
        authAdapterProvider(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const client = TestBed.inject((await import('@angular/common/http')).HttpClient);
    let message = '';
    client.get('/api/v1/claims').subscribe({ error: (error) => message = error.message });

    expect(message).toContain('local Node mock API target');
    http.expectNone('/api/v1/claims');
  });

  it('clears an expired API session after a 401 and never sends its bearer token to the local mock', async () => {
    TestBed.resetTestingModule();
    const identity = signal<Identity | null>({ subject: 'signed-in-user', role: 'Claimant', markets: [], teams: [] });
    let expirations = 0;
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: SETTINGS, useValue: { mode: 'api', configuredMode: 'api', apiBaseUrl: 'http://localhost:4301/api/v1', oidc: {}, markets: [], claimRefreshIntervalMs: 0 } },
        { provide: AuthAdapter, useValue: { mode: 'api', identity: identity.asReadonly(), token: () => 'expired-api-token', expireSession: () => { expirations++; identity.set(null); } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const client = TestBed.inject((await import('@angular/common/http')).HttpClient);
    let status = 0;
    client.get('/api/v1/claims').subscribe({ error: (error) => status = error.status });
    const request = http.expectOne('/api/v1/claims');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.has('x-mock-role')).toBe(false);
    request.flush({ title: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(expirations).toBe(1);
    expect(identity()).toBeNull();
  });

  it('offers a return to configured API mode from a temporary mock selection and exposes a keyboard skip link', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: SETTINGS, useValue: { mode: 'mock', configuredMode: 'api', apiBaseUrl: 'http://localhost:4301/api/v1', oidc: {}, markets: [], staffDirectory: { teams: [] }, claimRefreshIntervalMs: 0 } },
        authAdapterProvider(),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    http.expectOne('/api/health').flush({ mode: 'mock' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Switch to configured API mode');
    expect(fixture.nativeElement.querySelector('a.skip-link')?.getAttribute('href')).toBe('#main-content');
    expect(fixture.nativeElement.querySelector('main')?.getAttribute('tabindex')).toBe('-1');
  });
});
