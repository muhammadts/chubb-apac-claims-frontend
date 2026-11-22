import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { catchError, finalize, of } from 'rxjs';

type ConnectionState = 'checking' | 'connected' | 'mock' | 'unavailable';
interface HealthResponse { mode?: string; }

@Component({
  selector: 'app-root',
  imports: [DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly http = inject(HttpClient);
  readonly connectionState = signal<ConnectionState>('checking');
  readonly checkedAt = signal<Date | null>(null);

  constructor() {
    this.checkConnection();
  }

  checkConnection(): void {
    this.connectionState.set('checking');
    this.http
      .get<HealthResponse>('/api/health')
      .pipe(
        catchError(() => {
          this.connectionState.set('unavailable');
          return of(null);
        }),
        finalize(() => this.checkedAt.set(new Date())),
      )
      .subscribe((response) => {
        if (response !== null) {
          this.connectionState.set(response.mode === 'mock' ? 'mock' : 'connected');
        }
      });
  }
}
