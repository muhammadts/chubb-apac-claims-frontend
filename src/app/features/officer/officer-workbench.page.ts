import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, switchMap, tap } from 'rxjs';
import { AppSettings, SETTINGS } from '../../core/auth';
import {
  AssessmentCommand,
  ClaimsApi,
  DecisionCommand,
  MutationResult,
  Money,
  StaffDetail,
} from '../../core/claims-api';
import { isAmbiguousStaffWrite, officerErrorMessage, officerValidationMessages } from './officer-errors';

type PendingConfirmation = 'Approved' | 'Rejected' | 'Settlement' | null;
type StaffAction = (etag: string) => Observable<{ body: MutationResult; etag: string }>;

@Component({
  selector: 'app-officer-workbench-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="page">
      <a routerLink="/officer/queue" class="back-link">← Claims queue</a>
      @if (loading() && !detail()) { <p role="status" aria-live="polite">Loading claim workbench…</p> }
      @if (pageError()) { <p class="error" role="alert">{{ pageError() }}</p> }
      @if (detail(); as claim) {
        <header class="heading">
          <div>
            <p class="eyebrow">Officer workspace</p>
            <h1>Claim {{ claim.claimNumber }}</h1>
            <p class="meta">{{ claim.lineOfBusiness }} · {{ claim.marketCode }} · <span class="status">{{ statusLabel() }}</span></p>
          </div>
          <button type="button" (click)="refresh()" [disabled]="loading() || pendingAction() !== null">Refresh claim</button>
        </header>
        @if (refreshedAt(); as refreshed) { <p class="refresh-time">Last refreshed {{ refreshed.toLocaleTimeString() }}</p> }
        @if (actionSuccess()) { <p class="success" role="status" aria-live="polite">{{ actionSuccess() }}</p> }
        @if (actionError()) {
          <section class="error" role="alert" aria-labelledby="action-error-title">
            <h2 id="action-error-title">Action not confirmed</h2>
            <p>{{ actionError() }}</p>
            @if (validationErrors().length) { <ul>@for (message of validationErrors(); track $index) { <li>{{ message }}</li> }</ul> }
          </section>
        }

        <div class="facts-grid">
          <section class="card" aria-labelledby="claimant-title">
            <h2 id="claimant-title">Claimant and contact</h2>
            <p><strong>{{ claim.contact.name }}</strong></p>
            <p><a [href]="'mailto:' + claim.contact.email">{{ claim.contact.email }}</a></p>
            @if (claim.contact.phone) { <p>{{ claim.contact.phone }}</p> }
          </section>
          <section class="card" aria-labelledby="incident-title">
            <h2 id="incident-title">Incident</h2>
            <p><strong>Occurred</strong> · <time [attr.datetime]="claim.incident.occurredAt">{{ claim.incident.occurredAt | date:'medium' }}</time></p>
            @if (claim.reportedAt) { <p><strong>Reported</strong> · <time [attr.datetime]="claim.reportedAt">{{ claim.reportedAt | date:'medium' }}</time></p> }
            <p class="description">{{ claim.incident.description }}</p>
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
                  @if (!hasDetails(motor)) { <dt>Additional details</dt><dd>None provided.</dd> }
                </dl>
              } @else { <p>No motor details were returned.</p> }
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
                  @if (!hasDetails(property)) { <dt>Additional details</dt><dd>None provided.</dd> }
                </dl>
              } @else { <p>No property details were returned.</p> }
            }
          </section>
          <section class="card" aria-labelledby="assignment-current-title">
            <h2 id="assignment-current-title">Current assignment</h2>
            @if (claim.assignment) {
              <p>Team ID: {{ claim.assignment.teamId }}</p>
              <p>Officer ID: {{ claim.assignment.officerSubjectId || 'No officer assigned' }}</p>
            } @else { <p>Unassigned</p> }
          </section>
          <section class="card" aria-labelledby="reserve-title">
            <h2 id="reserve-title">Current reserve</h2>
            @if (claim.reserve; as reserve) { <p class="money">{{ reserve.amount }} {{ reserve.currency }}</p> }
            @else { <p>No reserve recorded.</p> }
          </section>
        </div>

        @if (claim.decision; as decision) {
          <section class="card staff-only" aria-labelledby="decision-title">
            <p class="staff-label">Staff-only decision details</p>
            <h2 id="decision-title">{{ decision.type }} decision</h2>
            <p>Recorded <time [attr.datetime]="decision.date">{{ decision.date | date:'medium' }}</time></p>
            @if (decision.amount; as amount) { <p>Amount: {{ amount.amount }} {{ amount.currency }}</p> }
            @if (claim.decisionRationale) { <h3>Staff-only decision rationale</h3><p class="description">{{ claim.decisionRationale }}</p> }
          </section>
        }

        <section class="card" aria-labelledby="requests-title">
          <h2 id="requests-title">Information requests</h2>
          @if (claim.informationRequests.length) {
            <ul>@for (request of claim.informationRequests; track request.requestId) {
              <li><strong>{{ request.status }}</strong> · {{ request.question }} · <time [attr.datetime]="request.createdAt">{{ request.createdAt | date:'medium' }}</time></li>
            }</ul>
          } @else { <p>No information requests are recorded.</p> }
        </section>

        <section class="workflows" aria-labelledby="workflow-title">
          <h2 id="workflow-title">Claim actions</h2>
          <div class="workflow-grid">
            <section class="action-card" aria-labelledby="assignment-title">
              <h3 id="assignment-title">Assignment / reassignment</h3>
              @if (!teams.length) {
                <p class="setup" role="status">Assignment directory is not configured. Add approved team and officer choices to runtime configuration before assigning.</p>
                <button type="button" disabled>Assignment unavailable</button>
              } @else {
                <form [formGroup]="assignmentForm" (ngSubmit)="assign()">
                  <div class="field">
                    <label for="assignTeam">Team</label>
                    <select id="assignTeam" formControlName="teamId" required (change)="teamChanged()">
                      <option value="">Choose a configured team</option>
                      @for (team of teams; track team.teamId) { <option [value]="team.teamId">{{ team.displayName }} ({{ team.teamId }})</option> }
                    </select>
                  </div>
                  <div class="field">
                    <label for="assignOfficer">Officer <span class="optional">(optional)</span></label>
                    <select id="assignOfficer" formControlName="officerSubjectId">
                      <option value="">No officer assigned</option>
                      @for (officer of officersForTeam(); track officer.subjectId) { <option [value]="officer.subjectId">{{ officer.displayName }} ({{ officer.subjectId }})</option> }
                    </select>
                  </div>
                  <div class="field"><label for="assignmentReason">Reason <span class="optional">(optional)</span></label><textarea id="assignmentReason" formControlName="reason" rows="2"></textarea></div>
                  <button type="submit" [disabled]="actionsDisabled()">{{ busyLabel('Assign claim', 'assignment') }}</button>
                </form>
              }
            </section>

            <section class="action-card" aria-labelledby="review-title">
              <h3 id="review-title">Review</h3>
              <p>Use the backend response to determine whether each workflow transition is currently allowed.</p>
              <div class="actions">
                <button type="button" (click)="startReview()" [disabled]="actionsDisabled()">{{ busyLabel('Start review', 'review') }}</button>
                <button type="button" (click)="resumeReview()" [disabled]="actionsDisabled()">{{ busyLabel('Resume review', 'resumeReview') }}</button>
              </div>
            </section>

            <section class="action-card" aria-labelledby="information-request-title">
              <h3 id="information-request-title">Request information</h3>
              <form [formGroup]="informationForm" (ngSubmit)="requestInformation()">
                <div class="field"><label for="question">Question</label><textarea id="question" formControlName="question" rows="3" required></textarea></div>
                <button type="submit" [disabled]="actionsDisabled()">{{ busyLabel('Send request', 'informationRequest') }}</button>
              </form>
            </section>

            <section class="action-card" aria-labelledby="assessment-title">
              <h3 id="assessment-title">Record assessment / reserve</h3>
              <form [formGroup]="assessmentForm" (ngSubmit)="recordAssessment()">
                <div class="field"><label for="assessmentType">Assessment type</label><input id="assessmentType" formControlName="assessmentType" required></div>
                <div class="field"><label for="assessmentRationale">Staff-only assessment rationale</label><textarea id="assessmentRationale" formControlName="rationale" rows="3" required></textarea></div>
                <div class="field"><label for="recommendation">Recommendation <span class="optional">(optional)</span></label><input id="recommendation" formControlName="recommendation"></div>
                <div class="money-fields">
                  <div class="field"><label for="reserveEstimate">Reserve estimate <span class="optional">(optional)</span></label><input id="reserveEstimate" type="number" formControlName="reserveAmount"></div>
                  <div class="field"><label for="reserveCurrency">Reserve currency</label><input id="reserveCurrency" formControlName="reserveCurrency"></div>
                </div>
                <div class="field"><label for="reserveReason">Reserve reason <span class="optional">(optional)</span></label><textarea id="reserveReason" formControlName="reserveReason" rows="2"></textarea></div>
                <button type="submit" [disabled]="actionsDisabled()">{{ busyLabel('Record assessment', 'assessment') }}</button>
              </form>
            </section>

            <section class="action-card staff-only" aria-labelledby="decision-action-title">
              <p class="staff-label">Staff-only decision and rationale</p>
              <h3 id="decision-action-title">Record decision</h3>
              <form [formGroup]="decisionForm" (ngSubmit)="prepareDecision()">
                <div class="field">
                  <label for="decisionType">Decision</label>
                  <select id="decisionType" formControlName="type"><option value="Approved">Approve</option><option value="Rejected">Reject</option></select>
                </div>
                <div class="field"><label for="decisionReason">Staff-only rationale</label><textarea id="decisionReason" formControlName="reason" rows="3" required></textarea></div>
                <div class="money-fields">
                  <div class="field"><label for="decisionAmount">Amount <span class="optional">(optional)</span></label><input id="decisionAmount" type="number" formControlName="amount"></div>
                  <div class="field"><label for="decisionCurrency">Currency</label><input id="decisionCurrency" formControlName="currency"></div>
                </div>
                <button type="submit" [disabled]="actionsDisabled()">Review decision</button>
              </form>
              @if (pendingConfirmation() === 'Approved' || pendingConfirmation() === 'Rejected') {
                <div class="confirmation" role="group" aria-label="Confirm decision">
                  <p>Confirm recording the {{ pendingConfirmation() }} decision and staff-only rationale?</p>
                  <button type="button" class="primary" (click)="confirmDecision()" [disabled]="actionsDisabled()">{{ busyLabel('Confirm decision', 'decision') }}</button>
                  <button type="button" (click)="cancelConfirmation()" [disabled]="actionsDisabled()">Cancel</button>
                </div>
              }
            </section>

            <section class="action-card staff-only" aria-labelledby="internal-notes-title">
              <p class="staff-label">Staff-only</p>
              <h3 id="internal-notes-title">Add internal note</h3>
              <form [formGroup]="noteForm" (ngSubmit)="addInternalNote()">
                <div class="field"><label for="noteText">Internal note</label><textarea id="noteText" formControlName="noteText" rows="3" required></textarea></div>
                <button type="submit" [disabled]="actionsDisabled()">{{ busyLabel('Add staff-only note', 'internalNote') }}</button>
              </form>
            </section>

            <section class="action-card" aria-labelledby="settlement-title">
              <h3 id="settlement-title">Settlement workflow</h3>
              <p class="warning">This records workflow completion only. It does not record or confirm a payment.</p>
              <form [formGroup]="settlementForm" (ngSubmit)="prepareSettlement()">
                <div class="money-fields">
                  <div class="field"><label for="settlementAmount">Amount <span class="optional">(optional)</span></label><input id="settlementAmount" type="number" formControlName="amount"></div>
                  <div class="field"><label for="settlementCurrency">Currency</label><input id="settlementCurrency" formControlName="currency"></div>
                </div>
                <div class="field"><label for="settlementReference">Reference <span class="optional">(optional)</span></label><input id="settlementReference" formControlName="reference"></div>
                <button type="submit" [disabled]="actionsDisabled()">Review settlement workflow</button>
              </form>
              @if (pendingConfirmation() === 'Settlement') {
                <div class="confirmation" role="group" aria-label="Confirm settlement workflow">
                  <p>This will mark the settlement workflow complete; it will not make a payment.</p>
                  <button type="button" class="primary" (click)="confirmSettlement()" [disabled]="actionsDisabled()">{{ busyLabel('Confirm workflow completion', 'settlementWorkflow') }}</button>
                  <button type="button" (click)="cancelConfirmation()" [disabled]="actionsDisabled()">Cancel</button>
                </div>
              }
            </section>
          </div>
          @if (formError()) { <p class="error" role="alert">{{ formError() }}</p> }
        </section>

        <div class="history-grid">
          <section class="card staff-only" aria-labelledby="assessments-history-title">
            <p class="staff-label">Staff-only</p><h2 id="assessments-history-title">Assessment history</h2>
            @if (claim.assessments.length) {
              @for (assessment of claim.assessments; track $index) {
                <article class="history-item">
                  <h3>{{ assessment.assessmentType }}</h3>
                  <p class="description">{{ assessment.rationale }}</p>
                  @if (assessment.recommendation) { <p>Recommendation: {{ assessment.recommendation }}</p> }
                  @if (assessment.reserveEstimate; as estimate) { <p>Reserve estimate: {{ estimate.amount }} {{ estimate.currency }}</p> }
                  @if (assessment.reserveReason) { <p>Reserve reason: {{ assessment.reserveReason }}</p> }
                </article>
              }
            } @else { <p>No assessments recorded.</p> }
          </section>
          <section class="card" aria-labelledby="reserve-history-title">
            <h2 id="reserve-history-title">Reserve history</h2>
            @if (claim.reserveHistory.length) {
              <ul>@for (entry of claim.reserveHistory; track $index) { <li>{{ entry.amount }} {{ entry.currency }}</li> }</ul>
            } @else { <p>No reserve history recorded.</p> }
          </section>
          <section class="card staff-only" aria-labelledby="assignment-history-title">
            <p class="staff-label">Staff-only</p><h2 id="assignment-history-title">Assignment history</h2>
            @if (claim.assignmentHistory.length) {
              <ul>@for (assignment of claim.assignmentHistory; track $index) { <li>Team {{ assignment.teamId }} · {{ assignment.officerSubjectId || 'No officer assigned' }}</li> }</ul>
            } @else { <p>No assignment history recorded.</p> }
          </section>
          <section class="card staff-only" aria-labelledby="notes-history-title">
            <p class="staff-label">Staff-only internal notes</p><h2 id="notes-history-title">Internal notes</h2>
            @if (claim.internalNotes.length) {
              <ul class="notes">@for (note of claim.internalNotes; track $index) {
                <li><time [attr.datetime]="note.createdAt">{{ note.createdAt | date:'medium' }}</time><p class="description">{{ note.noteText }}</p></li>
              }</ul>
            } @else { <p>No internal notes recorded.</p> }
          </section>
          <section class="card" aria-labelledby="activity-title">
            <h2 id="activity-title">Claim activity</h2>
            @if (claim.activities.length) {
              <ol>@for (activity of claim.activities; track $index) {
                <li><time [attr.datetime]="activity.occurredAt">{{ activity.occurredAt | date:'medium' }}</time><p>{{ activity.description }}</p></li>
              }</ol>
            } @else { <p>No activities recorded.</p> }
          </section>
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display:block; }
    .page { max-width:1200px; margin:clamp(2rem,6vh,4.5rem) auto; padding:0 clamp(1rem,3vw,2.5rem) 3rem; }
    .back-link { color:#8f1025; font-weight:700; }
    .eyebrow { margin:1.2rem 0 0; color:#a40e28; font-size:.78rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
    h1 { margin:.35rem 0 .5rem; color:#17232e; font-size:clamp(2rem,4vw,3rem); letter-spacing:-.035em; overflow-wrap:anywhere; }
    h2 { margin:0 0 .65rem; font-size:1.2rem; }
    h3 { margin:.2rem 0 .55rem; font-size:1.05rem; }
    .heading,.section-heading { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
    .meta,.refresh-time,.card p,.action-card p { color:#586676; line-height:1.5; }
    .status { display:inline-block; padding:.3rem .6rem; border-radius:999px; background:#edf1f5; color:#344454; font-size:.85rem; font-weight:700; }
    button { min-height:2.65rem; padding:.55rem .85rem; border:1px solid #aeb9c4; border-radius:.35rem; background:#fff; color:#263645; cursor:pointer; font:inherit; font-weight:650; }
    button:disabled { opacity:.62; cursor:wait; }
    .primary { border-color:#9d1228; background:#9d1228; color:#fff; }
    .facts-grid,.history-grid,.workflow-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
    .facts-grid { margin:1.1rem 0; }
    .card,.action-card { min-width:0; padding:1.1rem; border:1px solid #dce2e8; border-radius:.55rem; background:#fff; }
    .description { white-space:pre-wrap; overflow-wrap:anywhere; }
    dl { display:grid; grid-template-columns:minmax(8rem,.4fr) minmax(0,1fr); gap:.45rem .8rem; }
    dt { color:#586676; font-weight:650; }
    dd { margin:0; overflow-wrap:anywhere; }
    .money { font-size:1.15rem; font-weight:700; }
    .staff-only { border-left:4px solid #596a7a; }
    .staff-label { margin:0 0 .4rem; color:#455564!important; font-size:.74rem; font-weight:750; letter-spacing:.08em; text-transform:uppercase; }
    .workflows { margin:1.6rem 0; }
    .workflow-grid { margin-top:.8rem; }
    .field { display:grid; gap:.35rem; margin:.75rem 0; }
    label { color:#263645; font-size:.9rem; font-weight:650; }
    input,select,textarea { width:100%; min-width:0; min-height:2.6rem; padding:.55rem; border:1px solid #aeb9c4; border-radius:.35rem; background:#fff; color:#17232e; font:inherit; }
    textarea { min-height:5rem; resize:vertical; }
    .optional { color:#586676; font-weight:400; }
    .money-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.7rem; }
    .actions { display:flex; flex-wrap:wrap; gap:.55rem; }
    .warning,.setup { padding:.75rem; border-left:4px solid #b47900; background:#fff8e8; color:#493b1e!important; }
    .setup { border:1px solid #e4d8b8; border-left-width:4px; border-radius:.3rem; }
    .confirmation { margin-top:.8rem; padding:.8rem; border:1px solid #d9c99f; border-radius:.4rem; background:#fff9ea; }
    .confirmation .primary { margin-right:.5rem; }
    .error { padding:.85rem; border:1px solid #d8a5a5; border-radius:.4rem; background:#fff2f2; color:#8c1f1f; }
    .error h2,.error p { color:inherit; }
    .success { padding:.8rem; border:1px solid #a9d2b7; border-radius:.4rem; background:#f3fbf5; color:#176435; }
    .history-grid { margin-top:1rem; }
    .history-item { padding:.65rem 0; border-top:1px solid #e5e9ed; }
    .history-item:first-of-type { border-top:0; }
    .notes,.history-grid ol { padding-left:1.25rem; }
    .notes li,.history-grid ol li { padding:.25rem 0; }
    time { color:#586676; font-size:.9rem; }
    @media (max-width:760px) {
      .facts-grid,.history-grid,.workflow-grid { grid-template-columns:1fr; }
      .heading { align-items:flex-start; flex-direction:column; }
      .heading button { width:100%; }
    }
    @media (max-width:520px) {
      .page { margin:1.5rem auto; }
      .card,.action-card { padding:.85rem; }
      .money-fields,dl { grid-template-columns:1fr; }
      dd { margin-bottom:.45rem; }
      .actions > * { flex:1 1 100%; }
    }
  `],
})
export class OfficerWorkbenchPage {
  private readonly api = inject(ClaimsApi);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly settings: AppSettings = inject(SETTINGS);
  private readonly claimId = inject(ActivatedRoute).snapshot.paramMap.get('claimId') ?? '';
  readonly teams = this.settings.staffDirectory.teams;
  readonly detail = signal<StaffDetail | null>(null);
  readonly etag = signal('');
  readonly loading = signal(false);
  readonly detailFresh = signal(false);
  readonly pendingAction = signal<string | null>(null);
  readonly pendingConfirmation = signal<PendingConfirmation>(null);
  readonly pageError = signal('');
  readonly actionError = signal('');
  readonly actionSuccess = signal('');
  readonly validationErrors = signal<string[]>([]);
  readonly formError = signal('');
  readonly refreshedAt = signal<Date | null>(null);
  readonly statusLabel = computed(() => (this.detail()?.status ?? 'Unknown').replace(/([a-z])([A-Z])/g, '$1 $2'));
  readonly assignmentForm = this.fb.nonNullable.group({
    teamId: ['', Validators.required],
    officerSubjectId: [''],
    reason: [''],
  });
  readonly informationForm = this.fb.nonNullable.group({ question: ['', [Validators.required, Validators.pattern(/\S/)]] });
  readonly assessmentForm = this.fb.nonNullable.group({
    assessmentType: ['', [Validators.required, Validators.pattern(/\S/)]],
    rationale: ['', [Validators.required, Validators.pattern(/\S/)]],
    recommendation: [''],
    reserveAmount: this.fb.control<number | null>(null),
    reserveCurrency: [''],
    reserveReason: [''],
  });
  readonly decisionForm = this.fb.nonNullable.group({
    type: this.fb.nonNullable.control<'Approved' | 'Rejected'>('Approved'),
    reason: ['', [Validators.required, Validators.pattern(/\S/)]],
    amount: this.fb.control<number | null>(null),
    currency: [''],
  });
  readonly noteForm = this.fb.nonNullable.group({ noteText: ['', [Validators.required, Validators.pattern(/\S/)]] });
  readonly settlementForm = this.fb.nonNullable.group({
    amount: this.fb.control<number | null>(null),
    currency: [''],
    reference: [''],
  });

  constructor() {
    if (!this.claimId) this.pageError.set('A claim ID is required to open the workbench.');
    else this.loadDetail();
  }

  actionsDisabled(): boolean { return this.loading() || this.pendingAction() !== null; }
  busyLabel(label: string, action: string): string { return this.pendingAction() === action ? 'Working…' : label; }
  hasDetails(details: object): boolean { return Object.values(details).some((value) => value !== undefined && value !== null && value !== ''); }

  officersForTeam(): AppSettings['staffDirectory']['teams'][number]['officers'] {
    const teamId = this.assignmentForm.controls.teamId.value;
    return this.teams.find((team) => team.teamId === teamId)?.officers ?? [];
  }

  teamChanged(): void { this.assignmentForm.controls.officerSubjectId.setValue(''); }
  refresh(): void { this.loadDetail(); }

  assign(): void {
    this.assignmentForm.markAllAsTouched();
    const value = this.assignmentForm.getRawValue();
    if (this.assignmentForm.invalid) {
      this.formError.set('Choose a configured team before assigning this claim.');
      return;
    }
    const team = this.teams.find((option) => option.teamId === value.teamId);
    if (!team) {
      this.formError.set('Choose a team from the configured assignment directory.');
      return;
    }
    const officer = value.officerSubjectId ? team.officers.find((option) => option.subjectId === value.officerSubjectId) : undefined;
    if (value.officerSubjectId && !officer) {
      this.formError.set('Choose an officer from the configured team directory.');
      return;
    }
    this.formError.set('');
    this.runAction('assignment', (etag) => this.api.assignment(this.claimId, {
      teamId: team.teamId,
      ...(officer ? { officerSubjectId: officer.subjectId } : {}),
      ...(value.reason.trim() ? { reason: value.reason.trim() } : {}),
    }, etag), () => this.assignmentForm.reset({ teamId: '', officerSubjectId: '', reason: '' }));
  }

  startReview(): void { this.runAction('review', (etag) => this.api.review(this.claimId, etag)); }
  resumeReview(): void { this.runAction('resumeReview', (etag) => this.api.resumeReview(this.claimId, etag)); }

  requestInformation(): void {
    this.informationForm.markAllAsTouched();
    if (this.informationForm.invalid) {
      this.formError.set('Enter a question before requesting information.');
      return;
    }
    const question = this.informationForm.controls.question.value.trim();
    this.runAction('informationRequest', (etag) => this.api.informationRequest(this.claimId, { question }, etag),
      () => this.informationForm.reset({ question: '' }));
  }

  recordAssessment(): void {
    this.assessmentForm.markAllAsTouched();
    if (this.assessmentForm.invalid) {
      this.formError.set('Enter an assessment type and rationale.');
      return;
    }
    const value = this.assessmentForm.getRawValue();
    const money = optionalMoney(value.reserveAmount, value.reserveCurrency);
    if (money === 'invalid') {
      this.formError.set('Provide both a reserve amount and currency, or leave both blank.');
      return;
    }
    this.formError.set('');
    const body: AssessmentCommand = {
      assessmentType: value.assessmentType.trim(),
      rationale: value.rationale.trim(),
      ...(value.recommendation.trim() ? { recommendation: value.recommendation.trim() } : {}),
      ...(money ? { reserveEstimate: money } : {}),
      ...(value.reserveReason.trim() ? { reserveReason: value.reserveReason.trim() } : {}),
    };
    this.runAction('assessment', (etag) => this.api.assessment(this.claimId, body, etag), () =>
      this.assessmentForm.reset({
        assessmentType: '', rationale: '', recommendation: '', reserveAmount: null, reserveCurrency: '', reserveReason: '',
      }));
  }

  prepareDecision(): void {
    this.decisionForm.markAllAsTouched();
    if (this.decisionForm.invalid) {
      this.formError.set('Enter a rationale before reviewing the decision.');
      return;
    }
    const value = this.decisionForm.getRawValue();
    if (optionalMoney(value.amount, value.currency) === 'invalid') {
      this.formError.set('Provide both a decision amount and currency, or leave both blank.');
      return;
    }
    this.formError.set('');
    this.pendingConfirmation.set(value.type);
  }

  confirmDecision(): void {
    const type = this.pendingConfirmation();
    if (type !== 'Approved' && type !== 'Rejected') return;
    if (this.decisionForm.invalid) {
      this.formError.set('Enter a rationale before confirming the decision.');
      return;
    }
    const value = this.decisionForm.getRawValue();
    const money = optionalMoney(value.amount, value.currency);
    if (money === 'invalid') {
      this.formError.set('Provide both a decision amount and currency, or leave both blank.');
      return;
    }
    const body: DecisionCommand = {
      type,
      reason: value.reason.trim(),
      ...(money ? { amount: money } : {}),
    };
    this.runAction('decision', (etag) => this.api.decision(this.claimId, body, etag), () =>
      this.decisionForm.reset({ type: 'Approved', reason: '', amount: null, currency: '' }));
  }

  cancelConfirmation(): void { this.pendingConfirmation.set(null); }

  addInternalNote(): void {
    this.noteForm.markAllAsTouched();
    if (this.noteForm.invalid) {
      this.formError.set('Enter an internal note before adding it.');
      return;
    }
    const noteText = this.noteForm.controls.noteText.value.trim();
    this.runAction('internalNote', (etag) => this.api.internalNote(this.claimId, { noteText }, etag),
      () => this.noteForm.reset({ noteText: '' }));
  }

  prepareSettlement(): void {
    const value = this.settlementForm.getRawValue();
    if (optionalMoney(value.amount, value.currency) === 'invalid') {
      this.formError.set('Provide both a settlement amount and currency, or leave both blank.');
      return;
    }
    this.formError.set('');
    this.pendingConfirmation.set('Settlement');
  }

  confirmSettlement(): void {
    if (this.pendingConfirmation() !== 'Settlement') return;
    const value = this.settlementForm.getRawValue();
    const money = optionalMoney(value.amount, value.currency);
    if (money === 'invalid') {
      this.formError.set('Provide both a settlement amount and currency, or leave both blank.');
      return;
    }
    this.runAction('settlementWorkflow', (etag) => this.api.settlementWorkflow(this.claimId, {
      ...(money ? { amount: money } : {}),
      ...(value.reference.trim() ? { reference: value.reference.trim() } : {}),
    }, etag), () => this.settlementForm.reset({ amount: null, currency: '', reference: '' }));
  }

  private runAction(action: string, request: StaffAction, onWriteSuccess?: () => void): void {
    if (!this.claimId || this.pendingAction() || this.loading()) return;
    this.pendingAction.set(action);
    this.actionError.set('');
    this.actionSuccess.set('');
    this.validationErrors.set([]);
    this.formError.set('');
    let writeCompleted = false;
    let writeStarted = false;
    this.api.staffDetail(this.claimId).pipe(
      tap((fresh) => this.acceptDetail(fresh.body, fresh.etag)),
      switchMap((fresh) => {
        writeStarted = true;
        return request(fresh.etag);
      }),
      tap((result) => {
        writeCompleted = true;
        this.etag.set(result.etag);
        this.detailFresh.set(false);
        this.pendingConfirmation.set(null);
        onWriteSuccess?.();
      }),
      switchMap(() => this.api.staffDetail(this.claimId)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (fresh) => {
        this.acceptDetail(fresh.body, fresh.etag);
        this.actionSuccess.set('Action completed and claim details refreshed.');
        this.pendingAction.set(null);
      },
      error: (error: unknown) => {
        this.pendingAction.set(null);
        if (writeCompleted) {
          this.actionError.set(`The action succeeded, but claim details could not be refreshed: ${officerErrorMessage(error)}`);
          this.validationErrors.set([]);
          return;
        }
        const ambiguous = writeStarted && isAmbiguousStaffWrite(error);
        this.actionError.set(ambiguous
          ? 'The action outcome is unclear. Claim details are being reloaded; verify the current state before trying again.'
          : officerErrorMessage(error));
        this.validationErrors.set(officerValidationMessages(error));
        if (ambiguous || isConflict(error)) this.loadDetail();
      },
    });
  }

  private loadDetail(): void {
    if (!this.claimId || this.loading()) return;
    this.loading.set(true);
    this.detailFresh.set(false);
    this.pageError.set('');
    this.api.staffDetail(this.claimId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (fresh) => {
        this.acceptDetail(fresh.body, fresh.etag);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.pageError.set(officerErrorMessage(error));
        this.loading.set(false);
      },
    });
  }

  private acceptDetail(body: StaffDetail, etag: string): void {
    this.detail.set(body);
    this.etag.set(etag);
    this.detailFresh.set(true);
    this.refreshedAt.set(new Date());
  }
}

function isConflict(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 409;
}

function optionalMoney(amount: number | null, currency: string): Money | 'invalid' | null {
  const normalizedCurrency = currency.trim();
  if ((amount === null) !== (normalizedCurrency.length === 0)) return 'invalid';
  if (amount === null) return null;
  return Number.isFinite(amount) ? { amount, currency: normalizedCurrency } : 'invalid';
}
