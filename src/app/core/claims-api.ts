import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, timeout } from 'rxjs';

export type ClaimStatus = 'Submitted' | 'InReview' | 'Assessment' | 'AwaitingInformation' | 'Approved' | 'Rejected' | 'Settled';
export type LineOfBusiness = 'Motor' | 'Property';
export interface Page<T> { items: T[]; nextCursor: string | null; }
export interface Money { amount: number; currency: string; }
export interface Contact { name: string; email: string; phone?: string | null; }
export interface Incident { occurredAt: string; description: string; }
export interface MotorDetails { vehicleRegistration?: string | null; make?: string | null; model?: string | null; modelYear?: number | null; vehicleUse?: string | null; drivable?: boolean | null; otherPartyInvolved?: boolean | null; }
export interface PropertyDetails { propertyType?: string | null; addressLine1?: string | null; addressLine2?: string | null; city?: string | null; region?: string | null; postalCode?: string | null; countryCode?: string | null; lossCause?: string | null; affectedAreaDescription?: string | null; habitable?: boolean | null; }
export interface ClaimSubmissionBase { marketCode: string; contact: Contact; incident: Incident; reportedAt?: string | null; }
export type ClaimSubmission = ClaimSubmissionBase & (
  | { lineOfBusiness: 'Motor'; motor: MotorDetails; property?: never }
  | { lineOfBusiness: 'Property'; property: PropertyDetails; motor?: never }
);
export interface ClaimCard { claimId: string; claimNumber: string; marketCode: string; lineOfBusiness: LineOfBusiness; status: ClaimStatus; submittedAt: string; version: number; }
export interface InformationRequest { requestId: string; question: string; status: string; createdAt: string; }
export interface ClaimantDetail extends ClaimCard { reportedAt?: string | null; contact: Contact; incident: Incident; motor?: MotorDetails | null; property?: PropertyDetails | null; decision?: { type: 'Approved' | 'Rejected'; date: string; amount?: Money | null } | null; informationRequests: InformationRequest[]; activities: Array<{ occurredAt: string; description: string }>; }
export interface StaffAssignment { teamId: string; officerSubjectId?: string | null; }
export interface StaffAssessment { assessmentType: string; rationale: string; recommendation?: string | null; reserveEstimate?: Money | null; reserveReason?: string | null; }
export interface StaffInternalNote { noteText: string; createdAt: string; }
export interface StaffActivity { occurredAt: string; description: string; }
export interface StaffDetail extends ClaimCard {
  reportedAt?: string | null;
  contact: Contact;
  incident: Incident;
  motor?: MotorDetails | null;
  property?: PropertyDetails | null;
  decision?: { type: 'Approved' | 'Rejected'; date: string; amount?: Money | null } | null;
  informationRequests: InformationRequest[];
  activities: StaffActivity[];
  assignment?: StaffAssignment | null;
  reserve?: Money | null;
  decisionRationale?: string | null;
  assessments: StaffAssessment[];
  reserveHistory: Money[];
  internalNotes: StaffInternalNote[];
  assignmentHistory: StaffAssignment[];
}
export interface MutationResult { claimId: string; claimNumber: string; status: ClaimStatus; version: number; }
export interface StaffQueueFilters { market?: string; status?: ClaimStatus; teamId?: string; officerId?: string; submittedFrom?: string; submittedTo?: string; incidentFrom?: string; incidentTo?: string; claimNumber?: string; pageSize?: number; cursor?: string; }
export interface AssignmentCommand { teamId: string; officerSubjectId?: string; reason?: string; }
export interface InformationRequestCommand { question: string; }
export interface AssessmentCommand { assessmentType: string; rationale: string; recommendation?: string; reserveEstimate?: Money; reserveReason?: string; }
export interface DecisionCommand { type: 'Approved' | 'Rejected'; reason: string; amount?: Money; }
export interface InternalNoteCommand { noteText: string; }
export interface SettlementWorkflowCommand { amount?: Money; reference?: string; }
export interface ProblemDetails { type?: string; title?: string; status?: number; detail?: string; errors?: Record<string, string[]>; }
export interface AgeingBands { '0-7': number; '8-30': number; '31-90': number; '90+': number; }
export interface WorkloadGroup { marketCode?: string | null; teamId?: string | null; officerSubjectId?: string | null; statusCounts: Partial<Record<ClaimStatus, number>>; unassignedCount: number; ageingBands: AgeingBands; }
export interface WorkloadReport { asOfUtc: string; groups: WorkloadGroup[]; ageingDefinition: string; }
export interface PerformanceReport { fromUtc: string; toUtc: string; decisionCount: number; averageDecisionElapsedDays?: number | null; medianDecisionElapsedDays?: number | null; missingDecisionDurationCount: number; settlementCount: number; averageSettlementElapsedDays?: number | null; missingSettlementDurationCount: number; }
export interface ExposureReport { asOfUtc: string; groups: Array<{ marketCode: string; currency: string; amount: number; claimCount: number }>; missingReserveCount: number; includedStatuses: ClaimStatus[]; assumption: string; }

const API = '/api/v1';
const CLAIM_REQUEST_TIMEOUT_MS = 30_000;
function pageParams(pageSize = 20, cursor?: string): HttpParams {
  let params = new HttpParams().set('pageSize', String(pageSize));
  if (cursor) params = params.set('cursor', cursor);
  return params;
}
function etag(response: HttpResponse<unknown>): string {
  const value = response.headers.get('ETag');
  if (!value) throw new Error('The API response did not include an ETag.');
  return value;
}

@Injectable({ providedIn: 'root' })
export class ClaimsApi {
  private readonly http = inject(HttpClient);
  submitClaim(body: ClaimSubmission): Observable<{ body: MutationResult; etag: string }> {
    return this.http.post<MutationResult>(`${API}/claims`, body, { observe: 'response' }).pipe(timeout({ first: CLAIM_REQUEST_TIMEOUT_MS }), map((r) => ({ body: r.body!, etag: etag(r) })));
  }
  claimantClaims(pageSize = 20, cursor?: string): Observable<Page<ClaimCard>> { return this.http.get<Page<ClaimCard>>(`${API}/claims`, { params: pageParams(pageSize, cursor) }).pipe(timeout({ first: CLAIM_REQUEST_TIMEOUT_MS })); }
  claimantDetail(claimId: string): Observable<{ body: ClaimantDetail; etag: string }> { return this.http.get<ClaimantDetail>(`${API}/claims/${claimId}`, { observe: 'response' }).pipe(timeout({ first: CLAIM_REQUEST_TIMEOUT_MS }), map((r) => ({ body: r.body!, etag: etag(r) }))); }
  claimantStatus(claimId: string): Observable<{ body: { claimId: string; claimNumber: string; status: ClaimStatus; submittedAt: string }; etag: string }> { return this.http.get<{ claimId: string; claimNumber: string; status: ClaimStatus; submittedAt: string }>(`${API}/claims/${claimId}/status`, { observe: 'response' }).pipe(timeout({ first: CLAIM_REQUEST_TIMEOUT_MS }), map((r) => ({ body: r.body!, etag: etag(r) }))); }
  timeline(claimId: string, pageSize = 20, cursor?: string): Observable<Page<{ occurredAt: string; description: string }>> { return this.http.get<Page<{ occurredAt: string; description: string }>>(`${API}/claims/${claimId}/timeline`, { params: pageParams(pageSize, cursor) }).pipe(timeout({ first: CLAIM_REQUEST_TIMEOUT_MS })); }
  respondToRequest(claimId: string, requestId: string, responseText: string | undefined, versionEtag: string): Observable<{ body: MutationResult; etag: string }> { return this.mutate(`${API}/claims/${claimId}/information-requests/${requestId}/responses`, responseText === undefined ? {} : { responseText }, versionEtag); }
  staffQueue(filters: StaffQueueFilters = {}): Observable<Page<ClaimCard>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined) params = params.set(key, String(value));
    return this.http.get<Page<ClaimCard>>(`${API}/staff/claims`, { params }).pipe(timeout({ first: CLAIM_REQUEST_TIMEOUT_MS }));
  }
  staffDetail(claimId: string): Observable<{ body: StaffDetail; etag: string }> { return this.http.get<StaffDetail>(`${API}/staff/claims/${claimId}`, { observe: 'response' }).pipe(timeout({ first: CLAIM_REQUEST_TIMEOUT_MS }), map((r) => ({ body: r.body!, etag: etag(r) }))); }
  assignment(id: string, body: AssignmentCommand, e: string) { return this.mutate(`${API}/staff/claims/${id}/assignment`, body, e); }
  review(id: string, e: string) { return this.mutate(`${API}/staff/claims/${id}/review`, null, e); }
  informationRequest(id: string, body: InformationRequestCommand, e: string) { return this.mutate(`${API}/staff/claims/${id}/information-requests`, body, e); }
  resumeReview(id: string, e: string) { return this.mutate(`${API}/staff/claims/${id}/resume-review`, null, e); }
  assessment(id: string, body: AssessmentCommand, e: string) { return this.mutate(`${API}/staff/claims/${id}/assessments`, body, e); }
  decision(id: string, body: DecisionCommand, e: string) { return this.mutate(`${API}/staff/claims/${id}/decision`, body, e); }
  internalNote(id: string, body: InternalNoteCommand, e: string) { return this.mutate(`${API}/staff/claims/${id}/internal-notes`, body, e); }
  settlementWorkflow(id: string, body: SettlementWorkflowCommand, e: string) { return this.mutate(`${API}/staff/claims/${id}/settlement-workflow`, body, e); }
  workload() { return this.http.get<WorkloadReport>(`${API}/manager/workload`); }
  performance(fromUtc: string, toUtc: string) { const params = new HttpParams().set('fromUtc', fromUtc).set('toUtc', toUtc); return this.http.get<PerformanceReport>(`${API}/manager/performance`, { params }); }
  exposure() { return this.http.get<ExposureReport>(`${API}/manager/exposure`); }
  private mutate(url: string, body: unknown, versionEtag: string): Observable<{ body: MutationResult; etag: string }> {
    const options = { headers: new HttpHeaders({ 'If-Match': versionEtag }), observe: 'response' as const };
    return this.http.post<MutationResult>(url, body, options).pipe(timeout({ first: CLAIM_REQUEST_TIMEOUT_MS }), map((r) => ({ body: r.body!, etag: etag(r) })));
  }
}
