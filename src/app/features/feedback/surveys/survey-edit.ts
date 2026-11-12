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
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { Alert } from '../../../shared/ui/alert/alert';
import { Icon } from '../../../shared/ui/icon/icon';
import { FeedbackApi } from '../data/feedback-api';
import { feedbackErrorKey } from '../data/feedback-errors';
import { SURVEY_ENTITY, Survey } from '../data/feedback.models';
import { SurveyFormValue, formFromSurvey, toSurveyUpdate } from '../data/survey-form-model';
import { SurveyForm, SurveyFormSubmit } from './survey-form';

/** Edit a survey (`/feedback/surveys/:id/edit`); questions are locked once published. */
@Component({
  selector: 'app-survey-edit',
  imports: [RouterLink, TranslocoPipe, GuideIntro, Alert, Icon, SurveyForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        [routerLink]="['/feedback/surveys', id()]"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'feedback.common.backToSurvey' | transloco }}
      </a>
      @switch (state()) {
        @case ('loading') {
          <p class="py-10 text-center text-[14px] text-fg-muted" role="status">
            {{ 'feedback.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <app-alert tone="error">{{ errorKey() | transloco }}</app-alert>
        }
        @default {
          @if (survey(); as s) {
            <h1
              class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]"
            >
              {{ 'feedback.surveyForm.editTitle' | transloco: { code: s.code } }}
            </h1>
            <div class="mb-5"><app-guide-intro scope="feedback" page="surveyForm" /></div>
            @if (!s.can_edit) {
              <app-alert tone="info">{{ 'feedback.surveyForm.readOnly' | transloco }}</app-alert>
            } @else if (seed(); as value) {
              <app-survey-form
                mode="edit"
                [value]="value"
                [questionsLocked]="s.questions_locked"
                [ownerName]="s.owner?.name ?? null"
                [busy]="saving()"
                (submitted)="save($event)"
                (cancelled)="back()"
              />
            }
          }
        }
      }
    </div>
  `,
})
export class SurveyEdit {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly errorKey = signal('feedback.common.loadFailed');
  protected readonly survey = signal<Survey | null>(null);
  protected readonly seed = signal<SurveyFormValue | null>(null);
  protected readonly saving = signal(false);

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    providePageContext(() => {
      const s = this.survey();
      return {
        module: 'feedback',
        entityType: SURVEY_ENTITY,
        entityId: this.id(),
        view: 'edit',
        title: s ? `${s.code} ${s.title}` : null,
      };
    });
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.id();
      untracked(() => this.load(orgId, id));
    });
  }

  protected save(event: SurveyFormSubmit): void {
    const orgId = this.selectedOrg.currentOrgId();
    const original = this.seed();
    const survey = this.survey();
    if (!orgId || !original || !survey || this.saving()) {
      return;
    }
    const body = toSurveyUpdate(original, event.value, event.changeReason, survey.questions_locked);
    if (Object.keys(body).filter((k) => k !== 'change_reason').length === 0) {
      this.notifications.info('feedback.notices.noChanges');
      this.back();
      return;
    }
    this.saving.set(true);
    this.api.updateSurvey(orgId, this.id(), body).subscribe({
      next: () => {
        this.saving.set(false);
        this.notifications.success('feedback.notices.saved');
        this.back();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/feedback/surveys', this.id()]);
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.getSurvey(orgId, id).subscribe({
      next: (survey) => {
        this.survey.set(survey);
        this.seed.set(formFromSurvey(survey));
        this.state.set('ready');
      },
      error: (error: unknown) => {
        this.errorKey.set(feedbackErrorKey(error));
        this.state.set('error');
      },
    });
  }
}
