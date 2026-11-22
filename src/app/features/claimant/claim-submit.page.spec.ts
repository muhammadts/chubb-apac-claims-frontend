import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SETTINGS } from '../../core/auth';
import { ClaimSubmitPage } from './claim-submit.page';

const settings = {
  mode: 'mock',
  apiBaseUrl: 'http://localhost:4301/api/v1',
  oidc: {},
  markets: [{ code: 'APPROVED-MARKET', name: 'Approved market' }],
};

describe('ClaimSubmitPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClaimSubmitPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SETTINGS, useValue: settings },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('creates an accessible motor form and submits only the matching fixed DTO', () => {
    const fixture = TestBed.createComponent(ClaimSubmitPage);
    fixture.detectChanges();
    const controls = fixture.nativeElement.querySelectorAll('input, select, textarea');
    const mobileStyles = Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n');
    expect(controls.length).toBeGreaterThan(0);
    for (const control of Array.from(controls) as HTMLInputElement[]) {
      expect(control.id).not.toBe('');
      expect(fixture.nativeElement.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
    }
    expect(mobileStyles).toMatch(/@media\s*\(max-width:\s*620px\)/);
    expect(mobileStyles).toMatch(/grid-template-columns:\s*1fr/);

    fixture.componentInstance.form.patchValue({
      marketCode: 'APPROVED-MARKET',
      contact: { name: ' Claimant ', email: 'claimant@example.invalid' },
      incident: { occurredAt: '2026-01-15T10:00', description: ' Vehicle incident ' },
      motor: { make: ' Example ', drivable: false },
    });
    fixture.componentInstance.continueToReview();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Review your claim');

    fixture.componentInstance.submit();
    const request = http.expectOne('/api/v1/claims');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      marketCode: 'APPROVED-MARKET',
      lineOfBusiness: 'Motor',
      contact: { name: 'Claimant', email: 'claimant@example.invalid' },
      incident: {
        occurredAt: new Date('2026-01-15T10:00').toISOString(),
        description: 'Vehicle incident',
      },
      motor: { make: 'Example', drivable: false },
    });
    expect(request.request.body.property).toBeUndefined();
    request.flush(
      { claimId: '11111111-1111-4111-8111-111111111111', claimNumber: 'CL-1', status: 'Submitted', version: 1 },
      { headers: { ETag: '"1"' } },
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Claim submitted');
    expect(fixture.nativeElement.textContent).toContain('CL-1');
  });

  it('submits the property branch without a motor object or empty optional fields', () => {
    const fixture = TestBed.createComponent(ClaimSubmitPage);
    fixture.componentInstance.form.patchValue({
      marketCode: 'APPROVED-MARKET',
      lineOfBusiness: 'Property',
      contact: { name: 'Claimant', email: 'claimant@example.invalid' },
      incident: { occurredAt: '2026-01-15T10:00', description: 'Property incident' },
      property: { city: 'Example City', habitable: false },
    });
    fixture.componentInstance.continueToReview();
    fixture.componentInstance.submit();
    const request = http.expectOne('/api/v1/claims');
    expect(request.request.body.lineOfBusiness).toBe('Property');
    expect(request.request.body.property).toEqual({ city: 'Example City', habitable: false });
    expect(request.request.body.motor).toBeUndefined();
    request.flush(
      { claimId: '22222222-2222-4222-8222-222222222222', claimNumber: 'CL-2', status: 'Submitted', version: 1 },
      { headers: { ETag: '"1"' } },
    );
  });

  it('keeps form data and displays server validation messages', () => {
    const fixture = TestBed.createComponent(ClaimSubmitPage);
    fixture.componentInstance.form.patchValue({
      marketCode: 'APPROVED-MARKET',
      contact: { name: 'Claimant', email: 'claimant@example.invalid' },
      incident: { occurredAt: '2026-01-15T10:00', description: 'Incident' },
    });
    fixture.componentInstance.continueToReview();
    fixture.componentInstance.submit();
    http.expectOne('/api/v1/claims').flush(
      { title: 'Validation Failed', errors: { 'contact.name': ['Name is not accepted.'] } },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.step()).toBe('form');
    expect(fixture.componentInstance.form.controls.contact.controls.name.value).toBe('Claimant');
    expect(fixture.nativeElement.textContent).toContain('contact.name: Name is not accepted.');
  });

  it('shows a setup state and no form when market choices are absent', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ClaimSubmitPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SETTINGS, useValue: { ...settings, markets: [] } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ClaimSubmitPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Market choices are not configured');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('checks the claim list after an ambiguous submit without posting again', () => {
    const fixture = TestBed.createComponent(ClaimSubmitPage);
    fixture.componentInstance.form.patchValue({
      marketCode: 'APPROVED-MARKET',
      contact: { name: 'Claimant', email: 'claimant@example.invalid' },
      incident: { occurredAt: '2026-01-15T10:00', description: 'Incident' },
    });
    fixture.componentInstance.continueToReview();
    fixture.componentInstance.submit();
    const post = http.expectOne('/api/v1/claims');
    post.error(new ProgressEvent('timeout'));
    http.expectOne((request) => request.url === '/api/v1/claims' && request.method === 'GET').flush({ items: [], nextCursor: null });
    fixture.detectChanges();

    expect(fixture.componentInstance.step()).toBe('unknown');
    expect(fixture.componentInstance.payload()?.contact.name).toBe('Claimant');
    expect(fixture.nativeElement.textContent).toContain('Your entered draft is still held in memory');
    expect(fixture.nativeElement.textContent).toContain('We did not submit the claim again');
    expect(fixture.nativeElement.querySelector('button.primary')).toBeNull();
    http.expectNone((request) => request.url === '/api/v1/claims' && request.method === 'POST');
  });
});
