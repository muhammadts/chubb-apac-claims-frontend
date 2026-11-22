import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ManagerExposurePage } from './manager-exposure.page';

describe('ManagerExposurePage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManagerExposurePage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders currencies as separate groups without totals and displays server assumptions', () => {
    const fixture = TestBed.createComponent(ManagerExposurePage);
    fixture.detectChanges();
    const request = http.expectOne('/api/v1/manager/exposure');
    expect(request.request.params.keys()).toEqual([]);
    request.flush({
      asOfUtc: '2026-03-01T00:00:00.000Z',
      groups: [
        { marketCode: 'MKT-X', currency: 'AAA', amount: 125.5, claimCount: 2 },
        { marketCode: 'MKT-X', currency: 'BBB', amount: 300, claimCount: 1 },
      ],
      missingReserveCount: 4,
      includedStatuses: ['Submitted', 'Approved'],
      assumption: 'Reserve assumptions supplied by the backend.',
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('125.5');
    expect(text).toContain('300');
    expect(text).toContain('Claims missing reserves');
    expect(text).toContain('Reserve assumptions supplied by the backend.');
    expect(fixture.nativeElement.querySelectorAll('.group')).toHaveLength(2);
    expect(text).not.toContain('Total exposure');
  });

  it('shows an explicit empty exposure state', () => {
    const fixture = TestBed.createComponent(ManagerExposurePage);
    fixture.detectChanges();
    http.expectOne('/api/v1/manager/exposure').flush({
      asOfUtc: '2026-03-01T00:00:00.000Z',
      groups: [],
      missingReserveCount: 0,
      includedStatuses: [],
      assumption: 'No reserve amounts were available.',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No exposure groups');
    expect(fixture.nativeElement.textContent).toContain('No included statuses returned');
  });
});
