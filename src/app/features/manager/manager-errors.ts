import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import { ProblemDetails } from '../../core/claims-api';

function problemMessage(problem: ProblemDetails): string {
  const fieldMessages = Object.values(problem.errors ?? {}).flat();
  return problem.detail || fieldMessages.join(' ') || problem.title || '';
}

export function managerErrorMessage(error: unknown): string {
  if (error instanceof TimeoutError) return 'The report request timed out. Check your connection and try again.';
  if (!(error instanceof HttpErrorResponse)) return 'The report could not be loaded. Try again.';
  const problem = error.error && typeof error.error === 'object' ? problemMessage(error.error as ProblemDetails) : '';
  if (error.status === 0) return 'The reporting service could not be reached. Check your connection and try again.';
  if (error.status === 401) return 'Your session has expired. Sign in again to view manager reports.';
  if (error.status === 403) return 'Your manager role or market/team scope is not authorized to view this report.';
  if (error.status === 404) return 'This reporting endpoint or resource is unavailable.';
  if (error.status === 400) return problem || 'The reporting request was not accepted. Check the reporting interval.';
  if (error.status >= 500) return problem || 'The reporting service is unavailable. Try again later.';
  return problem || `The report request failed (HTTP ${error.status}).`;
}
