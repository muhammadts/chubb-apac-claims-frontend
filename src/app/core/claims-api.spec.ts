import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ClaimsApi } from './claims-api';

describe('ClaimsApi contract', () => {
  let api: ClaimsApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ClaimsApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('preserves exact staff query names and page response shape', () => {
    let result: unknown;
    api.staffQueue({
      market: 'APAC',
      status: 'Submitted',
      teamId: 'team-configured',
      officerId: 'officer-configured',
      submittedFrom: '2026-01-01',
      submittedTo: '2026-01-31',
      incidentFrom: '2025-12-01',
      incidentTo: '2025-12-31',
      claimNumber: 'CL-1',
      pageSize: 5,
      cursor: 'opaque',
    }).subscribe((value) => result = value);
    const request = http.expectOne((r) => r.url === '/api/v1/staff/claims');
    expect(request.request.params.keys()).toEqual([
      'market', 'status', 'teamId', 'officerId', 'submittedFrom', 'submittedTo',
      'incidentFrom', 'incidentTo', 'claimNumber', 'pageSize', 'cursor',
    ]);
    expect(request.request.params.get('cursor')).toBe('opaque');
    request.flush({ items: [], nextCursor: null });
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('sends the exact quoted If-Match value and returns rotated ETag', () => {
    let result: unknown;
    api.review('11111111-1111-4111-8111-111111111111', '"7"').subscribe((value) => result = value);
    const request = http.expectOne('/api/v1/staff/claims/11111111-1111-4111-8111-111111111111/review');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    expect(request.request.headers.get('If-Match')).toBe('"7"');
    request.flush({ claimId: '11111111-1111-4111-8111-111111111111', claimNumber: 'X', status: 'InReview', version: 8 }, { headers: { ETag: '"8"' } });
    expect(result).toEqual({ body: { claimId: '11111111-1111-4111-8111-111111111111', claimNumber: 'X', status: 'InReview', version: 8 }, etag: '"8"' });
  });

  it('reads staff detail with its ETag and preserves the staff-only projection', () => {
    let result: unknown;
    api.staffDetail('11111111-1111-4111-8111-111111111111').subscribe((response) => result = response);
    const request = http.expectOne('/api/v1/staff/claims/11111111-1111-4111-8111-111111111111');
    request.flush({ claimId: '11111111-1111-4111-8111-111111111111', decisionRationale: 'Staff-only rationale' }, { headers: { ETag: '"12"' } });
    expect(result).toEqual({
      body: { claimId: '11111111-1111-4111-8111-111111111111', decisionRationale: 'Staff-only rationale' },
      etag: '"12"',
    });
  });

  it('uses the exact documented staff routes, bodies, and If-Match value', () => {
    const claimId = '11111111-1111-4111-8111-111111111111';
    const etag = '"17"';
    const actions = [
      { path: `/api/v1/staff/claims/${claimId}/assignment`, body: { teamId: 'configured-team', officerSubjectId: 'configured-officer', reason: 'Reason' }, run: () => api.assignment(claimId, { teamId: 'configured-team', officerSubjectId: 'configured-officer', reason: 'Reason' }, etag) },
      { path: `/api/v1/staff/claims/${claimId}/review`, body: null, run: () => api.review(claimId, etag) },
      { path: `/api/v1/staff/claims/${claimId}/information-requests`, body: { question: 'Question' }, run: () => api.informationRequest(claimId, { question: 'Question' }, etag) },
      { path: `/api/v1/staff/claims/${claimId}/resume-review`, body: null, run: () => api.resumeReview(claimId, etag) },
      { path: `/api/v1/staff/claims/${claimId}/assessments`, body: { assessmentType: 'Review', rationale: 'Rationale' }, run: () => api.assessment(claimId, { assessmentType: 'Review', rationale: 'Rationale' }, etag) },
      { path: `/api/v1/staff/claims/${claimId}/decision`, body: { type: 'Approved', reason: 'Reason' }, run: () => api.decision(claimId, { type: 'Approved', reason: 'Reason' }, etag) },
      { path: `/api/v1/staff/claims/${claimId}/internal-notes`, body: { noteText: 'Private note' }, run: () => api.internalNote(claimId, { noteText: 'Private note' }, etag) },
      { path: `/api/v1/staff/claims/${claimId}/settlement-workflow`, body: {}, run: () => api.settlementWorkflow(claimId, {}, etag) },
    ];
    for (const action of actions) {
      action.run().subscribe();
      const request = http.expectOne(action.path);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(action.body);
      expect(request.request.headers.get('If-Match')).toBe(etag);
      request.flush({ claimId, claimNumber: 'CL-1', status: 'InReview', version: 18 }, { headers: { ETag: '"18"' } });
    }
  });

  it('requires response ETags on reads', () => {
    let failure: unknown;
    api.claimantDetail('11111111-1111-4111-8111-111111111111').subscribe({ error: (error) => failure = error });
    http.expectOne('/api/v1/claims/11111111-1111-4111-8111-111111111111').flush({ claimId: '11111111-1111-4111-8111-111111111111' });
    expect(failure).toEqual(new Error('The API response did not include an ETag.'));
  });

  it('submits only the fixed motor DTO and returns the submission ETag', () => {
    const body = {
      marketCode: 'APPROVED-MARKET',
      lineOfBusiness: 'Motor' as const,
      contact: { name: 'Claimant', email: 'claimant@example.invalid' },
      incident: { occurredAt: '2026-01-15T10:00:00.000Z', description: 'Incident description' },
      motor: {},
    };
    let result: unknown;
    api.submitClaim(body).subscribe((response) => result = response);
    const request = http.expectOne('/api/v1/claims');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    expect(Object.keys(request.request.body).sort()).toEqual(['contact', 'incident', 'lineOfBusiness', 'marketCode', 'motor']);
    request.flush({ claimId: '11111111-1111-4111-8111-111111111111', claimNumber: 'CL-1', status: 'Submitted', version: 1 }, { headers: { ETag: '"1"' } });
    expect(result).toEqual({
      body: { claimId: '11111111-1111-4111-8111-111111111111', claimNumber: 'CL-1', status: 'Submitted', version: 1 },
      etag: '"1"',
    });
  });

  it('uses the detail ETag for claimant information responses and returns its rotation', () => {
    let result: unknown;
    api.respondToRequest('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'More detail', '"8"')
      .subscribe((response) => result = response);
    const request = http.expectOne('/api/v1/claims/11111111-1111-4111-8111-111111111111/information-requests/33333333-3333-4333-8333-333333333333/responses');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ responseText: 'More detail' });
    expect(request.request.headers.get('If-Match')).toBe('"8"');
    request.flush({ claimId: '11111111-1111-4111-8111-111111111111', claimNumber: 'CL-1', status: 'InReview', version: 9 }, { headers: { ETag: '"9"' } });
    expect(result).toEqual({
      body: { claimId: '11111111-1111-4111-8111-111111111111', claimNumber: 'CL-1', status: 'InReview', version: 9 },
      etag: '"9"',
    });
  });

  it('omits optional response text when it was not provided', () => {
    api.respondToRequest('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', undefined, '"8"').subscribe();
    const request = http.expectOne('/api/v1/claims/11111111-1111-4111-8111-111111111111/information-requests/33333333-3333-4333-8333-333333333333/responses');
    expect(request.request.body).toEqual({});
    expect(request.request.headers.get('If-Match')).toBe('"8"');
    request.flush({ claimId: '11111111-1111-4111-8111-111111111111', claimNumber: 'CL-1', status: 'InReview', version: 9 }, { headers: { ETag: '"9"' } });
  });

  it('forwards opaque claimant-list cursors without interpreting them', () => {
    api.claimantClaims(20, 'cursor/from-server==').subscribe();
    const request = http.expectOne((r) => r.url === '/api/v1/claims');
    expect(request.request.params.get('cursor')).toBe('cursor/from-server==');
    request.flush({ items: [], nextCursor: null });
  });
});
