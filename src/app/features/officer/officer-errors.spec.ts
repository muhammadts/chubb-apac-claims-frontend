import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import { isAmbiguousStaffWrite, officerErrorMessage, officerValidationMessages } from './officer-errors';

describe('officer request errors', () => {
  it('explains authorization, scope, missing claims, conflicts, and invalid state', () => {
    expect(officerErrorMessage(new HttpErrorResponse({ status: 401 }))).toContain('session has expired');
    expect(officerErrorMessage(new HttpErrorResponse({ status: 403 }))).toContain('team/market scope');
    expect(officerErrorMessage(new HttpErrorResponse({ status: 404 }))).toContain('no longer available');
    expect(officerErrorMessage(new HttpErrorResponse({ status: 409 }))).toContain('claim changed');
    expect(officerErrorMessage(new HttpErrorResponse({
      status: 400,
      error: { title: 'Bad Request', detail: 'Review is not allowed in this state.' },
    }))).toContain('Review is not allowed in this state.');
    expect(officerValidationMessages(new HttpErrorResponse({
      status: 400,
      error: { errors: { rationale: ['Required.'] } },
    }))).toEqual(['rationale: Required.']);
  });

  it('distinguishes ambiguous writes from validation failures', () => {
    expect(isAmbiguousStaffWrite(new TimeoutError())).toBe(true);
    expect(isAmbiguousStaffWrite(new HttpErrorResponse({ status: 0 }))).toBe(true);
    expect(isAmbiguousStaffWrite(new HttpErrorResponse({ status: 500 }))).toBe(true);
    expect(isAmbiguousStaffWrite(new HttpErrorResponse({ status: 400 }))).toBe(false);
  });
});
