import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { FlowBanner } from '../../shared/kit/flow-banner';
import { Card } from '../../shared/ui/card/card';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { customerIdFromRoute } from '../../shared/customers';
import { ObligationsApi } from './data/obligations-api';
import { ENTITY_TYPE } from './data/obligation.models';
import { obligationErrorKey } from './data/obligation-errors';
import {
  ObligationFormValue,
  applyProposal,
  applySeed,
  emptyObligationForm,
  proposalText,
  seedFromPrefill,
  toCreateRequest,
} from './data/obligation-form-model';
import { LibraryEntry, OBLIGATION_LIBRARY, libraryKey } from './data/obligation-library';
import { ObligationForm, ObligationFormSubmit } from './obligation-form';
import { ObligationProposal, ProposalAccepted } from './requirement-proposal';

/**
 * Register an obligation (`/obligations/new`). A beginner can start from the library
 * of common Norwegian and EU laws (authority, Lovdata link, typical duties and the
 * standards' clauses filled in). Arriving from another register ("Create from this"
 * on an environmental aspect, interested party, contract or AI system) pre-fills the
 * form and links the new obligation back on save. Once the title or a description is
 * filled in, the assistant can propose duties and an evaluation frequency.
 */
@Component({
  selector: 'app-obligation-new',
  imports: [
    TranslocoPipe,
    WhyItMatters,
    FlowBanner,
    Card,
    HelpStrip,
    PageHeader,
    ObligationForm,
    ObligationProposal,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="obligations.form.newTitle"
        [breadcrumbs]="[
          { labelKey: 'modules.names.obligations', link: '/obligations' },
          { labelKey: 'obligations.form.newTitle' },
        ]"
        backLink="/obligations"
        backLabelKey="obligations.common.backToList"
      />
      <app-help-strip scope="obligations" page="form" lesson="legal-register" />

      <app-flow-banner [flow]="flow()" (cancelled)="cancelFlow()" />

      <app-obligation-form
        mode="create"
        [value]="seed()"
        [busy]="saving()"
        (changed)="draft.set($event)"
        (submitted)="create($event)"
        (cancelled)="cancel()"
      >
        @if (!flow()) {
          <app-card before>
            <h2 class="font-display text-section font-bold text-fg">
              {{ 'obligations.library.title' | transloco }}
            </h2>
            <p class="mt-1 mb-3 text-meta text-fg-muted">
              {{ 'obligations.library.body' | transloco }}
            </p>
            <ul class="flex flex-wrap gap-2" data-testid="library">
              @for (e of library; track e.key) {
                <li>
                  <button
                    type="button"
                    class="rounded-full border px-3 py-1.5 text-ui font-semibold focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    [class]="
                      picked() === e.key
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-border bg-surface text-fg hover:bg-surface-2'
                    "
                    [attr.aria-pressed]="picked() === e.key"
                    (click)="useLibrary(e)"
                    [attr.data-testid]="'library-' + e.key"
                  >
                    {{ libraryKey(e, 'short') | transloco }}
                  </button>
                </li>
              }
            </ul>
            @if (picked()) {
              <p class="mt-3 text-meta text-fg-muted" role="status">
                {{ 'obligations.library.applied' | transloco }}
              </p>
            }
          </app-card>
        }
        <app-obligation-proposal proposal [text]="assistText()" (accepted)="apply($event)" />
      </app-obligation-form>

      <div class="mt-8">
        <app-why-it-matters scope="obligations" page="form" />
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
  private readonly flows = inject(CreateFlowService);

  protected readonly library = OBLIGATION_LIBRARY;
  protected readonly libraryKey = libraryKey;
  /** The create-from-here flow this form was opened with (`?flow=`), if any. */
  private readonly route = inject(ActivatedRoute);
  protected readonly flow = this.flows.consume(this.route, {
    targetType: ENTITY_TYPE,
  });

  protected readonly seed = signal<ObligationFormValue>(emptyObligationForm());
  protected readonly draft = signal<ObligationFormValue>(this.seed());
  protected readonly saving = signal(false);
  protected readonly picked = signal<string | null>(null);
  protected readonly assistText = computed(() => proposalText(this.draft()));

  constructor() {
    providePageContext(() => ({
      module: 'obligations',
      entityType: ENTITY_TYPE,
      view: 'new',
      title: this.language.translate('obligations.form.newTitle'),
    }));
    // The Kunde field from the customer card's "+ Ny" link (`?customer_id=`).
    const customerId = customerIdFromRoute(this.route);
    if (customerId) {
      this.replace(
        applySeed(this.draft(), { customer_id: customerId, obligation_type: 'contract' }),
      );
    }
    // Pre-fill once from the flow's values (they arrive async after a reload).
    let applied = false;
    effect(() => {
      const flow = this.flow();
      if (flow && !applied) {
        applied = true;
        untracked(() => this.replace(applySeed(this.draft(), seedFromPrefill(flow.prefill))));
      }
    });
  }

  protected useLibrary(entry: LibraryEntry): void {
    const t = (path: string) => this.language.translate(libraryKey(entry, path));
    // A fresh start from the entry; what the user typed in the title is replaced.
    const base: ObligationFormValue = { ...this.draft(), title: '', description: '', issuer: '' };
    this.replace(
      applySeed(
        { ...base, duties: [], clause_refs: [], frameworks: [], reference: '', source_url: '' },
        {
          title: t('title'),
          description: t('description'),
          issuer: t('issuer'),
          reference: entry.reference,
          source_url: entry.source_url,
          jurisdiction: entry.jurisdiction,
          obligation_type: entry.obligation_type,
          frameworks: entry.frameworks,
          clause_refs: entry.clause_refs,
          evaluation_rrule: entry.evaluation_rrule,
          duties: entry.duties.map((d) => ({
            title: t(`duties.${d.id}`),
            clause_refs: d.clause_refs,
          })),
        },
      ),
    );
    this.picked.set(entry.key);
  }

  protected apply(event: ProposalAccepted): void {
    this.replace(applyProposal(this.draft(), event.proposal, event.chosen, true));
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
        this.flows.complete(obligation.id, ENTITY_TYPE).subscribe();
        void this.router.navigate(['/obligations', obligation.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notifications.error(obligationErrorKey(error));
      },
    });
  }

  protected cancelFlow(): void {
    this.flows.cancel();
  }

  protected cancel(): void {
    void this.router.navigate(['/obligations']);
  }

  private replace(next: ObligationFormValue): void {
    this.seed.set(next);
    this.draft.set(next);
  }
}
