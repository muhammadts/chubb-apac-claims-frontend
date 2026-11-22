import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ClaimantDetail, ClaimsApi, InformationRequest } from '../../core/claims-api';
import { claimantErrorMessage, isAmbiguousWriteOutcome } from './claimant-errors';

@Component({
  selector: 'app-claim-detail-page',
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page">
      <a class="back-link" routerLink="/claimant/claims">← Your claims</a>
      @if (loading() && !detail()) {
        <p role="status" aria-live="polite">Loading claim details…</p>
      }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (responseNotice()) { <p class="success notice" role="status" aria-live="polite">{{ responseNotice() }}</p> }
      @if (detail(); as claim) {
        <header class="heading">
          <div>
            <p class="eyebrow">Claimant workspace</p>
            <h1>Claim {{ claim.claimNumber }}</h1>
            <p class="meta">{{ claim.lineOfBusiness }} · {{ claim.marketCode }} · <span class="status">{{ statusLabel() }}</span></p>
          </div>
          <button type="button" (click)="refresh()" [disabled]="loading() || pendingRequestId() !== null">Refresh claim</button>
        </header>
        @if (refreshedAt(); as refreshed) { <p class="refresh-time">Last refreshed {{ refreshed.toLocaleTimeString() }}</p> }

        @if (openRequests().length) {
          <section class="requests open-requests" aria-labelledby="open-requests-title">
            <h2 id="open-requests-title">Action needed: information requested</h2>
            <p>Review each open request and send a text response. File uploads are not available.</p>
            @for (request of openRequests(); track request.requestId) {
              <article class="request">
                <h3>{{ request.question }}</h3>
                <p>Requested <time [attr.datetime]="request.createdAt">{{ request.createdAt | date:'medium' }}</time></p>
                @if (responseSuccess()[request.requestId]) { <p class="success" role="status">{{ responseSuccess()[request.requestId] }}</p> }
                @if (responseErrors()[request.requestId]) { <p class="error" role="alert">{{ responseErrors()[request.requestId] }}</p> }
                <label [for]="'response-' + request.requestId">Your response <span class="optional">(optional, up to 4,000 characters)</span></label>
                <textarea [id]="'response-' + request.requestId" rows="4" maxlength="4000"
                  [value]="responseTexts()[request.requestId] ?? ''"
                  (input)="setResponse(request.requestId, $any($event.target).value)"
                  [disabled]="pendingRequestId() === request.requestId"></textarea>
                <p class="counter">{{ (responseTexts()[request.requestId] ?? '').length }} / 4,000</p>
                <button type="button" class="primary" (click)="respond(request)" [disabled]="pendingRequestId() !== null || loading() || !detailFresh()">
                  {{ pendingRequestId() === request.requestId ? 'Sending…' : 'Send response' }}
                </button>
              </article>
            }
          </section>
        } @else {
          <section class="requests" aria-labelledby="requests-title">
            <h2 id="requests-title">Information requests</h2>
            @if (claim.informationRequests.length) {
              <ul>
                @for (request of claim.informationRequests; track request.requestId) {
                  <li>{{ request.question }} — {{ request.status }} <time [attr.datetime]="request.createdAt">{{ request.createdAt | date:'medium' }}</time></li>
                }
              </ul>
            } @else { <p>There are no information requests for this claim.</p> }
          </section>
        }

        <section class="card" aria-labelledby="status-title">
          <div class="section-heading">
            <h2 id="status-title">Current status</h2>
            @if (statusLoading()) { <span role="status">Refreshing status…</span> }
          </div>
          <p class="status-large">{{ statusLabel() }}</p>
          <p>Submitted <time [attr.datetime]="claim.submittedAt">{{ claim.submittedAt | date:'medium' }}</time></p>
          @if (statusError()) { <p class="error" role="alert">{{ statusError() }}</p> }
        </section>

        @if (claim.decision; as decision) {
          <section class="card decision" aria-labelledby="decision-title">
            <h2 id="decision-title">Decision</h2>
            <p><strong>{{ decision.type }}</strong> · <time [attr.datetime]="decision.date">{{ decision.date | date:'medium' }}</time></p>
            @if (decision.amount; as amount) { <p>Amount: {{ amount.amount }} {{ amount.currency }}</p> }
          </section>
        }

        <section class="card" aria-labelledby="incident-title">
          <h2 id="incident-title">Incident</h2>
          <p><strong>Occurred</strong> · <time [attr.datetime]="claim.incident.occurredAt">{{ claim.incident.occurredAt | date:'medium' }}</time></p>
          @if (claim.reportedAt) { <p><strong>Reported</strong> · <time [attr.datetime]="claim.reportedAt">{{ claim.reportedAt | date:'medium' }}</time></p> }
          <p class="description">{{ claim.incident.description }}</p>
        </section>

        <section class="card" aria-labelledby="contact-title">
          <h2 id="contact-title">Contact details</h2>
          <p>{{ claim.contact.name }} · <a [href]="'mailto:' + claim.contact.email">{{ claim.contact.email }}</a></p>
          @if (claim.contact.phone) { <p>{{ claim.contact.phone }}</p> }
        </section>

        <section class="card" aria-labelledby="line-details-title">
          <h2 id="line-details-title">{{ claim.lineOfBusiness }} details</h2>
          @if (claim.lineOfBusiness === 'Motor') {
            @if (claim.motor; as motor) {
              <dl>
                @if (motor.vehicleRegistration) { <dt>Vehicle registration</dt><dd>{{ motor.vehicleRegistration }}</dd> }
                @if (motor.make) { <dt>Make</dt><dd>{{ motor.make }}</dd> }
                @if (motor.model) { <dt>Model</dt><dd>{{ motor.model }}</dd> }
                @if (motor.modelYear != null) { <dt>Model year</dt><dd>{{ motor.modelYear }}</dd> }
                @if (motor.vehicleUse) { <dt>Vehicle use</dt><dd>{{ motor.vehicleUse }}</dd> }
                @if (motor.drivable != null) { <dt>Drivable</dt><dd>{{ motor.drivable ? 'Yes' : 'No' }}</dd> }
                @if (motor.otherPartyInvolved != null) { <dt>Other party involved</dt><dd>{{ motor.otherPartyInvolved ? 'Yes' : 'No' }}</dd> }
                @if (!hasMotorDetails(motor)) { <dt>Additional details</dt><dd>None provided.</dd> }
              </dl>
            } @else { <p>No motor details were returned for this claim.</p> }
          } @else {
            @if (claim.property; as property) {
              <dl>
                @if (property.propertyType) { <dt>Property type</dt><dd>{{ property.propertyType }}</dd> }
                @if (property.addressLine1) { <dt>Address line 1</dt><dd>{{ property.addressLine1 }}</dd> }
                @if (property.addressLine2) { <dt>Address line 2</dt><dd>{{ property.addressLine2 }}</dd> }
                @if (property.city) { <dt>City</dt><dd>{{ property.city }}</dd> }
                @if (property.region) { <dt>Region</dt><dd>{{ property.region }}</dd> }
                @if (property.postalCode) { <dt>Postal code</dt><dd>{{ property.postalCode }}</dd> }
                @if (property.countryCode) { <dt>Country code</dt><dd>{{ property.countryCode }}</dd> }
                @if (property.lossCause) { <dt>Cause of loss</dt><dd>{{ property.lossCause }}</dd> }
                @if (property.affectedAreaDescription) { <dt>Affected area</dt><dd>{{ property.affectedAreaDescription }}</dd> }
                @if (property.habitable != null) { <dt>Habitable</dt><dd>{{ property.habitable ? 'Yes' : 'No' }}</dd> }
                @if (!hasPropertyDetails(property)) { <dt>Additional details</dt><dd>None provided.</dd> }
              </dl>
            } @else { <p>No property details were returned for this claim.</p> }
          }
        </section>

        <section class="card" aria-labelledby="timeline-title">
          <div class="section-heading">
            <h2 id="timeline-title">Claim timeline</h2>
            @if (timelineLoading()) { <span role="status">Loading timeline…</span> }
          </div>
          @if (timelineError()) { <p class="error" role="alert">{{ timelineError() }}</p> }
          @if (timeline().length) {
            <ol class="timeline">
              @for (item of timeline(); track $index) {
                <li><time [attr.datetime]="item.occurredAt">{{ item.occurredAt | date:'medium' }}</time><p>{{ item.description }}</p></li>
              }
            </ol>
          } @else if (!timelineLoading() && !timelineError()) {
            <p>No timeline activity is available yet.</p>
          }
          @if (timelineCursor()) { <button type="button" (click)="loadMoreTimeline()" [disabled]="timelineLoading()">Load more activity</button> }
        </section>
      }
    </section>
  `,
  styles: [`
    :host { display:block; }
    .page { max-width:900px; margin:clamp(2rem,7vh,5rem) auto; padding:0 clamp(1rem,5vw,3rem) 3rem; }
    .back-link,.heading a { color:#8f1025; font-weight:700; }
    .eyebrow { margin:1.2rem 0 0; color:#a40e28; font-size:.78rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
    h1 { margin:.35rem 0 .5rem; color:#17232e; font-size:clamp(2rem,4vw,3rem); letter-spacing:-.035em; overflow-wrap:anywhere; }
    h2 { margin:0 0 .65rem; font-size:1.25rem; }
    h3 { margin:.2rem 0; font-size:1.05rem; }
    .heading,.section-heading { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
    .meta,.refresh-time,.card p,.request p { color:#586676; line-height:1.5; }
    .status { display:inline-block; padding:.3rem .6rem; border-radius:999px; background:#edf1f5; color:#344454; font-size:.85rem; font-weight:700; }
    .status-large { font-size:1.2rem; font-weight:700; }
    button { min-height:2.75rem; padding:.65rem .9rem; border:1px solid #aeb9c4; border-radius:.35rem; background:#fff; color:#263645; cursor:pointer; font:inherit; font-weight:650; }
    button:disabled { opacity:.65; cursor:wait; }
    .primary { border-color:#9d1228; background:#9d1228; color:#fff; }
    .card,.requests { margin:1.1rem 0; padding:1.2rem; border:1px solid #dce2e8; border-radius:.55rem; background:#fff; }
    .open-requests { border:2px solid #b47900; background:#fff9ea; }
    .open-requests h2 { color:#493b1e; }
    .request { padding:1rem 0; border-top:1px solid #e8dfc8; }
    .request:first-of-type { border-top:0; }
    label { display:block; margin:.8rem 0 .35rem; color:#263645; font-weight:650; }
    .optional,.counter { color:#586676; font-size:.85rem; }
    textarea { width:100%; min-height:6rem; padding:.65rem; border:1px solid #aeb9c4; border-radius:.35rem; font:inherit; resize:vertical; }
    .counter { text-align:right; }
    .success { color:#176435!important; }
    .notice { padding:.85rem; border:1px solid #a9d2b7; border-radius:.4rem; background:#f3fbf5; }
    .error { padding:.85rem; border:1px solid #d8a5a5; border-radius:.4rem; background:#fff2f2; color:#8c1f1f!important; }
    .decision { border-left:4px solid #23834d; }
    .description { white-space:pre-wrap; overflow-wrap:anywhere; }
    dl { display:grid; grid-template-columns:minmax(8rem,.4fr) minmax(0,1fr); gap:.5rem .9rem; }
    dt { color:#586676; font-weight:650; }
    dd { margin:0; overflow-wrap:anywhere; }
    .timeline { margin:1rem 0; padding-left:1.4rem; }
    .timeline li { padding:0 0 .9rem .35rem; }
    .timeline time { color:#586676; font-size:.9rem; }
    .timeline p { margin:.25rem 0; }
    @media (max-width:620px) {
      .page { margin:1.5rem auto; }
      .heading { align-items:flex-start; flex-direction:column; }
      .heading button { width:100%; }
      .card,.requests { padding:.9rem; }
      dl { grid-template-columns:1fr; gap:.15rem; }
      dd { margin-bottom:.55rem; }
    }
  `],
})
export class ClaimDetailPage {
  private readonly api = inject(ClaimsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly claimId = inject(ActivatedRoute).snapshot.paramMap.get('claimId') ?? '';
  readonly detail = signal<ClaimantDetail | null>(null);
  readonly etag = signal('');
  readonly detailFresh = signal(false);
  readonly status = signal<{ status: string; submittedAt: string } | null>(null);
  readonly timeline = signal<Array<{ occurredAt: string; description: string }>>([]);
  readonly timelineCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly statusLoading = signal(false);
  readonly timelineLoading = signal(false);
  readonly error = signal('');
  readonly statusError = signal('');
  readonly timelineError = signal('');
  readonly refreshedAt = signal<Date | null>(null);
  readonly pendingRequestId = signal<string | null>(null);
  readonly responseNotice = signal('');
  readonly responseTexts = signal<Record<string, string>>({});
  readonly responseErrors = signal<Record<string, string>>({});
  readonly responseSuccess = signal<Record<string, string>>({});
  readonly openRequests = computed(() => (this.detail()?.informationRequests ?? []).filter((request) => request.status === 'Open'));
  readonly statusLabel = computed(() => (this.status()?.status ?? this.detail()?.status ?? 'Unknown').replace(/([a-z])([A-Z])/g, '$1 $2'));

  constructor() {
    if (!this.claimId) this.error.set('A claim ID is required to view claim details.');
    else this.loadDetail();
  }

  refresh(): void {
    this.loadDetail();
  }

  loadMoreTimeline(): void {
    const cursor = this.timelineCursor();
    if (cursor && !this.timelineLoading()) this.loadTimeline(cursor, false);
  }

  setResponse(requestId: string, value: string): void {
    this.responseTexts.update((values) => ({ ...values, [requestId]: value }));
  }

  respond(request: InformationRequest): void {
    if (this.pendingRequestId() || this.loading() || !this.detailFresh() || request.status !== 'Open') return;
    if (!this.etag()) {
      this.responseErrors.update((errors) => ({ ...errors, [request.requestId]: 'Reload claim details before responding.' }));
      return;
    }
    this.pendingRequestId.set(request.requestId);
    this.responseNotice.set('');
    this.responseErrors.update((errors) => ({ ...errors, [request.requestId]: '' }));
    this.responseSuccess.update((success) => ({ ...success, [request.requestId]: '' }));
    const responseText = this.responseTexts()[request.requestId] ?? '';
    this.api.respondToRequest(this.claimId, request.requestId, responseText || undefined, this.etag())
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (result) => {
          this.etag.set(result.etag);
          this.responseTexts.update((values) => ({ ...values, [request.requestId]: '' }));
          this.responseSuccess.update((success) => ({ ...success, [request.requestId]: 'Your response was sent.' }));
          this.responseNotice.set('Your response was sent. Claim details are being refreshed.');
          this.pendingRequestId.set(null);
          this.loadDetail();
        },
        error: (error: unknown) => {
          this.pendingRequestId.set(null);
          const uncertain = isAmbiguousWriteOutcome(error) || isMissingEtag(error);
          const message = uncertain
            ? 'We could not confirm whether your response was recorded. Claim details are being reloaded; check the request before responding again.'
            : claimantErrorMessage(error);
          this.responseErrors.update((errors) => ({ ...errors, [request.requestId]: message }));
          if (isConflict(error) || uncertain) this.loadDetail();
        },
      });
  }

  hasMotorDetails(details: NonNullable<ClaimantDetail['motor']>): boolean {
    return Object.values(details).some((value) => value !== undefined && value !== null && value !== '');
  }

  hasPropertyDetails(details: NonNullable<ClaimantDetail['property']>): boolean {
    return Object.values(details).some((value) => value !== undefined && value !== null && value !== '');
  }

  private loadDetail(): void {
    if (!this.claimId || this.loading()) return;
    this.loading.set(true);
    this.detailFresh.set(false);
    this.error.set('');
    this.api.claimantDetail(this.claimId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.detail.set(result.body);
        this.etag.set(result.etag);
        this.detailFresh.set(true);
        this.refreshedAt.set(new Date());
        this.loading.set(false);
        this.loadStatus();
        this.loadTimeline(undefined, true);
      },
      error: (error: unknown) => {
        this.error.set(claimantErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  private loadStatus(): void {
    this.statusLoading.set(true);
    this.statusError.set('');
    this.api.claimantStatus(this.claimId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.status.set({ status: result.body.status, submittedAt: result.body.submittedAt });
        this.statusLoading.set(false);
      },
      error: (error: unknown) => {
        this.statusError.set(claimantErrorMessage(error));
        this.statusLoading.set(false);
      },
    });
  }

  private loadTimeline(cursor: string | undefined, reset: boolean): void {
    this.timelineLoading.set(true);
    this.timelineError.set('');
    this.api.timeline(this.claimId, 20, cursor).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (page) => {
        this.timeline.update((items) => reset ? page.items : [...items, ...page.items]);
        this.timelineCursor.set(page.nextCursor);
        this.timelineLoading.set(false);
      },
      error: (error: unknown) => {
        this.timelineError.set(claimantErrorMessage(error));
        this.timelineLoading.set(false);
      },
    });
  }
}

function isConflict(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 409;
}

function isMissingEtag(error: unknown): boolean {
  return error instanceof Error && error.message === 'The API response did not include an ETag.';
}
