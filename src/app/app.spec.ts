import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { AuthAdapter, authAdapterProvider, authInterceptor, SETTINGS } from './core/auth';
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
});
