import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetails } from '../../core/claims-api';
import { TimeoutError } from 'rxjs';

export function claimantErrorMessage(error: unknown): string {
  if (error instanceof TimeoutError) return 'The request timed out. Check your connection and try again.';
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'The service could not be reached. Check your connection and try again.';
    if (error.status === 401) return 'Your session has expired or you are not signed in. Sign in again to continue.';
    if (error.status === 403) return 'You do not have permission to access this claim.';
    if (error.status === 404) return 'This claim could not be found or is no longer available to you.';
    if (error.status === 409) return 'This claim changed while you were viewing it. The latest details are being reloaded; review them before trying again.';
    if (error.status === 400) return problemText(error.error) || 'The server rejected some of the information. Review the validation messages.';
    if (error.status >= 500) return 'The claims service is temporarily unavailable. Try again later.';
    return problemText(error.error) || 'The request could not be completed.';
  }
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

export function serverValidationMessages(error: unknown): string[] {
  const problem = problemDetails(error);
  if (!problem?.errors) return [];
  return Object.entries(problem.errors).flatMap(([field, messages]) =>
    messages.map((message) => `${field}: ${message}`)
  );
}

export function isAmbiguousWriteOutcome(error: unknown): boolean {
  return error instanceof TimeoutError ||
    (error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500));
}

function problemText(value: unknown): string {
  const problem = asProblemDetails(value);
  return [problem?.title, problem?.detail].filter((part): part is string => !!part).join(': ');
}

function problemDetails(error: unknown): ProblemDetails | null {
  return error instanceof HttpErrorResponse ? asProblemDetails(error.error) : null;
}

function asProblemDetails(value: unknown): ProblemDetails | null {
  return typeof value === 'object' && value !== null ? value as ProblemDetails : null;
}
