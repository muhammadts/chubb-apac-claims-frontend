import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ManagerOverviewPage } from './manager-overview.page';

describe('ManagerOverviewPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManagerOverviewPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders only the returned group counts, ageing bands, and backend definition', () => {
    const fixture = TestBed.createComponent(ManagerOverviewPage);
    fixture.detectChanges();
    const request = http.expectOne('/api/v1/manager/workload');
    request.flush({
      asOfUtc: '2026-03-01T00:00:00.000Z',
      groups: [{
        marketCode: 'MKT-X',
        teamId: 'TEAM-X',
        officerSubjectId: null,
        statusCounts: { Submitted: 3, InReview: 0 },
        unassignedCount: 1,
        ageingBands: { '0-7': 2, '8-30': 1, '31-90': 0, '90+': 0 },
      }],
      ageingDefinition: 'Elapsed UTC days since submission; not a service target.',
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('MKT-X / TEAM-X');
    expect(text).toContain('Submitted');
    expect(text).toContain('Unassigned claims');
    expect(text).toContain('Elapsed UTC days since submission');
    expect(text).not.toContain('Total claims');
    expect(fixture.nativeElement.querySelectorAll('.group')).toHaveLength(1);
  });

  it('announces empty groups and cancels an older report when refreshing', () => {
    const fixture = TestBed.createComponent(ManagerOverviewPage);
    fixture.detectChanges();
    const first = http.expectOne('/api/v1/manager/workload');
    fixture.componentInstance.refresh();
    expect(first.cancelled).toBe(true);
    http.expectOne('/api/v1/manager/workload').flush({
      asOfUtc: '2026-03-01T00:00:00.000Z',
      groups: [],
      ageingDefinition: 'Elapsed UTC days since submission.',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No workload groups');
  });

  it('shows scoped access errors', () => {
    const fixture = TestBed.createComponent(ManagerOverviewPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/manager/workload').flush({ title: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('market/team scope');
  });
});
