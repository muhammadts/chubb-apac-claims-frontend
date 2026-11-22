import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { EMPTY, Subject, catchError, switchMap } from 'rxjs';
import { ClaimsApi, PerformanceReport } from '../../core/claims-api';
import { managerErrorMessage } from './manager-errors';

interface PerformanceRange { fromUtc: string; toUtc: string; }

function utcMidnight(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : parsed.toISOString();
}

@Component({
  selector: 'app-manager-performance-page',
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <section class="page">
      <p class="eyebrow">Manager workspace</p>
      <h1>Performance</h1>
      <p class="intro">Review backend-reported decision and settlement durations for a selected UTC interval.</p>
      <form class="filters" [formGroup]="rangeForm" (ngSubmit)="runReport()" aria-label="Performance reporting interval">
        <div class="field"><label for="fromDate">From date (inclusive, UTC)</label><input id="fromDate" type="date" formControlName="fromDate"></div>
        <div class="field"><label for="toDate">To date (exclusive, UTC)</label><input id="toDate" type="date" formControlName="toDate"></div>
        <div class="actions"><button type="submit" class="primary" [disabled]="loading()">{{ loading() ? 'Loading report…' : 'Run report' }}</button></div>
        <p class="interval-help">The reporting interval is [fromUtc, toUtc): the start is included and the end is excluded.</p>
        @if (validationError()) { <p class="error" role="alert">{{ validationError() }}</p> }
      </form>
      @if (refreshedAt(); as refreshed) { <p class="refresh-time">Last refreshed {{ refreshed.toLocaleTimeString() }}</p> }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (loading()) { <p role="status" aria-live="polite">Loading performance report…</p> }
      @if (report(); as performance) {
        <p class="as-of">Returned interval: <code>[{{ performance.fromUtc }}, {{ performance.toUtc }})</code></p>
        <div class="metrics">
          <section class="metric-card" aria-labelledby="decisions-title">
            <h2 id="decisions-title">Decisions</h2>
            <dl>
              <div><dt>Decision count</dt><dd>{{ displayCount(performance.decisionCount) }}</dd></div>
              <div><dt>Average elapsed time</dt><dd>{{ displayDays(performance.averageDecisionElapsedDays) }}</dd></div>
              <div><dt>Median elapsed time</dt><dd>{{ displayDays(performance.medianDecisionElapsedDays) }}</dd></div>
              <div><dt>Missing duration count</dt><dd>{{ displayCount(performance.missingDecisionDurationCount) }}</dd></div>
            </dl>
            @if (performance.decisionCount === 0) { <p class="muted">No decisions were recorded in this interval.</p> }
          </section>
          <section class="metric-card" aria-labelledby="settlements-title">
            <h2 id="settlements-title">Settlement workflow</h2>
            <dl>
              <div><dt>Settlement count</dt><dd>{{ displayCount(performance.settlementCount) }}</dd></div>
              <div><dt>Average elapsed time</dt><dd>{{ displayDays(performance.averageSettlementElapsedDays) }}</dd></div>
              <div><dt>Missing duration count</dt><dd>{{ displayCount(performance.missingSettlementDurationCount) }}</dd></div>
            </dl>
            @if (performance.settlementCount === 0) { <p class="muted">No settlement workflows were recorded in this interval.</p> }
          </section>
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display:block; }
    .page { max-width:1000px; margin:clamp(2rem,7vh,5rem) auto; padding:0 clamp(1rem,4vw,3rem) 3rem; }
    .eyebrow { margin:0; color:#a40e28; font-size:.78rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
    h1 { margin:.35rem 0 .5rem; color:#17232e; font-size:clamp(2rem,4vw,3rem); letter-spacing:-.035em; }
    h2 { margin:0; font-size:1.2rem; }
    .intro,.as-of,.refresh-time,.muted,.interval-help { color:#586676; line-height:1.5; }
    .filters,.metric-card { padding:1.1rem; border:1px solid #dce2e8; border-radius:.55rem; background:#fff; }
    .filters { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
    .field { display:grid; gap:.35rem; min-width:0; }
    label { color:#263645; font-size:.9rem; font-weight:650; }
    input { width:100%; min-width:0; min-height:2.65rem; padding:.55rem; border:1px solid #aeb9c4; border-radius:.35rem; background:#fff; color:#17232e; }
    button { min-height:2.7rem; padding:.6rem .9rem; border:1px solid #aeb9c4; border-radius:.35rem; background:#fff; color:#263645; cursor:pointer; font:inherit; font-weight:650; }
    .primary { border-color:#9d1228; background:#9d1228; color:#fff; }
    button:disabled { opacity:.65; cursor:wait; }
    .actions,.interval-help,.error { grid-column:1/-1; }
    .actions { display:flex; flex-wrap:wrap; gap:.7rem; }
    .interval-help { margin:0; font-size:.9rem; }
    .refresh-time { font-size:.88rem; }
    .metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
    dl { display:grid; gap:.6rem; }
    dl div { display:flex; justify-content:space-between; gap:1rem; padding:.65rem; border-radius:.4rem; background:#f5f7fa; }
    dt { color:#586676; }
    dd { margin:0; text-align:right; font-weight:700; }
    .error { padding:.85rem; border:1px solid #d8a5a5; border-radius:.4rem; background:#fff2f2; color:#8c1f1f; }
    code { overflow-wrap:anywhere; }
    @media (max-width:650px) { .page { margin:1.5rem auto; } .filters,.metrics { grid-template-columns:1fr; } }
  `],
})
export class ManagerPerformancePage {
  private readonly api = inject(ClaimsApi);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests = new Subject<PerformanceRange | null>();
  readonly rangeForm = this.fb.nonNullable.group({ fromDate: [''], toDate: [''] });
  readonly report = signal<PerformanceReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly validationError = signal('');
  readonly refreshedAt = signal<Date | null>(null);

  constructor() {
    this.requests.pipe(
      switchMap((range) => {
        if (!range) return EMPTY;
        this.loading.set(true);
        this.error.set('');
        return this.api.performance(range.fromUtc, range.toUtc).pipe(
          catchError((error: unknown) => {
            this.error.set(managerErrorMessage(error));
            this.loading.set(false);
            return EMPTY;
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((report) => {
      this.report.set(report);
      this.refreshedAt.set(new Date());
      this.loading.set(false);
    });
  }

  runReport(): void {
    const { fromDate, toDate } = this.rangeForm.getRawValue();
    const fromUtc = utcMidnight(fromDate);
    const toUtc = utcMidnight(toDate);
    if (!fromUtc || !toUtc) {
      this.cancelAndClear('Enter valid start and end dates.');
      return;
    }
    if (fromUtc >= toUtc) {
      this.cancelAndClear('The start date must be earlier than the exclusive end date.');
      return;
    }
    this.validationError.set('');
    this.report.set(null);
    this.refreshedAt.set(null);
    this.requests.next({ fromUtc, toUtc });
  }

  displayCount(value: number | null | undefined): string {
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'Not reported';
  }

  displayDays(value: number | null | undefined): string {
    return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} days` : 'Not available';
  }

  private cancelAndClear(message: string): void {
    this.requests.next(null);
    this.report.set(null);
    this.refreshedAt.set(null);
    this.loading.set(false);
    this.validationError.set(message);
    this.error.set('');
  }
}
