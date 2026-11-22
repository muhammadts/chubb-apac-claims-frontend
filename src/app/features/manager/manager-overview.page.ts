import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, switchMap } from 'rxjs';
import { WorkloadGroup, WorkloadReport, ClaimsApi } from '../../core/claims-api';
import { managerErrorMessage } from './manager-errors';

@Component({
  selector: 'app-manager-overview-page',
  imports: [CommonModule],
  template: `
    <section class="page">
      <p class="eyebrow">Manager workspace</p>
      <h1>Workload overview</h1>
      <p class="intro">Current scoped workload and the ageing bands returned by the reporting service.</p>
      <div class="toolbar">
        <button type="button" class="primary" (click)="refresh()" [disabled]="loading()">{{ loading() ? 'Refreshing…' : 'Refresh workload' }}</button>
        @if (refreshedAt(); as refreshed) { <p class="refresh-time">Last refreshed {{ refreshed.toLocaleTimeString() }}</p> }
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (loading() && !report()) { <p role="status" aria-live="polite">Loading workload…</p> }
      @if (report(); as workload) {
        <p class="as-of">Reporting snapshot as of <time [attr.datetime]="workload.asOfUtc">{{ workload.asOfUtc | date:'medium':'UTC' }} UTC</time></p>
        <section class="definition" aria-labelledby="ageing-definition-title">
          <h2 id="ageing-definition-title">Backend ageing definition</h2>
          <p>{{ workload.ageingDefinition }}</p>
        </section>
        @if (workload.groups.length === 0) {
          <section class="empty" aria-labelledby="empty-title"><h2 id="empty-title">No workload groups</h2><p>The service returned no groups for your authorized scope.</p></section>
        } @else {
          <ul class="groups" aria-label="Workload groups">
            @for (group of workload.groups; track $index) {
              <li>
                <article class="group">
                  <h2>{{ groupLabel(group) }}</h2>
                  <dl class="summary">
                    <div><dt>Unassigned claims</dt><dd>{{ displayCount(group.unassignedCount) }}</dd></div>
                  </dl>
                  <section class="subsection" aria-label="Status counts">
                    <h3>Status counts</h3>
                    @if (statusEntries(group).length === 0) { <p class="muted">No status counts returned.</p> }
                    @else {
                      <dl class="counts">
                        @for (entry of statusEntries(group); track entry.status) { <div><dt>{{ statusLabel(entry.status) }}</dt><dd>{{ displayCount(entry.count) }}</dd></div> }
                      </dl>
                    }
                  </section>
                  <section class="subsection" aria-label="Ageing bands">
                    <h3>Ageing bands</h3>
                    <dl class="counts">
                      @for (band of ageingEntries(group); track band.label) { <div><dt>{{ band.label }} days</dt><dd>{{ displayCount(band.count) }}</dd></div> }
                    </dl>
                  </section>
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
    .page { max-width:1100px; margin:clamp(2rem,7vh,5rem) auto; padding:0 clamp(1rem,4vw,3rem) 3rem; }
    .eyebrow { margin:0; color:#a40e28; font-size:.78rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
    h1 { margin:.35rem 0 .5rem; color:#17232e; font-size:clamp(2rem,4vw,3rem); letter-spacing:-.035em; }
    h2 { margin:0; font-size:1.2rem; }
    h3 { margin:0 0 .6rem; font-size:1rem; }
    .intro,.as-of,.refresh-time,.muted { color:#586676; line-height:1.5; }
    .toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:1rem; margin:1.2rem 0; }
    .refresh-time { margin:0; font-size:.88rem; }
    button { min-height:2.7rem; padding:.6rem .9rem; border:1px solid #aeb9c4; border-radius:.35rem; background:#fff; color:#263645; cursor:pointer; font:inherit; font-weight:650; }
    .primary { border-color:#9d1228; background:#9d1228; color:#fff; }
    button:disabled { opacity:.65; cursor:wait; }
    .definition,.group,.empty { padding:1.1rem; border:1px solid #dce2e8; border-radius:.55rem; background:#fff; }
    .definition { border-left:4px solid #1769aa; }
    .definition p { margin-bottom:0; line-height:1.55; }
    .groups { display:grid; gap:1rem; margin:1rem 0; padding:0; list-style:none; }
    .group > h2 { overflow-wrap:anywhere; }
    .summary,.counts { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:.65rem; margin:.9rem 0; }
    dl div { min-width:0; padding:.65rem; border-radius:.4rem; background:#f5f7fa; }
    dt { color:#586676; font-size:.84rem; }
    dd { margin:.25rem 0 0; font-size:1.1rem; font-weight:700; }
    .subsection { margin-top:1rem; }
    .error { padding:.85rem; border:1px solid #d8a5a5; border-radius:.4rem; background:#fff2f2; color:#8c1f1f; }
    @media (max-width:520px) { .page { margin:1.5rem auto; } .toolbar > * { flex:1 1 100%; } }
  `],
})
export class ManagerOverviewPage {
  private readonly api = inject(ClaimsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests = new Subject<void>();
  readonly report = signal<WorkloadReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly refreshedAt = signal<Date | null>(null);

  constructor() {
    this.requests.pipe(
      switchMap(() => {
        this.loading.set(true);
        this.error.set('');
        return this.api.workload().pipe(
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

  groupLabel(group: WorkloadGroup): string {
    const parts = [group.marketCode, group.teamId, group.officerSubjectId].filter((value): value is string => !!value);
    return parts.length ? parts.join(' / ') : 'Group details not provided';
  }

  statusEntries(group: WorkloadGroup): Array<{ status: string; count: number }> {
    return Object.entries(group.statusCounts ?? {})
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
      .map(([status, count]) => ({ status, count }));
  }

  ageingEntries(group: WorkloadGroup): Array<{ label: string; count: number | null }> {
    const bands = group.ageingBands;
    return (['0-7', '8-30', '31-90', '90+'] as const).map((label) => {
      const count = bands?.[label];
      return { label, count: typeof count === 'number' && Number.isFinite(count) ? count : null };
    });
  }

  displayCount(count: number | null): string {
    return count !== null && Number.isFinite(count) ? String(count) : 'Not reported';
  }

  statusLabel(status: string): string { return status.replace(/([a-z])([A-Z])/g, '$1 $2'); }
}
