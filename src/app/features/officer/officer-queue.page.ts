import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, map, switchMap } from 'rxjs';
import { ClaimCard, ClaimStatus, ClaimsApi, StaffQueueFilters } from '../../core/claims-api';
import { officerErrorMessage } from './officer-errors';

const STATUSES: ClaimStatus[] = ['Submitted', 'InReview', 'Assessment', 'AwaitingInformation', 'Approved', 'Rejected', 'Settled'];
interface QueueRequest { filters: StaffQueueFilters; cursor?: string; append: boolean; }

@Component({
  selector: 'app-officer-queue-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <section class="page">
      <p class="eyebrow">Officer workspace</p>
      <h1>Claims queue</h1>
      <p class="intro">Search the claims available within your authorized scope.</p>
      <form class="filters" [formGroup]="filterForm" (ngSubmit)="applyFilters()" aria-label="Filter claims">
        <div class="filter-grid">
          <div class="field"><label for="market">Market</label><input id="market" formControlName="market"></div>
          <div class="field">
            <label for="status">Status</label>
            <select id="status" formControlName="status">
              <option value="">All statuses</option>
              @for (status of statuses; track status) { <option [value]="status">{{ statusLabel(status) }}</option> }
            </select>
          </div>
          <div class="field"><label for="teamId">Team ID</label><input id="teamId" formControlName="teamId"></div>
          <div class="field"><label for="officerId">Officer ID</label><input id="officerId" formControlName="officerId"></div>
          <div class="field"><label for="claimNumber">Claim number</label><input id="claimNumber" formControlName="claimNumber"></div>
          <div class="field"><label for="submittedFrom">Submitted from</label><input id="submittedFrom" type="date" formControlName="submittedFrom"></div>
          <div class="field"><label for="submittedTo">Submitted to</label><input id="submittedTo" type="date" formControlName="submittedTo"></div>
          <div class="field"><label for="incidentFrom">Incident from</label><input id="incidentFrom" type="date" formControlName="incidentFrom"></div>
          <div class="field"><label for="incidentTo">Incident to</label><input id="incidentTo" type="date" formControlName="incidentTo"></div>
        </div>
        @if (filterError()) { <p class="error" role="alert">{{ filterError() }}</p> }
        <div class="actions">
          <button type="submit" class="primary">{{ loading() ? 'Applying filters…' : 'Apply filters' }}</button>
          <button type="button" (click)="resetFilters()">Reset filters</button>
        </div>
      </form>

      <div class="queue-heading">
        <h2>Results</h2>
        @if (refreshedAt(); as refreshed) { <p class="refresh-time">Last refreshed {{ refreshed.toLocaleTimeString() }}</p> }
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (loading()) {
        <p role="status" aria-live="polite">Loading claims…</p>
      } @else if (loaded() && claims().length === 0 && !error()) {
        <section class="empty" aria-labelledby="empty-title"><h2 id="empty-title">No claims found</h2><p>Try changing or clearing the filters.</p></section>
      } @else if (claims().length) {
        <ul class="claims" aria-label="Claims queue results">
          @for (claim of claims(); track claim.claimId) {
            <li>
              <article class="claim-card">
                <div class="card-heading">
                  <h3><a [routerLink]="['/officer/claims', claim.claimId]">{{ claim.claimNumber }}</a></h3>
                  <span class="status">{{ statusLabel(claim.status) }}</span>
                </div>
                <p>{{ claim.lineOfBusiness }} · {{ claim.marketCode }}</p>
                <p>Submitted <time [attr.datetime]="claim.submittedAt">{{ claim.submittedAt | date:'medium' }}</time></p>
                <a class="details-link" [routerLink]="['/officer/claims', claim.claimId]">Open workbench</a>
              </article>
            </li>
          }
        </ul>
      }
      @if (nextCursor()) {
        <button type="button" class="load-more" (click)="loadMore()" [disabled]="loading() || loadingMore()">
          {{ loadingMore() ? 'Loading…' : 'Load more claims' }}
        </button>
      }
    </section>
  `,
  styles: [`
    :host { display:block; }
    .page { max-width:1100px; margin:clamp(2rem,7vh,5rem) auto; padding:0 clamp(1rem,4vw,3rem) 3rem; }
    .eyebrow { margin:0; color:#a40e28; font-size:.78rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
    h1 { margin:.35rem 0 .5rem; color:#17232e; font-size:clamp(2rem,4vw,3rem); letter-spacing:-.035em; }
    h2 { margin:0; font-size:1.25rem; }
    .intro,.refresh-time,.claim-card p { color:#586676; line-height:1.5; }
    .filters,.claim-card,.empty { padding:1.15rem; border:1px solid #dce2e8; border-radius:.55rem; background:#fff; }
    .filter-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.8rem 1rem; }
    .field { display:grid; gap:.35rem; min-width:0; }
    label { color:#263645; font-size:.9rem; font-weight:650; }
    input,select { width:100%; min-width:0; min-height:2.65rem; padding:.55rem; border:1px solid #aeb9c4; border-radius:.35rem; background:#fff; color:#17232e; }
    button { min-height:2.7rem; padding:.6rem .9rem; border:1px solid #aeb9c4; border-radius:.35rem; background:#fff; color:#263645; cursor:pointer; font:inherit; font-weight:650; }
    .primary { border-color:#9d1228; background:#9d1228; color:#fff; }
    button:disabled { opacity:.65; cursor:wait; }
    .actions { display:flex; flex-wrap:wrap; gap:.7rem; margin-top:1rem; }
    .queue-heading { display:flex; align-items:baseline; justify-content:space-between; gap:1rem; margin:1.6rem 0 .8rem; }
    .refresh-time { margin:0; font-size:.85rem; }
    .claims { display:grid; gap:.8rem; margin:0; padding:0; list-style:none; }
    .card-heading { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
    h3 { margin:0; font-size:1.1rem; }
    .card-heading a,.details-link,.empty a { color:#8f1025; font-weight:700; }
    .status { padding:.3rem .6rem; border-radius:999px; background:#edf1f5; color:#344454; font-size:.82rem; font-weight:700; }
    .details-link { display:inline-block; padding:.25rem 0; }
    .empty { margin-top:.8rem; }
    .error { padding:.8rem; border:1px solid #d8a5a5; border-radius:.4rem; background:#fff2f2; color:#8c1f1f; }
    .load-more { display:block; margin:1.2rem auto; }
    @media (max-width:760px) { .filter-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media (max-width:520px) {
      .page { margin:1.5rem auto; }
      .filter-grid { grid-template-columns:1fr; }
      .actions > * { flex:1 1 100%; }
      .queue-heading,.card-heading { align-items:flex-start; flex-direction:column; }
    }
  `],
})
export class OfficerQueuePage {
  private readonly api = inject(ClaimsApi);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests = new Subject<QueueRequest>();
  readonly statuses = STATUSES;
  readonly filterForm = this.fb.nonNullable.group({
    market: [''],
    status: this.fb.nonNullable.control<'' | ClaimStatus>(''),
    teamId: [''],
    officerId: [''],
    claimNumber: [''],
    submittedFrom: [''],
    submittedTo: [''],
    incidentFrom: [''],
    incidentTo: [''],
  });
  readonly claims = signal<ClaimCard[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly appliedFilters = signal<StaffQueueFilters>({});
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly filterError = signal('');
  readonly refreshedAt = signal<Date | null>(null);

  constructor() {
    this.requests.pipe(
      switchMap((request) => {
        this.error.set('');
        this.loading.set(!request.append);
        this.loadingMore.set(request.append);
        return this.api.staffQueue({ ...request.filters, pageSize: 20, ...(request.cursor ? { cursor: request.cursor } : {}) }).pipe(
          map((page) => ({ page, append: request.append })),
          catchError((error: unknown) => {
            this.error.set(officerErrorMessage(error));
            this.loading.set(false);
            this.loadingMore.set(false);
            this.loaded.set(true);
            return EMPTY;
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ page, append }) => {
      if (append) this.claims.update((claims) => [...claims, ...page.items]);
      else this.claims.set(page.items);
      this.nextCursor.set(page.nextCursor);
      this.refreshedAt.set(new Date());
      this.loaded.set(true);
      this.loading.set(false);
      this.loadingMore.set(false);
    });
    this.applyFilters();
  }

  applyFilters(): void {
    const value = this.filterForm.getRawValue();
    const invalidRange = (from: string, to: string) => !!from && !!to && from > to;
    if (invalidRange(value.submittedFrom, value.submittedTo) || invalidRange(value.incidentFrom, value.incidentTo)) {
      this.filterError.set('Each date range must start on or before its end date.');
      return;
    }
    this.filterError.set('');
    const filters: StaffQueueFilters = {
      ...(value.market.trim() ? { market: value.market.trim() } : {}),
      ...(value.status ? { status: value.status } : {}),
      ...(value.teamId.trim() ? { teamId: value.teamId.trim() } : {}),
      ...(value.officerId.trim() ? { officerId: value.officerId.trim() } : {}),
      ...(value.claimNumber.trim() ? { claimNumber: value.claimNumber.trim() } : {}),
      ...(value.submittedFrom ? { submittedFrom: value.submittedFrom } : {}),
      ...(value.submittedTo ? { submittedTo: value.submittedTo } : {}),
      ...(value.incidentFrom ? { incidentFrom: value.incidentFrom } : {}),
      ...(value.incidentTo ? { incidentTo: value.incidentTo } : {}),
    };
    this.appliedFilters.set(filters);
    this.claims.set([]);
    this.nextCursor.set(null);
    this.requests.next({ filters, append: false });
  }

  resetFilters(): void {
    this.filterForm.reset({
      market: '', status: '', teamId: '', officerId: '', claimNumber: '',
      submittedFrom: '', submittedTo: '', incidentFrom: '', incidentTo: '',
    });
    this.applyFilters();
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loading() || this.loadingMore()) return;
    this.requests.next({ filters: this.appliedFilters(), cursor, append: true });
  }

  statusLabel(status: string): string { return status.replace(/([a-z])([A-Z])/g, '$1 $2'); }
}
