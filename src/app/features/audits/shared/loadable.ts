import { DestroyRef, inject, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';

export type LoadState = 'idle' | 'loading' | 'error' | 'ready';

/**
 * A request-backed value as signals (zoneless-safe): `load()` cancels the previous
 * request, `state()` is loading / error / ready and `value()` the last result. A
 * `quiet` reload keeps showing the current value while it runs.
 */
export class Loadable<T> {
  readonly value = signal<T | null>(null);
  readonly state = signal<LoadState>('idle');
  readonly error = signal<unknown>(null);
  private sub: Subscription | null = null;

  load(source: Observable<T>, quiet = false): void {
    this.sub?.unsubscribe();
    if (!quiet || this.value() === null) {
      this.state.set('loading');
    }
    this.sub = source.subscribe({
      next: (value) => {
        this.value.set(value);
        this.error.set(null);
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.error.set(error);
        this.state.set('error');
      },
    });
  }

  set(value: T): void {
    this.value.set(value);
    this.state.set('ready');
  }

  cancel(): void {
    this.sub?.unsubscribe();
    this.sub = null;
  }
}

/** A {@link Loadable} whose request is cancelled when the component is destroyed. */
export function loadable<T>(): Loadable<T> {
  const l = new Loadable<T>();
  inject(DestroyRef).onDestroy(() => l.cancel());
  return l;
}
