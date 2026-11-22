import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import { claimantErrorMessage, isAmbiguousWriteOutcome } from './claimant-errors';

describe('claimant request errors', () => {
  it('distinguishes authorization, missing-claim, conflict, and timeout states', () => {
    expect(claimantErrorMessage(new HttpErrorResponse({ status: 401 }))).toContain('session has expired');
    expect(claimantErrorMessage(new HttpErrorResponse({ status: 403 }))).toContain('permission');
    expect(claimantErrorMessage(new HttpErrorResponse({ status: 404 }))).toContain('could not be found');
    expect(claimantErrorMessage(new HttpErrorResponse({ status: 409 }))).toContain('claim changed');
    expect(claimantErrorMessage(new TimeoutError())).toContain('timed out');
  });

  it('treats a timed-out or disconnected write as ambiguous', () => {
    expect(isAmbiguousWriteOutcome(new TimeoutError())).toBe(true);
    expect(isAmbiguousWriteOutcome(new HttpErrorResponse({ status: 0 }))).toBe(true);
    expect(isAmbiguousWriteOutcome(new HttpErrorResponse({ status: 400 }))).toBe(false);
  });
});
