import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AppSettings, SETTINGS } from '../../core/auth';
import { StaffDetail } from '../../core/claims-api';
import { OfficerWorkbenchPage } from './officer-workbench.page';

const claimId = '11111111-1111-4111-8111-111111111111';
const configuredSettings: AppSettings = {
  mode: 'mock',
  apiBaseUrl: 'http://localhost:4301/api/v1',
  oidc: {},
  markets: [],
  staffDirectory: {
    teams: [{
      teamId: 'TEAM-TEST',
      displayName: 'Test team',
      officers: [{ subjectId: 'OFFICER-TEST', displayName: 'Test officer' }],
    }],
  },
};

function staffDetail(status = 'Submitted'): StaffDetail {
  return {
    claimId,
    claimNumber: 'CL-1',
    marketCode: 'MKT',
    lineOfBusiness: 'Motor',
    status: status as StaffDetail['status'],
    submittedAt: '2026-01-15T10:00:00.000Z',
    reportedAt: null,
    version: 1,
    contact: { name: 'Claimant', email: 'claimant@example.invalid' },
    incident: { occurredAt: '2026-01-14T10:00:00.000Z', description: 'Claim facts' },
    motor: null,
    property: null,
    decision: { type: 'Approved', date: '2026-01-16T10:00:00.000Z', amount: null },
    informationRequests: [],
    activities: [{ occurredAt: '2026-01-15T11:00:00.000Z', description: 'Claim received' }],
    assignment: null,
    reserve: null,
    decisionRationale: 'Staff-only rationale',
    assessments: [{ assessmentType: 'Review', rationale: 'Staff-only assessment', recommendation: 'Proceed' }],
    reserveHistory: [],
    internalNotes: [{ noteText: 'Private staff note', createdAt: '2026-01-15T12:00:00.000Z' }],
    assignmentHistory: [],
  };
}

describe('OfficerWorkbenchPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureTestBed(configuredSettings);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows staff-only information and handles nullable detail and reserve values', () => {
    const fixture = TestBed.createComponent(OfficerWorkbenchPage);
    fixture.detectChanges();
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail(), { headers: { ETag: '"1"' } });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Staff-only decision rationale');
    expect(fixture.nativeElement.textContent).toContain('Staff-only rationale');
    expect(fixture.nativeElement.textContent).toContain('Staff-only internal notes');
    expect(fixture.nativeElement.textContent).toContain('Private staff note');
    expect(fixture.nativeElement.textContent).toContain('No reserve recorded.');
    expect(fixture.nativeElement.textContent).toContain('No motor details were returned.');
  });

  it('assigns only a configured team/officer after loading fresh detail and refreshes the ETag', () => {
    const fixture = TestBed.createComponent(OfficerWorkbenchPage);
    fixture.detectChanges();
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail(), { headers: { ETag: '"1"' } });
    fixture.componentInstance.assignmentForm.patchValue({ teamId: 'TEAM-TEST', officerSubjectId: 'OFFICER-TEST', reason: 'Reason' });
    fixture.componentInstance.assign();

    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail(), { headers: { ETag: '"4"' } });
    const assignment = http.expectOne(`/api/v1/staff/claims/${claimId}/assignment`);
    expect(assignment.request.headers.get('If-Match')).toBe('"4"');
    expect(assignment.request.body).toEqual({ teamId: 'TEAM-TEST', officerSubjectId: 'OFFICER-TEST', reason: 'Reason' });
    assignment.flush({ claimId, claimNumber: 'CL-1', status: 'Submitted', version: 5 }, { headers: { ETag: '"5"' } });
    expect(fixture.componentInstance.etag()).toBe('"5"');
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush({
      ...staffDetail(),
      assignment: { teamId: 'TEAM-TEST', officerSubjectId: 'OFFICER-TEST' },
    }, { headers: { ETag: '"5"' } });
    fixture.detectChanges();

    expect(fixture.componentInstance.detail()?.assignment?.teamId).toBe('TEAM-TEST');
    expect(fixture.componentInstance.etag()).toBe('"5"');
  });

  it('records an assessment while omitting the optional reserve when absent', () => {
    const fixture = TestBed.createComponent(OfficerWorkbenchPage);
    fixture.detectChanges();
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail(), { headers: { ETag: '"1"' } });
    fixture.componentInstance.assessmentForm.patchValue({ assessmentType: 'Review', rationale: 'Assessment rationale' });
    fixture.componentInstance.recordAssessment();

    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail(), { headers: { ETag: '"2"' } });
    const assessment = http.expectOne(`/api/v1/staff/claims/${claimId}/assessments`);
    expect(assessment.request.headers.get('If-Match')).toBe('"2"');
    expect(assessment.request.body).toEqual({ assessmentType: 'Review', rationale: 'Assessment rationale' });
    assessment.flush({ claimId, claimNumber: 'CL-1', status: 'Assessment', version: 3 }, { headers: { ETag: '"3"' } });
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail('Assessment'), { headers: { ETag: '"3"' } });

    expect(fixture.componentInstance.etag()).toBe('"3"');
    expect(fixture.componentInstance.actionSuccess()).toContain('details refreshed');
  });

  it('loads the latest detail before review and never retries a stale write', () => {
    const fixture = TestBed.createComponent(OfficerWorkbenchPage);
    fixture.detectChanges();
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail(), { headers: { ETag: '"1"' } });
    fixture.componentInstance.startReview();
    fixture.componentInstance.startReview();
    fixture.detectChanges();
    expect(fixture.componentInstance.pendingAction()).toBe('review');
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.find((button) => button.textContent?.includes('Working…'))?.disabled).toBe(true);
    const beforeAction = http.expectOne(`/api/v1/staff/claims/${claimId}`);
    beforeAction.flush({ ...staffDetail(), version: 2 }, { headers: { ETag: '"2"' } });
    const review = http.expectOne(`/api/v1/staff/claims/${claimId}/review`);
    expect(review.request.method).toBe('POST');
    expect(review.request.body).toBeNull();
    expect(review.request.headers.get('If-Match')).toBe('"2"');
    review.flush({ title: 'Conflict', detail: 'Claim changed.' }, { status: 409, statusText: 'Conflict' });
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush({ ...staffDetail(), version: 3 }, { headers: { ETag: '"3"' } });
    fixture.detectChanges();

    expect(fixture.componentInstance.etag()).toBe('"3"');
    expect(fixture.nativeElement.textContent).toContain('claim changed while you were viewing it');
    http.expectNone((request) => request.method === 'POST');
  });

  it('reloads after an uncertain network write without replaying it', () => {
    const fixture = TestBed.createComponent(OfficerWorkbenchPage);
    fixture.detectChanges();
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail(), { headers: { ETag: '"1"' } });
    fixture.componentInstance.startReview();
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail(), { headers: { ETag: '"2"' } });
    http.expectOne(`/api/v1/staff/claims/${claimId}/review`).error(new ProgressEvent('timeout'));
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail(), { headers: { ETag: '"2"' } });
    fixture.detectChanges();

    expect(fixture.componentInstance.actionError()).toContain('outcome is unclear');
    expect(fixture.componentInstance.etag()).toBe('"2"');
    http.expectNone((request) => request.method === 'POST');
  });

  it('shows backend invalid-state Problems without retrying the action', () => {
    const fixture = TestBed.createComponent(OfficerWorkbenchPage);
    fixture.detectChanges();
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail(), { headers: { ETag: '"1"' } });
    fixture.componentInstance.resumeReview();
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail(), { headers: { ETag: '"2"' } });
    http.expectOne(`/api/v1/staff/claims/${claimId}/resume-review`).flush(
      { title: 'Bad Request', detail: 'Resume review is not allowed in this state.' },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.actionError()).toContain('Resume review is not allowed in this state.');
    expect(fixture.componentInstance.pendingAction()).toBeNull();
    http.expectNone((request) => request.method === 'POST');
  });

  it('requires decision confirmation and describes settlement as workflow-only', () => {
    const fixture = TestBed.createComponent(OfficerWorkbenchPage);
    fixture.detectChanges();
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail(), { headers: { ETag: '"1"' } });

    fixture.componentInstance.decisionForm.patchValue({ type: 'Rejected', reason: 'Not covered' });
    fixture.componentInstance.prepareDecision();
    expect(fixture.componentInstance.pendingConfirmation()).toBe('Rejected');
    http.expectNone((request) => request.method === 'POST');
    fixture.componentInstance.confirmDecision();
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail(), { headers: { ETag: '"2"' } });
    const decision = http.expectOne(`/api/v1/staff/claims/${claimId}/decision`);
    expect(decision.request.body).toEqual({ type: 'Rejected', reason: 'Not covered' });
    expect(decision.request.headers.get('If-Match')).toBe('"2"');
    decision.flush({ claimId, claimNumber: 'CL-1', status: 'Rejected', version: 3 }, { headers: { ETag: '"3"' } });
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail('Rejected'), { headers: { ETag: '"3"' } });

    fixture.componentInstance.settlementForm.patchValue({ reference: 'workflow-reference' });
    fixture.componentInstance.prepareSettlement();
    expect(fixture.componentInstance.pendingConfirmation()).toBe('Settlement');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('It does not record or confirm a payment.');
    http.expectNone((request) => request.method === 'POST');
    fixture.componentInstance.confirmSettlement();
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail('Rejected'), { headers: { ETag: '"3"' } });
    const settlement = http.expectOne(`/api/v1/staff/claims/${claimId}/settlement-workflow`);
    expect(settlement.request.body).toEqual({ reference: 'workflow-reference' });
    expect(settlement.request.headers.get('If-Match')).toBe('"3"');
    settlement.flush({ claimId, claimNumber: 'CL-1', status: 'Settled', version: 4 }, { headers: { ETag: '"4"' } });
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail('Settled'), { headers: { ETag: '"4"' } });
  });

  it('blocks assignment when no approved local directory is configured', async () => {
    await configureTestBed({ ...configuredSettings, staffDirectory: { teams: [] } });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(OfficerWorkbenchPage);
    fixture.detectChanges();
    http.expectOne(`/api/v1/staff/claims/${claimId}`).flush(staffDetail(), { headers: { ETag: '"1"' } });
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const unavailable = buttons.find((button) => button.textContent?.includes('Assignment unavailable'));
    expect(fixture.nativeElement.textContent).toContain('Assignment directory is not configured');
    expect(unavailable?.disabled).toBe(true);
  });
});

async function configureTestBed(settings: AppSettings): Promise<void> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [OfficerWorkbenchPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: SETTINGS, useValue: settings },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ claimId }) } } },
    ],
  }).compileComponents();
}
