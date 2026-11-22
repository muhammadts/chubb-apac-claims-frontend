import { TestScheduler } from 'rxjs/testing';
import { take } from 'rxjs';
import { refreshWhileVisible } from './visible-refresh';

describe('refreshWhileVisible', () => {
  it('pauses while hidden and resumes on visibility without an immediate refresh', () => {
    const scheduler = new TestScheduler((actual, expected) => expect(actual).toEqual(expected));
    scheduler.run(({ cold, flush }) => {
      const frames: number[] = [];
      const visibility = cold('v------h-------v---------|', { v: true, h: false });
      refreshWhileVisible(3, visibility).pipe(take(5)).subscribe(() => frames.push(scheduler.frame));
      flush();
      expect(frames).toEqual([3, 6, 18, 21, 24]);
    });
  });

  it('does not schedule refreshes when polling is disabled', () => {
    const scheduler = new TestScheduler((actual, expected) => expect(actual).toEqual(expected));
    scheduler.run(({ cold, expectObservable }) => {
      const visibility = cold('v----|', { v: true });
      expectObservable(refreshWhileVisible(0, visibility)).toBe('|');
    });
  });
});
