import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ClaimListPage } from './claim-list.page';

describe('ClaimListPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClaimListPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('highlights awaiting information and submits the server cursor unchanged', async () => {
    const fixture = TestBed.createComponent(ClaimListPage);
    fixture.detectChanges();
    http.expectOne((request) => request.url === '/api/v1/claims' && request.params.get('pageSize') === '20').flush({
      items: [{
        claimId: '11111111-1111-4111-8111-111111111111',
        claimNumber: 'CL-1',
        marketCode: 'APPROVED-MARKET',
        lineOfBusiness: 'Motor',
        status: 'AwaitingInformation',
        submittedAt: '2026-01-15T10:00:00.000Z',
        version: 1,
      }],
      nextCursor: 'opaque/cursor',
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Claim is awaiting information.');
    fixture.componentInstance.loadMore();
    const more = http.expectOne((request) => request.url === '/api/v1/claims' && request.params.get('cursor') === 'opaque/cursor');
    more.flush({ items: [], nextCursor: null });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.nextCursor()).toBeNull();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Your claims');
  });

  it('announces an empty result without creating claim data locally', async () => {
    const fixture = TestBed.createComponent(ClaimListPage);
    fixture.detectChanges();
    http.expectOne((request) => request.url === '/api/v1/claims').flush({ items: [], nextCursor: null });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[aria-labelledby="empty-title"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No claims yet');
  });
});
