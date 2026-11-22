import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ClaimCard, ClaimsApi } from '../../core/claims-api';
import { claimantErrorMessage } from './claimant-errors';

@Component({
  selector: 'app-claim-list-page',
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page">
      <p class="eyebrow">Claimant workspace</p>
      <h1>Your claims</h1>
      <p class="intro">Review the status and latest activity for claims you have submitted.</p>
      <div class="actions">
        <a class="primary" routerLink="/claimant/claims/new">Start a claim</a>
        <button type="button" (click)="refresh()" [disabled]="loading()">Refresh claims</button>
      </div>
      @if (refreshedAt(); as refreshed) {
        <p class="refresh-time">Last refreshed {{ refreshed.toLocaleTimeString() }}</p>
      }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (loading() && !loaded()) {
        <p role="status" aria-live="polite">Loading your claims…</p>
      } @else if (loaded() && claims().length === 0) {
        <section class="empty" aria-labelledby="empty-title">
          <h2 id="empty-title">No claims yet</h2>
          <p>When you submit a claim, it will appear here.</p>
          <a routerLink="/claimant/claims/new">Start a claim</a>
        </section>
      } @else if (claims().length > 0) {
        <ul class="claims" aria-label="Your claims">
          @for (claim of claims(); track claim.claimId) {
            <li>
              <article class="claim-card">
                <div class="card-heading">
                  <h2><a [routerLink]="['/claimant/claims', claim.claimId]">{{ claim.claimNumber }}</a></h2>
                  <span class="status">{{ statusLabel(claim.status) }}</span>
                </div>
                <p>{{ claim.lineOfBusiness }} claim · {{ claim.marketCode }}</p>
                <p>Submitted <time [attr.datetime]="claim.submittedAt">{{ claim.submittedAt | date:'medium' }}</time></p>
                @if (claim.status === 'AwaitingInformation') {
                  <p class="request-notice"><strong>Claim is awaiting information.</strong> Open details to review any outstanding request.</p>
                }
                <a class="details-link" [routerLink]="['/claimant/claims', claim.claimId]">View claim details</a>
              </article>
            </li>
          }
        </ul>
      }
      @if (nextCursor()) {
        <button type="button" class="load-more" (click)="loadMore()" [disabled]="loadingMore()">
          {{ loadingMore() ? 'Loading…' : 'Load more claims' }}
        </button>
      }
    </section>
  `,
  styles: [`
    :host { display:block; }
    .page { max-width:900px; margin:clamp(2rem,7vh,5rem) auto; padding:0 clamp(1rem,5vw,3rem) 3rem; }
    .eyebrow { margin:0; color:#a40e28; font-size:.78rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
    h1 { margin:.35rem 0 .5rem; color:#17232e; font-size:clamp(2rem,4vw,3rem); letter-spacing:-.035em; }
    .intro,.refresh-time { color:#586676; line-height:1.55; }
    .refresh-time { font-size:.85rem; }
    .actions { display:flex; flex-wrap:wrap; gap:.75rem; margin:1.4rem 0; }
    button,.primary { min-height:2.75rem; padding:.65rem .9rem; border:1px solid #aeb9c4; border-radius:.35rem; background:#fff; color:#263645; cursor:pointer; font-weight:650; text-decoration:none; }
    .primary { border-color:#9d1228; background:#9d1228; color:#fff; }
    button:disabled { opacity:.65; cursor:wait; }
    .claims { display:grid; gap:1rem; margin:1.5rem 0; padding:0; list-style:none; }
    .claim-card,.empty { padding:1.2rem; border:1px solid #dce2e8; border-radius:.55rem; background:#fff; }
    .card-heading { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
    h2 { margin:0; font-size:1.15rem; }
    .card-heading a,.details-link,.empty a { color:#8f1025; font-weight:700; }
    .status { padding:.3rem .6rem; border-radius:999px; background:#edf1f5; color:#344454; font-size:.82rem; font-weight:700; }
    .claim-card p { color:#586676; line-height:1.5; }
    .request-notice { padding:.8rem; border-left:4px solid #b47900; background:#fff8e8; color:#493b1e!important; }
    .details-link { display:inline-block; padding:.25rem 0; }
    .empty { margin-top:1.5rem; }
    .empty h2 { margin-bottom:.5rem; }
    .error { padding:.9rem; border:1px solid #d8a5a5; border-radius:.4rem; background:#fff2f2; color:#8c1f1f; }
    .load-more { display:block; margin:1.25rem auto; }
    @media (max-width:560px) {
      .page { margin:1.5rem auto; }
      .card-heading { align-items:flex-start; flex-direction:column; gap:.6rem; }
      .actions > * { flex:1 1 100%; text-align:center; }
    }
  `],
})
export class ClaimListPage {
  private readonly api = inject(ClaimsApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly claims = signal<ClaimCard[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly refreshedAt = signal<Date | null>(null);

  constructor() { this.refresh(); }

  refresh(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.claimantClaims().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (page) => {
        this.claims.set(page.items);
        this.nextCursor.set(page.nextCursor);
        this.loaded.set(true);
        this.refreshedAt.set(new Date());
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(claimantErrorMessage(error));
        this.loaded.set(true);
        this.loading.set(false);
      },
    });
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.error.set('');
    this.api.claimantClaims(20, cursor).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (page) => {
        const existing = new Set(this.claims().map((claim) => claim.claimId));
        this.claims.update((claims) => [...claims, ...page.items.filter((claim) => !existing.has(claim.claimId))]);
        this.nextCursor.set(page.nextCursor);
        this.refreshedAt.set(new Date());
        this.loadingMore.set(false);
      },
      error: (error: unknown) => {
        this.error.set(claimantErrorMessage(error));
        this.loadingMore.set(false);
      },
    });
  }

  statusLabel(status: string): string { return status.replace(/([a-z])([A-Z])/g, '$1 $2'); }
}
