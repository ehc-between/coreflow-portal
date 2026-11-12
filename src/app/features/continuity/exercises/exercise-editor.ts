import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Alert } from '../../../shared/ui/alert/alert';
import { Icon } from '../../../shared/ui/icon/icon';
import { ContinuityApi } from '../data/continuity-api';
import { changedFields } from '../data/continuity-display';
import { continuityErrorKey } from '../data/continuity-errors';
import { ExerciseDetail, ExerciseUpdate } from '../data/continuity.models';
import {
  ExerciseForm,
  ExerciseFormValue,
  exerciseDraft,
  exercisePlanning,
  exerciseResults,
} from './exercise-form';

/**
 * Plan a new exercise (`/continuity/exercises/new`, `?plan=` / `?ict=` preselect what
 * is exercised) or edit one (`/continuity/exercises/:id/edit`): planning fields while
 * planned, the results once completed. Only changed fields are sent.
 */
@Component({
  selector: 'app-exercise-editor',
  imports: [RouterLink, TranslocoPipe, Alert, ExerciseForm, GuideIntro, Icon, WhyItMatters],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[920px] px-4 pt-7 pb-12 sm:px-8">
      <a
        [routerLink]="id() ? ['/continuity/exercises', id()] : '/continuity/exercises'"
        class="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="14" />
        {{ (id() ? 'continuity.common.backToRecord' : 'continuity.exercises.back') | transloco }}
      </a>
      @switch (state()) {
        @case ('loading') {
          <p class="text-[14px] text-fg-muted">{{ 'continuity.common.loading' | transloco }}</p>
        }
        @case ('error') {
          <app-alert>{{ 'continuity.common.notFound' | transloco }}</app-alert>
        }
        @default {
          <h1 class="mb-1 font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            @if (exercise(); as e) {
              {{ 'continuity.exercises.editTitle' | transloco: { code: e.code, title: e.title } }}
            } @else {
              {{ 'continuity.exercises.newTitle' | transloco }}
            }
          </h1>
          @if (exercise()?.can_edit === false) {
            <app-alert tone="info">{{ 'continuity.form.readOnly' | transloco }}</app-alert>
          } @else {
            <div class="mt-3 mb-4"><app-guide-intro scope="continuity" page="exerciseForm" /></div>
            @if (error(); as key) {
              <div class="mb-4">
                <app-alert>{{ key | transloco }}</app-alert>
              </div>
            }
            <app-exercise-form
              [value]="exercise()"
              [presetPlanId]="plan()"
              [presetIctId]="ict()"
              [busy]="busy()"
              (submitted)="save($event)"
              (cancelled)="back()"
            />
            <div class="mt-6"><app-why-it-matters scope="continuity" page="exerciseForm" /></div>
          }
        }
      }
    </div>
  `,
})
export class ExerciseEditor {
  private readonly api = inject(ContinuityApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  readonly id = input<string | undefined>(undefined);
  /** Query `?plan=` / `?ict=` on `/new`. */
  readonly plan = input<string | undefined>(undefined);
  readonly ict = input<string | undefined>(undefined);

  protected readonly state = signal<'loading' | 'error' | 'ready'>('ready');
  protected readonly exercise = signal<ExerciseDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => ({
      module: 'continuity',
      entityType: 'continuity_exercise',
      entityId: this.id() ?? null,
      view: this.id() ? 'edit' : 'new',
      title: this.exercise()?.title ?? this.language.translate('continuity.exercises.newTitle'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId || !id) {
          return;
        }
        this.state.set('loading');
        this.request = this.api.getExercise(orgId, id).subscribe({
          next: (e) => {
            this.exercise.set(e);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  protected save(value: ExerciseFormValue): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const current = this.exercise();
    this.error.set(null);
    if (!current) {
      this.busy.set(true);
      this.api.createExercise(orgId, exercisePlanning(value.draft)).subscribe({
        next: (e) => {
          this.busy.set(false);
          this.notifications.success('continuity.exercises.created', { code: e.code });
          void this.router.navigate(['/continuity/exercises', e.id]);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(continuityErrorKey(err));
        },
      });
      return;
    }
    const pick = current.status === 'completed' ? exerciseResults : exercisePlanning;
    const changes: ExerciseUpdate = changedFields<ExerciseUpdate>(
      pick(exerciseDraft(current)),
      pick(value.draft),
    );
    if (Object.keys(changes).length === 0) {
      this.back();
      return;
    }
    this.busy.set(true);
    this.api.updateExercise(orgId, current.id, changes).subscribe({
      next: () => {
        this.busy.set(false);
        this.notifications.success('continuity.form.saved');
        this.back();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(continuityErrorKey(err));
      },
    });
  }

  protected back(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/continuity/exercises', id] : ['/continuity/exercises']);
  }
}
