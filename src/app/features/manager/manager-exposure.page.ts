import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, switchMap } from 'rxjs';
import { ClaimsApi, ExposureReport } from '../../core/claims-api';
import { managerErrorMessage } from './manager-errors';

@Component({
  selector: 'app-manager-exposure-page',
  imports: [CommonModule],
  template: `
    <section class="page">
      <p class="eyebrow">Manager workspace</p>
      <h1>Exposure</h1>
      <p class="intro">Review backend-reported reserves grouped by market and currency. Amounts are shown separately and are not converted or combined.</p>
      <div class="toolbar">
        <button type="button" class="primary" (click)="refresh()" [disabled]="loading()">{{ loading() ? 'Refreshing…' : 'Refresh exposure' }}</button>
        @if (refreshedAt(); as refreshed) { <p class="refresh-time">Last refreshed {{ refreshed.toLocaleTimeString() }}</p> }
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (loading() && !report()) { <p role="status" aria-live="polite">Loading exposure…</p> }
      @if (report(); as exposure) {
        <p class="as-of">Reporting snapshot as of <time [attr.datetime]="exposure.asOfUtc">{{ exposure.asOfUtc | date:'medium':'UTC' }} UTC</time></p>
        <section class="summary" aria-label="Exposure summary">
          <div><h2>Claims missing reserves</h2><p class="large-count">{{ displayCount(exposure.missingReserveCount) }}</p></div>
          <div>
            <h2>Included statuses</h2>
            @if (exposure.includedStatuses.length === 0) { <p class="muted">No included statuses returned.</p> }
            @else { <ul class="statuses">@for (status of exposure.includedStatuses; track status) { <li>{{ statusLabel(status) }}</li> }</ul> }
          </div>
        </section>
        <section class="assumption" aria-labelledby="assumption-title"><h2 id="assumption-title">Backend assumption</h2><p>{{ exposure.assumption }}</p></section>
        @if (exposure.groups.length === 0) {
          <section class="empty" aria-labelledby="empty-title"><h2 id="empty-title">No exposure groups</h2><p>The service returned no reserve groups for your authorized scope.</p></section>
        } @else {
          <ul class="groups" aria-label="Exposure by market and currency">
            @for (group of exposure.groups; track $index) {
              <li>
                <article class="group">
                  <h2>{{ group.marketCode }} · {{ group.currency }}</h2>
                  <dl>
                    <div><dt>Reserve amount ({{ group.currency }})</dt><dd>{{ displayAmount(group.amount) }}</dd></div>
                    <div><dt>Claim count</dt><dd>{{ displayCount(group.claimCount) }}</dd></div>
                  </dl>
                </article>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
  styles: [`
    :host { display:block; }
    .page { max-width:1050px; margin:clamp(2rem,7vh,5rem) auto; padding:0 clamp(1rem,4vw,3rem) 3rem; }
    .eyebrow { margin:0; color:#a40e28; font-size:.78rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
    h1 { margin:.35rem 0 .5rem; color:#17232e; font-size:clamp(2rem,4vw,3rem); letter-spacing:-.035em; }
    h2 { margin:0; font-size:1.15rem; }
    .intro,.as-of,.refresh-time,.muted { color:#586676; line-height:1.5; }
    .toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:1rem; margin:1.2rem 0; }
    .refresh-time { margin:0; font-size:.88rem; }
    button { min-height:2.7rem; padding:.6rem .9rem; border:1px solid #aeb9c4; border-radius:.35rem; background:#fff; color:#263645; cursor:pointer; font:inherit; font-weight:650; }
    .primary { border-color:#9d1228; background:#9d1228; color:#fff; }
    button:disabled { opacity:.65; cursor:wait; }
    .summary,.assumption,.group,.empty { padding:1.1rem; border:1px solid #dce2e8; border-radius:.55rem; background:#fff; }
    .summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
    .large-count { margin:.6rem 0 0; font-size:1.5rem; font-weight:750; }
    .statuses { display:flex; flex-wrap:wrap; gap:.5rem; margin:.75rem 0 0; padding:0; list-style:none; }
    .statuses li { padding:.3rem .6rem; border-radius:999px; background:#edf1f5; color:#344454; font-size:.84rem; font-weight:650; }
    .assumption { margin-top:1rem; border-left:4px solid #1769aa; }
    .assumption p { margin-bottom:0; line-height:1.55; }
    .groups { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr)); gap:1rem; margin:1rem 0; padding:0; list-style:none; }
    .group h2 { overflow-wrap:anywhere; }
    dl { display:grid; gap:.65rem; margin-bottom:0; }
    dl div { padding:.65rem; border-radius:.4rem; background:#f5f7fa; }
    dt { color:#586676; font-size:.87rem; }
    dd { margin:.25rem 0 0; font-size:1.1rem; font-weight:700; overflow-wrap:anywhere; }
    .error { padding:.85rem; border:1px solid #d8a5a5; border-radius:.4rem; background:#fff2f2; color:#8c1f1f; }
    @media (max-width:580px) { .page { margin:1.5rem auto; } .summary { grid-template-columns:1fr; } .toolbar > * { flex:1 1 100%; } }
  `],
})
export class ManagerExposurePage {
  private readonly api = inject(ClaimsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests = new Subject<void>();
  readonly report = signal<ExposureReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly refreshedAt = signal<Date | null>(null);

  constructor() {
    this.requests.pipe(
      switchMap(() => {
        this.loading.set(true);
        this.error.set('');
        return this.api.exposure().pipe(
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
    this.refresh();
  }

  refresh(): void { this.requests.next(); }
  displayCount(value: number | null | undefined): string { return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'Not reported'; }
  displayAmount(value: number | null | undefined): string { return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'Not reported'; }
  statusLabel(status: string): string { return status.replace(/([a-z])([A-Z])/g, '$1 $2'); }
}
