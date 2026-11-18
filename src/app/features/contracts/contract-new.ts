import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { FlowBanner } from '../../shared/kit/flow-banner';
import { Card } from '../../shared/ui/card/card';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { Breadcrumb, PageHeader } from '../../shared/ui/page-header/page-header';
import { ContractForm, ContractFormSubmit } from './contract-form';
import { CONTRACTS_CRUMB } from './contracts-nav';
import { ContractsApi } from './data/contracts-api';
import { ContractExtraction } from './data/contract.models';
import { contractErrorKey } from './data/contract-errors';
import {
  ContractFormValue,
  applyExtraction,
  emptyContractForm,
  formFromPrefill,
  toCreateRequest,
} from './data/contract-form-model';
import { obligationFromExtraction } from './data/obligations';
import { aiClauseFindings } from './contract-dpa-checklist';
import { ExtractionSummary } from './extraction-summary';

/** The shortest text the analysis accepts (the backend rejects shorter with `text_required`). */
export const MIN_EXTRACT_CHARS = 40;

/**
 * Register a contract (`/contracts/new`). The user can paste the contract text and
 * let the assistant fill in the parties, dates, renewal terms and value; the
 * suggested obligations, risks and missing processor-agreement clauses are shown
 * for review, and the obligations can be added as tasks once the contract exists.
 *
 * Also the end of two "create from here" flows: supplier → contract (the
 * counterparty is linked to the supplier) and contract → data processing agreement
 * (prefilled from the main contract, which the new DPA then covers).
 */
@Component({
  selector: 'app-contract-new',
  imports: [
    TranslocoPipe,
    AiAssistButton,
    WhyItMatters,
    FlowBanner,
    Card,
    HelpStrip,
    Icon,
    PageHeader,
    ContractForm,
    ExtractionSummary,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[760px] px-4 pt-6 pb-24 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="contracts.form.newTitle"
        [breadcrumbs]="breadcrumbs"
        backLink="/contracts"
        backLabelKey="contracts.common.backToList"
      />
      <app-help-strip
        class="mb-5 block"
        scope="contracts"
        page="form"
        lesson="notice-and-renewal"
      />
      <app-flow-banner [flow]="flow()" />

      <app-card>
        <details [open]="extractOpen()" (toggle)="extractOpen.set($any($event.target).open)">
          <summary
            class="flex cursor-pointer items-center gap-2 text-body font-semibold text-fg"
            data-testid="extract-toggle"
          >
            <app-icon name="spark" [size]="15" class="text-accent" />
            {{ 'contracts.extract.title' | transloco }}
          </summary>
          <div class="mt-3 flex flex-col gap-3">
            <p class="text-ui text-fg-muted">{{ 'contracts.extract.intro' | transloco }}</p>
            <label for="cf-extract-text" class="text-ui font-semibold text-fg-muted">
              {{ 'contracts.extract.textLabel' | transloco }}
            </label>
            <textarea
              id="cf-extract-text"
              rows="8"
              maxlength="120000"
              class="w-full rounded-tile border border-border bg-bg px-3 py-2 text-ui text-fg outline-none focus:border-accent"
              [value]="extractText()"
              (input)="extractText.set($any($event.target).value)"
            ></textarea>
            <div class="flex flex-wrap items-center gap-2">
              <app-ai-assist-button
                assist="contracts.extract"
                labelKey="contracts.extract.run"
                [input]="{ text: extractText() }"
                [disabled]="extractText().trim().length < minChars"
                (result)="onExtracted($any($event))"
              />
              @if (extractText().trim().length > 0 && extractText().trim().length < minChars) {
                <span class="text-meta text-fg-muted">
                  {{ 'contracts.extract.tooShort' | transloco }}
                </span>
              }
            </div>
            @if (extraction(); as x) {
              <p class="text-ui font-semibold text-pass-ink" role="status">
                {{ 'contracts.extract.applied' | transloco }}
              </p>
              <app-contract-extraction-summary [result]="x" />
              @if (suggestedObligations() > 0) {
                <label class="flex items-center gap-2 text-ui text-fg">
                  <input
                    type="checkbox"
                    class="h-4 w-4 accent-[var(--accent)]"
                    [checked]="addObligations()"
                    (change)="addObligations.set($any($event.target).checked)"
                    data-testid="add-obligations"
                  />
                  {{
                    'contracts.extract.addObligationsOnCreate'
                      | transloco: { count: suggestedObligations() }
                  }}
                </label>
              }
            }
          </div>
        </details>
      </app-card>

      <div class="mt-5">
        <app-contract-form
          mode="create"
          [value]="seed()"
          [busy]="saving()"
          (changed)="draft.set($event)"
          (submitted)="create($event)"
          (cancelled)="cancel()"
        />
      </div>

      <div class="mt-8"><app-why-it-matters scope="contracts" page="form" /></div>
    </div>
  `,
})
export class ContractNew {
  private readonly api = inject(ContractsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly flows = inject(CreateFlowService);

  /** The create-from-here flow this form was opened with (supplier → contract, contract → DPA). */
  protected readonly flow = this.flows.consume(inject(ActivatedRoute), {
    targetType: 'contract',
  });

  protected readonly breadcrumbs: readonly Breadcrumb[] = [
    CONTRACTS_CRUMB,
    { labelKey: 'contracts.form.newTitle' },
  ];
  protected readonly minChars = MIN_EXTRACT_CHARS;
  protected readonly seed = signal<ContractFormValue>(emptyContractForm());
  protected readonly draft = signal<ContractFormValue>(this.seed());
  protected readonly saving = signal(false);
  protected readonly extractOpen = signal(false);
  protected readonly extractText = signal('');
  protected readonly extraction = signal<ContractExtraction | null>(null);
  protected readonly addObligations = signal(false);
  protected readonly suggestedObligations = computed(
    () => (this.extraction()?.obligations ?? []).filter((o) => o?.title).length,
  );

  private prefilled = false;

  constructor() {
    providePageContext(() => ({
      module: 'contracts',
      entityType: 'contract',
      view: 'new',
      title: this.language.translate('contracts.form.newTitle'),
    }));
    // The flow prefill can arrive after the first render (restored from its token).
    effect(() => {
      const flow = this.flow();
      if (flow && !this.prefilled && Object.keys(flow.prefill ?? {}).length) {
        this.prefilled = true;
        const next = formFromPrefill(this.draft(), flow.prefill as Record<string, unknown>);
        this.seed.set(next);
        this.draft.set(next);
      }
    });
  }

  protected onExtracted(result: ContractExtraction | null): void {
    if (!result || typeof result !== 'object') {
      return;
    }
    this.extraction.set(result);
    const next = applyExtraction(this.draft(), result);
    this.seed.set(next);
    this.draft.set(next);
  }

  protected create(event: ContractFormSubmit): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.saving()) {
      return;
    }
    const obligations =
      this.addObligations() && this.extraction()
        ? (this.extraction()?.obligations ?? [])
            .filter((o) => o?.title)
            .map((o) => obligationFromExtraction(o))
        : [];
    const value = event.value;
    // Missing clauses the extraction found are stored as unconfirmed checklist findings.
    const dpaClauses =
      value.contract_type === 'dpa' || value.personal_data_role !== 'none'
        ? aiClauseFindings(
            [],
            (this.extraction()?.missing_dpa_clauses ?? []).map((key) => ({ key, present: false })),
          )
        : [];
    const body = toCreateRequest(value);
    this.saving.set(true);
    this.api
      .create(orgId, dpaClauses.length ? { ...body, dpa_clauses: dpaClauses } : body)
      .pipe(
        switchMap((contract) =>
          obligations.length
            ? forkJoin(
                obligations.map((o) =>
                  this.api.addObligation(orgId, contract.id, o).pipe(catchError(() => of(null))),
                ),
              ).pipe(switchMap((added) => of({ contract, failed: added.some((a) => !a) })))
            : of({ contract, failed: false }),
        ),
        // Link the new contract back to where it was created from (no-op without a flow).
        switchMap((result) =>
          this.flow()
            ? this.flows.complete(result.contract.id, 'contract').pipe(
                catchError(() => of(null)),
                switchMap(() => of(result)),
              )
            : of(result),
        ),
      )
      .subscribe({
        next: ({ contract, failed }) => {
          this.saving.set(false);
          this.notifications.success('contracts.notices.created', { code: contract.code });
          if (failed) {
            this.notifications.warning('contracts.notices.obligationsPartly');
          }
          void this.router.navigate(['/contracts', contract.id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.notifications.error(contractErrorKey(error));
        },
      });
  }

  protected cancel(): void {
    this.flows.cancel();
    void this.router.navigate(['/contracts']);
  }
}
