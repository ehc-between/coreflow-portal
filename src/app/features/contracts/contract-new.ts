import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { GuideIntro } from '../../shared/guidance/guide-intro';
import { WhyItMatters } from '../../shared/guidance/why-it-matters';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { ContractForm, ContractFormSubmit } from './contract-form';
import { ContractsApi } from './data/contracts-api';
import { ContractExtraction } from './data/contract.models';
import { contractErrorKey } from './data/contract-errors';
import {
  ContractFormValue,
  applyExtraction,
  emptyContractForm,
  toCreateRequest,
} from './data/contract-form-model';
import { obligationFromExtraction } from './data/obligations';
import { ExtractionSummary } from './extraction-summary';
import { ContractLessonLink } from './lesson-link';

/** The shortest text the analysis accepts (the backend rejects shorter with `text_required`). */
export const MIN_EXTRACT_CHARS = 40;

/**
 * Register a contract (`/contracts/new`). The user can paste the contract text and
 * let the assistant fill in the parties, dates, renewal terms and value; the
 * suggested obligations, risks and missing processor-agreement clauses are shown
 * for review, and the obligations can be added as tasks once the contract exists.
 */
@Component({
  selector: 'app-contract-new',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    GuideIntro,
    WhyItMatters,
    Card,
    Icon,
    ContractForm,
    ExtractionSummary,
    ContractLessonLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <a
        routerLink="/contracts"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'contracts.common.backToList' | transloco }}
      </a>
      <h1 class="mb-4 font-display text-[24px] font-bold tracking-[-0.03em] text-fg sm:text-[26px]">
        {{ 'contracts.form.newTitle' | transloco }}
      </h1>
      <div class="mb-5 flex flex-col gap-3">
        <app-guide-intro scope="contracts" page="form" />
      </div>

      <app-card>
        <details [open]="extractOpen()" (toggle)="extractOpen.set($any($event.target).open)">
          <summary
            class="flex cursor-pointer items-center gap-2 text-[14px] font-semibold text-fg"
            data-testid="extract-toggle"
          >
            <app-icon name="spark" [size]="15" class="text-accent" />
            {{ 'contracts.extract.title' | transloco }}
          </summary>
          <div class="mt-3 flex flex-col gap-3">
            <p class="text-[13px] text-fg-muted">{{ 'contracts.extract.intro' | transloco }}</p>
            <label for="cf-extract-text" class="text-[13px] font-semibold text-fg-muted">
              {{ 'contracts.extract.textLabel' | transloco }}
            </label>
            <textarea
              id="cf-extract-text"
              rows="8"
              maxlength="120000"
              class="w-full rounded-[10px] border border-border bg-bg px-3 py-2 text-[13px] text-fg outline-none focus:border-accent"
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
                <span class="text-[12px] text-fg-muted">
                  {{ 'contracts.extract.tooShort' | transloco }}
                </span>
              }
            </div>
            @if (extraction(); as x) {
              <p class="text-[13px] font-semibold text-pass" role="status">
                {{ 'contracts.extract.applied' | transloco }}
              </p>
              <app-contract-extraction-summary [result]="x" />
              @if (suggestedObligations() > 0) {
                <label class="flex items-center gap-2 text-[13px] text-fg">
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

      <div class="mt-6 flex flex-col gap-3">
        <app-why-it-matters scope="contracts" page="form" />
        <app-contract-lesson-link lesson="notice-and-renewal" />
      </div>
    </div>
  `,
})
export class ContractNew {
  private readonly api = inject(ContractsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

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

  constructor() {
    providePageContext(() => ({
      module: 'contracts',
      entityType: 'contract',
      view: 'new',
      title: this.language.translate('contracts.form.newTitle'),
    }));
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
    this.saving.set(true);
    this.api
      .create(orgId, toCreateRequest(event.value))
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
    void this.router.navigate(['/contracts']);
  }
}
