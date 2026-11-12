import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Icon } from '../../../shared/ui/icon/icon';
import { FeedbackApi } from '../data/feedback-api';
import { feedbackErrorKey } from '../data/feedback-errors';
import { SURVEY_ENTITY } from '../data/feedback.models';
import { emptySurveyForm, toSurveyCreate } from '../data/survey-form-model';
import { FeedbackLessonLink } from '../lesson-link';
import { SurveyForm, SurveyFormSubmit } from './survey-form';

/** Design a new survey (`/feedback/surveys/new`); it starts as a draft. */
@Component({
  selector: 'app-survey-new',
  imports: [
    RouterLink,
    TranslocoPipe,
    GuideIntro,
    WhyItMatters,
    Icon,
    SurveyForm,
    FeedbackLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        routerLink="/feedback/surveys"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'feedback.common.backToSurveys' | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ 'feedback.surveyForm.newTitle' | transloco }}
      </h1>
      <div class="mb-5"><app-guide-intro scope="feedback" page="surveyForm" /></div>
      <app-survey-form
        mode="create"
        [value]="seed"
        [busy]="saving()"
        (submitted)="create($event)"
        (cancelled)="cancel()"
      />
      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="feedback" page="surveyForm" />
        <app-feedback-lesson-link lesson="good-survey-questions" />
      </div>
    </div>
  `,
})
export class SurveyNew {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly seed = emptySurveyForm();
  protected readonly saving = signal(false);

  constructor() {
    providePageContext(() => ({
      module: 'feedback',
      entityType: SURVEY_ENTITY,
      view: 'new',
      title: this.language.translate('feedback.surveyForm.newTitle'),
    }));
  }

  protected create(event: SurveyFormSubmit): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.createSurvey(orgId, toSurveyCreate(event.value)).subscribe({
      next: (survey) => {
        this.saving.set(false);
        this.notifications.success('feedback.notices.surveyCreated', { code: survey.code });
        void this.router.navigate(['/feedback/surveys', survey.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }

  protected cancel(): void {
    void this.router.navigate(['/feedback/surveys']);
  }
}
