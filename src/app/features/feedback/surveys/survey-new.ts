import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { FeedbackApi } from '../data/feedback-api';
import { feedbackErrorKey } from '../data/feedback-errors';
import { SURVEY_ENTITY } from '../data/feedback.models';
import { emptySurveyForm, toSurveyCreate } from '../data/survey-form-model';
import { FEEDBACK_SETTINGS_LINK } from '../feedback-nav';
import { SurveyForm, SurveyFormSubmit } from './survey-form';

/** Design a new survey (`/feedback/surveys/new`); it starts as a draft. */
@Component({
  selector: 'app-survey-new',
  imports: [WhyItMatters, HelpStrip, PageHeader, SurveyForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="feedback.surveyForm.newTitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.feedback', link: '/feedback' },
          { labelKey: 'feedback.tabs.surveys', link: '/feedback/surveys' },
          { labelKey: 'feedback.surveyForm.newTitle' },
        ]"
        [settingsLink]="settingsLink"
        backLink="/feedback/surveys"
        backLabelKey="feedback.common.backToSurveys"
      />
      <app-help-strip scope="feedback" page="surveyForm" lesson="good-survey-questions" />
      <app-survey-form
        mode="create"
        [value]="seed"
        [busy]="saving()"
        (submitted)="create($event)"
        (cancelled)="cancel()"
      />
      <div class="mt-8"><app-why-it-matters scope="feedback" page="surveyForm" /></div>
    </div>
  `,
})
export class SurveyNew {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  protected readonly settingsLink = FEEDBACK_SETTINGS_LINK;
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
