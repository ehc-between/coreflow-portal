import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { Icon } from '../../shared/ui/icon/icon';
import { ObligationsApi } from './data/obligations-api';
import { obligationErrorKey } from './data/obligation-errors';
import {
  ObligationFormValue,
  applyProposal,
  emptyObligationForm,
  proposalText,
  toCreateRequest,
} from './data/obligation-form-model';
import { ObligationLessonLink } from './lesson-link';
import { ObligationForm, ObligationFormSubmit } from './obligation-form';
import { ObligationProposal, ProposalAccepted } from './requirement-proposal';

/**
 * Register an obligation (`/obligations/new`). Once the title or a description is
 * filled in, the assistant can propose the applicable requirements, frameworks and
 * an evaluation frequency, which the user picks from before saving.
 */
@Component({
  selector: 'app-obligation-new',
  imports: [
    RouterLink,
    TranslocoPipe,
    GuideIntro,
    WhyItMatters,
    Icon,
    ObligationForm,
    ObligationProposal,
    ObligationLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        routerLink="/obligations"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'obligations.common.backToList' | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ 'obligations.form.newTitle' | transloco }}
      </h1>
      <div class="mb-5 flex flex-col gap-3">
        <app-guide-intro scope="obligations" page="form" />
      </div>

      <app-obligation-form
        mode="create"
        [value]="seed()"
        [busy]="saving()"
        (changed)="draft.set($event)"
        (submitted)="create($event)"
        (cancelled)="cancel()"
      >
        <app-obligation-proposal proposal [text]="assistText()" (accepted)="apply($event)" />
      </app-obligation-form>

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="obligations" page="form" />
        <app-obligation-lesson-link lesson="legal-register" />
      </div>
    </div>
  `,
})
export class ObligationNew {
  private readonly api = inject(ObligationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  protected readonly seed = signal<ObligationFormValue>(emptyObligationForm());
  protected readonly draft = signal<ObligationFormValue>(this.seed());
  protected readonly saving = signal(false);
  protected readonly assistText = computed(() => proposalText(this.draft()));

  constructor() {
    providePageContext(() => ({
      module: 'obligations',
      entityType: 'compliance_obligation',
      view: 'new',
      title: this.language.translate('obligations.form.newTitle'),
    }));
  }

  protected apply(event: ProposalAccepted): void {
    const next = applyProposal(this.draft(), event.proposal, event.chosen, true);
    this.seed.set(next);
    this.draft.set(next);
    this.notifications.info('obligations.proposal.applied');
  }

  protected create(event: ObligationFormSubmit): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.create(orgId, toCreateRequest(event.value)).subscribe({
      next: (obligation) => {
        this.saving.set(false);
        this.notifications.success('obligations.notices.created', { code: obligation.code });
        void this.router.navigate(['/obligations', obligation.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(obligationErrorKey(error));
      },
    });
  }

  protected cancel(): void {
    void this.router.navigate(['/obligations']);
  }
}
