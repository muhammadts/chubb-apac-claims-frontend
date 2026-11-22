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
    api.staffQueue({ market: 'MOCK', status: 'Submitted', pageSize: 5, cursor: 'opaque' }).subscribe((value) => result = value);
    const request = http.expectOne((r) => r.url === '/api/v1/staff/claims');
    expect(request.request.params.keys()).toEqual(['market', 'status', 'pageSize', 'cursor']);
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

  it('requires response ETags on reads', () => {
    let failure: unknown;
    api.claimantDetail('11111111-1111-4111-8111-111111111111').subscribe({ error: (error) => failure = error });
    http.expectOne('/api/v1/claims/11111111-1111-4111-8111-111111111111').flush({ claimId: '11111111-1111-4111-8111-111111111111' });
    expect(failure).toEqual(new Error('The API response did not include an ETag.'));
  });
});
