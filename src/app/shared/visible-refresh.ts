import { EMPTY, Observable, distinctUntilChanged, fromEvent, interval, map, merge, of, switchMap } from 'rxjs';

export function refreshWhileVisible(periodMs: number, visibility$: Observable<boolean>): Observable<void> {
  if (!Number.isFinite(periodMs) || periodMs <= 0) return EMPTY;
  return visibility$.pipe(
    distinctUntilChanged(),
    switchMap((visible) => visible ? interval(periodMs).pipe(map(() => undefined)) : EMPTY),
  );
}

export function visibleRefresh(periodMs: number, documentRef: Document = document): Observable<void> {
  const visibility$ = merge(
    of(documentRef.visibilityState === 'visible'),
    fromEvent(documentRef, 'visibilitychange').pipe(map(() => documentRef.visibilityState === 'visible')),
  );
  return refreshWhileVisible(periodMs, visibility$);
}
