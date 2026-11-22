import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ManagerPerformancePage } from './manager-performance.page';

describe('ManagerPerformancePage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManagerPerformancePage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends UTC midnight bounds, shows the exclusive interval, and handles null metrics at zero counts', () => {
    const fixture = TestBed.createComponent(ManagerPerformancePage);
    fixture.detectChanges();
    fixture.componentInstance.rangeForm.setValue({ fromDate: '2026-02-01', toDate: '2026-03-01' });
    fixture.componentInstance.runReport();
    const request = http.expectOne((item) => item.url === '/api/v1/manager/performance');
    expect(request.request.params.keys()).toEqual(['fromUtc', 'toUtc']);
    expect(request.request.params.get('fromUtc')).toBe('2026-02-01T00:00:00.000Z');
    expect(request.request.params.get('toUtc')).toBe('2026-03-01T00:00:00.000Z');
    request.flush({
      fromUtc: '2026-02-01T00:00:00.000Z',
      toUtc: '2026-03-01T00:00:00.000Z',
      decisionCount: 0,
      averageDecisionElapsedDays: null,
      medianDecisionElapsedDays: null,
      missingDecisionDurationCount: 0,
      settlementCount: 0,
      averageSettlementElapsedDays: null,
      missingSettlementDurationCount: 0,
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('[fromUtc, toUtc)');
    expect(text).toContain('[2026-02-01T00:00:00.000Z, 2026-03-01T00:00:00.000Z)');
    expect(text).toContain('No decisions were recorded');
    expect(text).toContain('No settlement workflows were recorded');
    expect(text).toContain('Not available');
    expect(text).not.toContain('NaN');
  });

  it('cancels stale intervals and does not request reversed dates', () => {
    const fixture = TestBed.createComponent(ManagerPerformancePage);
    fixture.detectChanges();
    fixture.componentInstance.rangeForm.setValue({ fromDate: '2026-01-01', toDate: '2026-02-01' });
    fixture.componentInstance.runReport();
    const first = http.expectOne((request) => request.url === '/api/v1/manager/performance');
    fixture.componentInstance.rangeForm.setValue({ fromDate: '2026-02-01', toDate: '2026-03-01' });
    fixture.componentInstance.runReport();
    expect(first.cancelled).toBe(true);
    http.expectOne((request) => request.url === '/api/v1/manager/performance'
      && request.params.get('fromUtc') === '2026-02-01T00:00:00.000Z').flush({
      fromUtc: '2026-02-01T00:00:00.000Z',
      toUtc: '2026-03-01T00:00:00.000Z',
      decisionCount: 1,
      averageDecisionElapsedDays: 2,
      medianDecisionElapsedDays: 2,
      missingDecisionDurationCount: 0,
      settlementCount: 0,
      averageSettlementElapsedDays: null,
      missingSettlementDurationCount: 0,
    });

    fixture.componentInstance.rangeForm.setValue({ fromDate: '2026-03-01', toDate: '2026-02-01' });
    fixture.componentInstance.runReport();
    fixture.detectChanges();
    expect(fixture.componentInstance.validationError()).toContain('earlier than the exclusive end date');
    http.expectNone((request) => request.url === '/api/v1/manager/performance');
  });

  it('does not request invalid calendar dates', () => {
    const fixture = TestBed.createComponent(ManagerPerformancePage);
    fixture.detectChanges();
    fixture.componentInstance.rangeForm.setValue({ fromDate: '2026-02-30', toDate: '2026-03-01' });
    fixture.componentInstance.runReport();
    expect(fixture.componentInstance.validationError()).toContain('valid start and end dates');
    http.expectNone((request) => request.url === '/api/v1/manager/performance');
  });
});
