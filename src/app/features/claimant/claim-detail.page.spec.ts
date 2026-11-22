import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { ClaimantDetail, InformationRequest } from '../../core/claims-api';
import { ClaimDetailPage } from './claim-detail.page';

const claimId = '11111111-1111-4111-8111-111111111111';
const requestId = '33333333-3333-4333-8333-333333333333';
const openRequest: InformationRequest = {
  requestId,
  question: 'Please provide additional details.',
  status: 'Open',
  createdAt: '2026-01-15T10:00:00.000Z',
};

function detail(request: InformationRequest = openRequest): ClaimantDetail {
  return {
    claimId,
    claimNumber: 'CL-1',
    marketCode: 'APPROVED-MARKET',
    lineOfBusiness: 'Motor',
    status: 'AwaitingInformation',
    submittedAt: '2026-01-15T10:00:00.000Z',
    version: 1,
    contact: { name: 'Claimant', email: 'claimant@example.invalid' },
    incident: { occurredAt: '2026-01-14T10:00:00.000Z', description: 'Claim incident' },
    motor: null,
    property: null,
    decision: { type: 'Rejected', date: '2026-01-15T11:00:00.000Z', amount: null },
    informationRequests: [request],
    activities: [],
  };
}

describe('ClaimDetailPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClaimDetailPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ claimId }) } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the detail ETag for a pending response, rotates it, and refreshes claimant-safe detail', () => {
    const fixture = TestBed.createComponent(ClaimDetailPage);
    fixture.detectChanges();
    const claimantDetail = Object.assign(detail(), { decisionRationale: 'staff rationale' });
    http.expectOne(`/api/v1/claims/${claimId}`).flush(claimantDetail, { headers: { ETag: '"1"' } });
    http.expectOne(`/api/v1/claims/${claimId}/status`).flush({ claimId, claimNumber: 'CL-1', status: 'AwaitingInformation', submittedAt: detail().submittedAt }, { headers: { ETag: '"status"' } });
    http.expectOne((request) => request.url === `/api/v1/claims/${claimId}/timeline`).flush({ items: [], nextCursor: null });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Action needed: information requested');
    expect(fixture.nativeElement.textContent).not.toContain('staff rationale');
    expect(fixture.nativeElement.textContent).toContain('No motor details were returned');
    const responseField = fixture.nativeElement.querySelector('textarea');
    expect(fixture.nativeElement.querySelector(`label[for="${responseField.id}"]`)).not.toBeNull();
    expect(responseField.getAttribute('maxlength')).toBe('4000');
    fixture.componentInstance.setResponse(requestId, 'More detail');
    fixture.componentInstance.respond(openRequest);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button.primary').disabled).toBe(true);

    const response = http.expectOne(`/api/v1/claims/${claimId}/information-requests/${requestId}/responses`);
    expect(response.request.headers.get('If-Match')).toBe('"1"');
    expect(response.request.body).toEqual({ responseText: 'More detail' });
    response.flush({ claimId, claimNumber: 'CL-1', status: 'InReview', version: 2 }, { headers: { ETag: '"2"' } });
    expect(fixture.componentInstance.etag()).toBe('"2"');

    http.expectOne(`/api/v1/claims/${claimId}`).flush({
      ...detail({ ...openRequest, status: 'Answered' }),
      status: 'InReview',
      version: 2,
    }, { headers: { ETag: '"2"' } });
    http.expectOne(`/api/v1/claims/${claimId}/status`).flush({ claimId, claimNumber: 'CL-1', status: 'InReview', submittedAt: detail().submittedAt }, { headers: { ETag: '"2"' } });
    http.expectOne((request) => request.url === `/api/v1/claims/${claimId}/timeline`).flush({ items: [], nextCursor: null });
    fixture.detectChanges();

    expect(fixture.componentInstance.openRequests()).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('Your response was sent.');
    expect(fixture.nativeElement.textContent).toContain('Rejected');
  });

  it('reloads after a stale ETag conflict and does not retry the response', () => {
    const fixture = TestBed.createComponent(ClaimDetailPage);
    fixture.detectChanges();
    http.expectOne(`/api/v1/claims/${claimId}`).flush(detail(), { headers: { ETag: '"1"' } });
    http.expectOne(`/api/v1/claims/${claimId}/status`).flush({ claimId, claimNumber: 'CL-1', status: 'AwaitingInformation', submittedAt: detail().submittedAt }, { headers: { ETag: '"1"' } });
    http.expectOne((request) => request.url === `/api/v1/claims/${claimId}/timeline`).flush({ items: [], nextCursor: null });

    fixture.componentInstance.respond(openRequest);
    http.expectOne(`/api/v1/claims/${claimId}/information-requests/${requestId}/responses`).flush(
      { title: 'Conflict', detail: 'Claim changed.' },
      { status: 409, statusText: 'Conflict' },
    );
    http.expectOne(`/api/v1/claims/${claimId}`).flush({ ...detail(), version: 2 }, { headers: { ETag: '"2"' } });
    http.expectOne(`/api/v1/claims/${claimId}/status`).flush({ claimId, claimNumber: 'CL-1', status: 'AwaitingInformation', submittedAt: detail().submittedAt }, { headers: { ETag: '"2"' } });
    http.expectOne((request) => request.url === `/api/v1/claims/${claimId}/timeline`).flush({ items: [], nextCursor: null });
    fixture.detectChanges();

    expect(fixture.componentInstance.etag()).toBe('"2"');
    expect(fixture.componentInstance.openRequests()).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('claim changed while you were viewing it');
    http.expectNone((request) => request.method === 'POST');
  });
});
