import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, Subscription, of, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SelectedOrgService } from '../org/selected-org.service';
import { GuidanceApi } from './guidance-api';
import { LearningProgressItem, ProgressEvent } from './guidance.models';

/**
 * The signed-in user's own lesson progress in the selected org. Loads on first use
 * (`ensureLoaded`) and again whenever the user or org changes; `record` posts a
 * progress event and merges the returned row.
 */
@Injectable({ providedIn: 'root' })
export class LearningProgressService {
  private readonly api = inject(GuidanceApi);
  private readonly auth = inject(AuthService);
  private readonly selectedOrg = inject(SelectedOrgService);

  private readonly _items = signal<readonly LearningProgressItem[]>([]);
  private readonly _loading = signal(false);
  private readonly _loaded = signal(false);
  private readonly _failed = signal(false);
  private wanted = false;
  /** The org whose progress is loading or loaded (null = none). */
  private loadedFor: string | null = null;
  private loadSub: Subscription | null = null;

  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly failed = this._failed.asReadonly();

  /** Progress rows keyed by `lesson_key` (`"<scope>.<lesson>"`). */
  readonly byKey = computed(
    () => new Map(this._items().map((item) => [item.lesson_key, item] as const)),
  );
  readonly completedCount = computed(() => this._items().filter((i) => i.completed_at).length);
  readonly quizzesPassed = computed(() => this._items().filter((i) => i.quiz_passed).length);

  constructor() {
    effect(() => {
      const signedIn = this.auth.isAuthenticated();
      const orgId = this.selectedOrg.currentOrgId();
      const owner = signedIn ? orgId : null;
      untracked(() => {
        if (owner === this.loadedFor) {
          return; // already loading/loaded for this org (e.g. via ensureLoaded)
        }
        this.loadSub?.unsubscribe();
        this.loadedFor = null;
        this._items.set([]);
        this._loading.set(false);
        this._loaded.set(false);
        this._failed.set(false);
        if (owner && this.wanted) {
          this.load(owner);
        }
      });
    });
  }

  /** Load the progress for the current org if it is not loaded yet. */
  ensureLoaded(): void {
    this.wanted = true;
    const orgId = this.auth.isAuthenticated() ? this.selectedOrg.currentOrgId() : null;
    if (orgId && orgId !== this.loadedFor) {
      this.loadSub?.unsubscribe();
      this.load(orgId);
    }
  }

  /** Record a progress event for the current org; emits the updated row (or null without an org). */
  record(
    module: string,
    lessonKey: string,
    event: ProgressEvent,
    result?: { readonly score: number; readonly passed: boolean },
  ): Observable<LearningProgressItem | null> {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return of(null);
    }
    const body =
      event === 'quiz' && result
        ? { module, lesson_key: lessonKey, event, score: result.score, passed: result.passed }
        : { module, lesson_key: lessonKey, event };
    return this.api.recordProgress(orgId, body).pipe(tap((item) => this.merge(item)));
  }

  private load(orgId: string): void {
    this.loadedFor = orgId;
    this._loading.set(true);
    this._failed.set(false);
    this.loadSub = this.api.listProgress(orgId).subscribe({
      next: (res) => {
        this._items.set(res.items);
        this._loading.set(false);
        this._loaded.set(true);
      },
      error: () => {
        // Allow a later ensureLoaded() (e.g. the next page visit) to retry.
        this.loadedFor = null;
        this._loading.set(false);
        this._loaded.set(true);
        this._failed.set(true);
      },
    });
  }

  private merge(item: LearningProgressItem): void {
    this._items.update((items) => {
      const rest = items.filter((i) => i.lesson_key !== item.lesson_key);
      return [...rest, item].sort((a, b) => a.lesson_key.localeCompare(b.lesson_key));
    });
  }
}
