import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { FlowBanner } from '../../../shared/kit/flow-banner';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { FeedbackApi } from '../data/feedback-api';
import { feedbackErrorKey } from '../data/feedback-errors';
import { CustomerRef, customerIdFromRoute } from '../../../shared/customers';
import { emptyFeedbackForm, toCreateRequest } from '../data/feedback-form-model';
import { FEEDBACK_ENTITY } from '../data/feedback.models';
import { FEEDBACK_SETTINGS_LINK } from '../feedback-nav';
import { FeedbackForm, FeedbackFormSubmit } from './feedback-form';

/**
 * Register customer feedback (`/feedback/items/new`). Opened from a requirement
 * (`?fromRequirement=`) or a create-from-here flow, the new record is linked back
 * when it is saved.
 */
@Component({
  selector: 'app-feedback-new',
  imports: [WhyItMatters, FlowBanner, HelpStrip, PageHeader, FeedbackForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="feedback.form.newTitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.feedback', link: '/feedback' },
          { labelKey: 'feedback.form.newTitle' },
        ]"
        [settingsLink]="settingsLink"
        backLink="/feedback"
        backLabelKey="feedback.common.backToList"
      />
      <app-help-strip scope="feedback" page="form" lesson="handling-complaints" />
      <app-flow-banner [flow]="flow()" />
      <app-feedback-form
        mode="create"
        [value]="seed"
        [busy]="saving()"
        (submitted)="create($event)"
        (cancelled)="cancel()"
      />
      <div class="mt-8"><app-why-it-matters scope="feedback" page="form" /></div>
    </div>
  `,
})
export class FeedbackNew {
  private readonly api = inject(FeedbackApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly flows = inject(CreateFlowService);
  private readonly formCmp = viewChild(FeedbackForm);

  /** `?customer_id=` (the customer card's "+ Ny") pre-fills the Kunde field. */
  protected readonly seed = {
    ...emptyFeedbackForm(),
    customer_id: customerIdFromRoute(inject(ActivatedRoute)) ?? '',
  };
  protected readonly saving = signal(false);
  protected readonly settingsLink = FEEDBACK_SETTINGS_LINK;
  /** A create-from-here flow or `?fromRequirement=` the form was opened with. */
  private readonly route = inject(ActivatedRoute);
  protected readonly flow = this.flows.consume(this.route, {
    targetType: FEEDBACK_ENTITY,
  });

  constructor() {
    providePageContext(() => ({
      module: 'feedback',
      entityType: FEEDBACK_ENTITY,
      view: 'new',
      title: this.language.translate('feedback.form.newTitle'),
    }));
    effect(() => {
      const flow = this.flow();
      const form = this.formCmp();
      if (flow && form) {
        const p = flow.prefill;
        const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
        form.patchEmpty({ title: str(p['title']), description: str(p['description']) });
        const customerId = str(p['customer_id']) ?? null;
        const ref = (p['customer'] as CustomerRef | undefined) ?? null;
        form.patchCustomer(customerId, ref?.id === customerId ? ref : null);
      }
    });
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
        this.flows.complete(feedback.id, FEEDBACK_ENTITY).subscribe();
        void this.router.navigate(['/feedback/items', feedback.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(feedbackErrorKey(error));
      },
    });
  }

  protected cancel(): void {
    this.flows.cancel();
    void this.router.navigate(['/feedback']);
  }
}
