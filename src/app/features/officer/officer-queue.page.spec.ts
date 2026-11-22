import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OfficerQueuePage } from './officer-queue.page';

describe('OfficerQueuePage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OfficerQueuePage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('cancels stale fetches, resets cursors for filters, and forwards the next cursor', () => {
    const fixture = TestBed.createComponent(OfficerQueuePage);
    fixture.detectChanges();
    const initial = http.expectOne((request) => request.url === '/api/v1/staff/claims');
    fixture.componentInstance.filterForm.patchValue({
      market: 'MKT',
      status: 'Submitted',
      teamId: 'team-configured',
      officerId: 'officer-configured',
      claimNumber: 'CL-1',
      submittedFrom: '2026-01-01',
      submittedTo: '2026-01-31',
      incidentFrom: '2025-12-01',
      incidentTo: '2025-12-31',
    });
    fixture.componentInstance.applyFilters();
    expect(initial.cancelled).toBe(true);

    const filtered = http.expectOne((request) => request.url === '/api/v1/staff/claims');
    expect(filtered.request.params.keys()).toEqual([
      'market', 'status', 'teamId', 'officerId', 'claimNumber', 'submittedFrom',
      'submittedTo', 'incidentFrom', 'incidentTo', 'pageSize',
    ]);
    expect(filtered.request.params.get('status')).toBe('Submitted');
    expect(filtered.request.params.has('cursor')).toBe(false);
    filtered.flush({ items: [], nextCursor: 'opaque-cursor' });
    fixture.detectChanges();

    fixture.componentInstance.loadMore();
    const more = http.expectOne((request) => request.url === '/api/v1/staff/claims' && request.params.get('cursor') === 'opaque-cursor');
    expect(more.request.params.get('market')).toBe('MKT');
    more.flush({
      items: [{
        claimId: '11111111-1111-4111-8111-111111111111',
        claimNumber: 'CL-1',
        marketCode: 'MKT',
        lineOfBusiness: 'Motor',
        status: 'Submitted',
        submittedAt: '2026-01-15T10:00:00.000Z',
        version: 1,
      }],
      nextCursor: null,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.claims()).toHaveLength(1);
    fixture.componentInstance.resetFilters();
    const reset = http.expectOne((request) => request.url === '/api/v1/staff/claims');
    expect(reset.request.params.keys()).toEqual(['pageSize']);
    expect(reset.request.params.has('cursor')).toBe(false);
    reset.flush({ items: [], nextCursor: null });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No claims found');
  });

  it('rejects reversed date ranges without sending an invalid query', () => {
    const fixture = TestBed.createComponent(OfficerQueuePage);
    fixture.detectChanges();
    http.expectOne((request) => request.url === '/api/v1/staff/claims').flush({ items: [], nextCursor: null });
    fixture.componentInstance.filterForm.patchValue({ submittedFrom: '2026-02-01', submittedTo: '2026-01-01' });
    fixture.componentInstance.applyFilters();
    fixture.detectChanges();

    expect(fixture.componentInstance.filterError()).toContain('start on or before');
    http.expectNone((request) => request.url === '/api/v1/staff/claims');
  });
});
