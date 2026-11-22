import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';
import { AuthAdapter, MOCK_PERSONAS, Role, SETTINGS } from './core/auth';
type ConnectionState = 'checking' | 'connected' | 'mock' | 'unavailable';
interface HealthResponse { mode?: string; }

@Component({ selector: 'app-root', imports: [RouterLink, RouterOutlet], templateUrl: './app.html', styleUrl: './app.css' })
export class App {
  private readonly http = inject(HttpClient);
  readonly auth = inject(AuthAdapter);
  readonly settings = inject(SETTINGS);
  readonly personas = MOCK_PERSONAS;
  readonly connectionState = signal<ConnectionState>('checking');
  readonly checkedAt = signal<Date | null>(null);
  readonly authError = signal('');
  readonly roleNames: Record<Role, string> = { Claimant: 'Claimant', ClaimsOfficer: 'Claims officer', Manager: 'Manager' };
  constructor(private readonly router: Router) {
    void this.auth.completeSignIn().catch((e: unknown) => this.authError.set(e instanceof Error ? e.message : 'Sign-in could not be completed.'));
    this.checkConnection();
  }
  checkConnection(): void {
    this.connectionState.set('checking');
    this.http.get<HealthResponse>('/api/health').pipe(catchError(() => { this.connectionState.set('unavailable'); return of(null); }), finalize(() => this.checkedAt.set(new Date()))).subscribe((response) => { if (response !== null) this.connectionState.set(response.mode === 'mock' ? 'mock' : 'connected'); });
  }
  selectPersona(subject: string): void {
    const persona = this.personas.find((p) => p.subject === subject);
    if (!persona) return;
    this.auth.selectPersona(persona);
    void this.router.navigateByUrl(this.homeFor(persona.role));
  }
  async signIn(): Promise<void> { try { await this.auth.signIn(); } catch (e) { this.authError.set(e instanceof Error ? e.message : 'Sign-in could not be started.'); } }
  switchToMockDemo(): void {
    sessionStorage.setItem('claims.mode', 'mock');
    location.reload();
  }
  homeFor(role: Role): string { return role === 'Claimant' ? '/claimant/dashboard' : role === 'ClaimsOfficer' ? '/officer/queue' : '/manager/overview'; }
}
