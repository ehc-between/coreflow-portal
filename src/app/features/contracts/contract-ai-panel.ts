import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, concat, last, of, toArray } from 'rxjs';
import { Attachment } from '../../core/attachments/attachment.models';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { ContractsApi } from './data/contracts-api';
import {
  Contract,
  ContractExtraction,
  ContractUpdate,
  DpaCheckResult,
  ExtractedObligation,
  PERM_WRITE,
  PartyIn,
} from './data/contract.models';
import { contractErrorKey } from './data/contract-errors';
import { applyExtraction, formFromContract, toUpdateRequest } from './data/contract-form-model';
import { obligationFromExtraction } from './data/obligations';
import { ExtractionSummary, dpaClauseKey } from './extraction-summary';

/** Files the analysis can read server-side (PDF and plain text). */
export function isReadableFile(a: Attachment): boolean {
  const type = (a.content_type ?? '').toLowerCase();
  const name = a.filename.toLowerCase();
  return (
    type === 'application/pdf' ||
    type.startsWith('text/') ||
    name.endsWith('.pdf') ||
    name.endsWith('.txt') ||
    name.endsWith('.md')
  );
}

/**
 * What the extraction would change on an existing contract: the empty register
 * fields it can fill and the parties not yet listed. Filled-in fields are kept.
 */
export function extractionChanges(
  contract: Contract,
  x: ContractExtraction,
): { readonly update: ContractUpdate; readonly parties: readonly PartyIn[] } {
  const current = formFromContract(contract);
  const merged = applyExtraction(current, x);
  const update = toUpdateRequest(current, merged, '');
  // The title and type are already set on a registered contract, and a yes/no the
  // user recorded is only ever switched on (never off) by a suggestion.
  const rest = Object.fromEntries(
    Object.entries(update).filter(
      ([key, value]) =>
        key !== 'title' &&
        key !== 'contract_type' &&
        !((key === 'auto_renew' || key === 'processes_personal_data') && value === false),
    ),
  ) as ContractUpdate;
  const known = new Set(contract.parties.map((p) => p.name.trim().toLowerCase()));
  const parties = merged.parties
    .filter((p) => p.name.trim() && !known.has(p.name.trim().toLowerCase()))
    .map((p) => ({
      name: p.name.trim(),
      role: p.role,
      is_internal: false,
      org_number: p.org_number.trim() || null,
    }));
  return { update: rest, parties };
}

/**
 * The contract's AI actions on an attached file: extract the register details,
 * obligations and risks (and apply them after review), and check a processor
 * agreement against GDPR Art. 28(3). Nothing is saved without a click.
 */
@Component({
  selector: 'app-contract-ai-panel',
  imports: [TranslocoPipe, AiAssistButton, Badge, Button, Card, Icon, ExtractionSummary],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card>
      <h2 class="mb-1 flex items-center gap-2 font-display text-[15px] font-bold text-fg">
        <app-icon name="spark" [size]="15" class="text-accent" />
        {{ 'contracts.ai.title' | transloco }}
      </h2>
      <p class="mb-3 text-[13px] text-fg-muted">{{ 'contracts.ai.intro' | transloco }}</p>

      @if (files().length === 0) {
        <p class="text-[13px] text-fg-muted" data-testid="ai-no-files">
          {{ 'contracts.ai.noFiles' | transloco }}
        </p>
      } @else {
        <div class="flex flex-col gap-3">
          <label class="flex flex-col gap-1 text-[13px] font-semibold text-fg-muted">
            {{ 'contracts.ai.file' | transloco }}
            <select
              class="h-10 rounded-[10px] border border-border bg-bg px-2 text-[13.5px] text-fg"
              (change)="fileId.set($any($event.target).value)"
              data-testid="ai-file"
            >
              @for (f of files(); track f.id) {
                <option [value]="f.id" [selected]="fileId() === f.id">{{ f.filename }}</option>
              }
            </select>
          </label>
          <div class="flex flex-wrap gap-2">
            @if (canWrite()) {
              <app-ai-assist-button
                assist="contracts.extract"
                labelKey="contracts.ai.extract"
                entityType="contract"
                [entityId]="contract().id"
                [input]="{ attachment_id: fileId() }"
                [disabled]="!fileId()"
                (result)="onExtracted($any($event))"
              />
            }
            @if (dpaRelevant()) {
              <app-ai-assist-button
                assist="contracts.dpa_check"
                labelKey="contracts.ai.dpaCheck"
                entityType="contract"
                [entityId]="contract().id"
                [input]="{ attachment_id: fileId() }"
                [disabled]="!fileId()"
                (result)="onDpaChecked($any($event))"
              />
            }
          </div>
        </div>
      }

      @if (extraction(); as x) {
        <div class="mt-4 border-t border-border pt-4">
          <h3 class="mb-2 text-[14px] font-semibold text-fg">
            {{ 'contracts.ai.extractResult' | transloco }}
          </h3>
          @if (changeCount() > 0 && contract().can_edit) {
            <div
              class="mb-3 flex flex-wrap items-center gap-2 rounded-tile bg-accent-soft px-3 py-2"
            >
              <span class="flex-1 text-[13px] text-fg">
                {{ 'contracts.ai.changes' | transloco: { count: changeCount() } }}
              </span>
              <app-button size="sm" [loading]="busy()" [disabled]="busy()" (click)="apply()">
                {{ 'contracts.ai.apply' | transloco }}
              </app-button>
            </div>
            @if (contract().status === 'in_review' || contract().status === 'approved') {
              <p class="mb-3 text-[12.5px] text-warn">
                {{ 'contracts.ai.backToDraft' | transloco }}
              </p>
            }
          }
          <app-contract-extraction-summary
            [result]="x"
            [canAddObligations]="contract().can_edit"
            (addObligation)="addObligation($event)"
          />
        </div>
      }

      @if (dpaResult(); as r) {
        <div class="mt-4 border-t border-border pt-4" data-testid="dpa-result">
          <h3 class="mb-2 text-[14px] font-semibold text-fg">
            {{ 'contracts.ai.dpaResult' | transloco }}
          </h3>
          @if (r.summary) {
            <p class="mb-2 text-[13px] text-fg">{{ r.summary }}</p>
          }
          @if (r.applies === false) {
            <p class="text-[13px] text-fg-muted">
              {{ 'contracts.ai.dpaNotApplicable' | transloco }}
            </p>
          }
          <ul class="flex flex-col gap-1.5">
            @for (c of r.clauses ?? []; track c.key) {
              <li class="rounded-tile bg-surface-2 px-3 py-2 text-[13px]">
                <span class="flex items-center gap-2">
                  <app-badge [tone]="c.present ? 'pass' : 'fail'">
                    {{ (c.present ? 'contracts.ai.present' : 'contracts.ai.missing') | transloco }}
                  </app-badge>
                  <span class="text-fg">{{ clauseKey(c.key) | transloco }}</span>
                </span>
                @if (c.evidence) {
                  <span class="mt-0.5 block text-[12px] text-fg-muted italic"
                    >“{{ c.evidence }}”</span
                  >
                }
              </li>
            }
          </ul>
        </div>
      }
    </app-card>
  `,
})
export class ContractAiPanel {
  private readonly api = inject(ContractsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly contract = input.required<Contract>();
  readonly attachments = input<readonly Attachment[]>([]);
  /** The contract changed (fields or parties). */
  readonly changed = output<void>();
  /** An obligation was added. */
  readonly obligationAdded = output<void>();

  protected readonly files = computed(() => this.attachments().filter(isReadableFile));
  protected readonly fileId = linkedSignal(() => this.files()[0]?.id ?? '');
  protected readonly canWrite = computed(() =>
    (this.selectedOrg.currentOrg()?.permissions ?? []).includes(PERM_WRITE),
  );
  protected readonly dpaRelevant = computed(
    () => this.contract().processes_personal_data || this.contract().contract_type === 'dpa',
  );

  protected readonly extraction = signal<ContractExtraction | null>(null);
  protected readonly dpaResult = signal<DpaCheckResult | null>(null);
  protected readonly busy = signal(false);

  private readonly changes = computed(() => {
    const x = this.extraction();
    return x ? extractionChanges(this.contract(), x) : null;
  });
  protected readonly changeCount = computed(() => {
    const c = this.changes();
    return c ? Object.keys(c.update).length + c.parties.length : 0;
  });

  protected clauseKey(key: string): string {
    return dpaClauseKey(key);
  }

  protected onExtracted(result: ContractExtraction | null): void {
    if (result && typeof result === 'object') {
      this.extraction.set(result);
    }
  }

  protected onDpaChecked(result: DpaCheckResult | null): void {
    if (result && typeof result === 'object') {
      this.dpaResult.set(result);
    }
  }

  protected apply(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const changes = this.changes();
    if (!orgId || !changes || this.busy()) {
      return;
    }
    const id = this.contract().id;
    const steps = [
      ...(Object.keys(changes.update).length
        ? [
            this.api.update(orgId, id, {
              ...changes.update,
              change_reason: this.language.translate('contracts.ai.changeReason'),
            }),
          ]
        : []),
      ...changes.parties.map((p) => this.api.addParty(orgId, id, p)),
    ];
    this.busy.set(true);
    concat(...steps)
      .pipe(toArray(), last())
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.extraction.set(null);
          this.notifications.success('contracts.notices.extractionApplied');
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(contractErrorKey(error));
          this.changed.emit();
        },
      });
  }

  protected addObligation(o: ExtractedObligation): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.api
      .addObligation(orgId, this.contract().id, obligationFromExtraction(o))
      .pipe(
        catchError((error: unknown) => {
          this.notifications.error(contractErrorKey(error));
          return of(null);
        }),
      )
      .subscribe((task) => {
        if (task) {
          this.notifications.success('contracts.notices.obligationAdded');
          this.obligationAdded.emit();
        }
      });
  }
}
