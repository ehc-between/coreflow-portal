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
import { emptyFeedbackForm, toCreateRequest } from '../data/feedback-form-model';
import { FEEDBACK_ENTITY } from '../data/feedback.models';
import { FeedbackLessonLink } from '../lesson-link';
import { FeedbackForm, FeedbackFormSubmit } from './feedback-form';

/** Register customer feedback (`/feedback/items/new`). */
@Component({
  selector: 'app-feedback-new',
  imports: [
    RouterLink,
    TranslocoPipe,
    GuideIntro,
    WhyItMatters,
    Icon,
    FeedbackForm,
    FeedbackLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        routerLink="/feedback"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'feedback.common.backToList' | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ 'feedback.form.newTitle' | transloco }}
      </h1>
      <div class="mb-5"><app-guide-intro scope="feedback" page="form" /></div>
      <app-feedback-form
        mode="create"
        [value]="seed"
        [busy]="saving()"
        (submitted)="create($event)"
        (cancelled)="cancel()"
      />
      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="feedback" page="form" />
        <app-feedback-lesson-link lesson="handling-complaints" />
      </div>
    </div>
  `,
})
export class FeedbackNew {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly seed = emptyFeedbackForm();
  protected readonly saving = signal(false);

  constructor() {
    providePageContext(() => ({
      module: 'feedback',
      entityType: FEEDBACK_ENTITY,
      view: 'new',
      title: this.language.translate('feedback.form.newTitle'),
    }));
  }

  protected create(event: FeedbackFormSubmit): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.create(orgId, toCreateRequest(event.value)).subscribe({
      next: (feedback) => {
        this.saving.set(false);
        this.notifications.success('feedback.notices.created', { code: feedback.code });
        void this.router.navigate(['/feedback/items', feedback.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }

  protected cancel(): void {
    void this.router.navigate(['/feedback']);
  }
}
