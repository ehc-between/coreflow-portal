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
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, concat, last, of, toArray } from 'rxjs';
import { Attachment } from '../../core/attachments/attachment.models';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { AiAssistButton } from '../../shared/ask/ai-assist-button';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Icon } from '../../shared/ui/icon/icon';
import { aiClauseFindings } from './contract-dpa-checklist';
import { ContractsApi } from './data/contracts-api';
import {
  Contract,
  ContractExtraction,
  ContractUpdate,
  DpaCheckResult,
  DpaClauseIn,
  ExtractedObligation,
  ExtractedRisk,
  PERM_WRITE,
  PartyIn,
} from './data/contract.models';
import { isClosedContract } from './data/contract-display';
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
  const extracted = applyExtraction(current, x);
  // A suggestion never switches automatic renewal off (and so never drops the term).
  const merged = { ...extracted, auto_renew: current.auto_renew || extracted.auto_renew };
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
      ...(p.role ? { role: p.role } : {}),
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
      <h2 class="mb-1 flex items-center gap-2 font-display text-card font-bold text-fg">
        <app-icon name="spark" [size]="15" class="text-accent" />
        {{ 'contracts.ai.title' | transloco }}
      </h2>
      <p class="mb-3 text-ui text-fg-muted">{{ 'contracts.ai.intro' | transloco }}</p>

      @if (files().length === 0) {
        <p class="text-ui text-fg-muted" data-testid="ai-no-files">
          {{ 'contracts.ai.noFiles' | transloco }}
        </p>
      } @else {
        <div class="flex flex-col gap-3">
          <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
            {{ 'contracts.ai.file' | transloco }}
            <select
              class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
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
          <h3 class="mb-2 text-body font-semibold text-fg">
            {{ 'contracts.ai.extractResult' | transloco }}
          </h3>
          @if (changeCount() > 0 && contract().can_edit) {
            <div
              class="mb-3 flex flex-wrap items-center gap-2 rounded-tile bg-accent-soft px-3 py-2"
            >
              <span class="flex-1 text-ui text-fg">
                {{ 'contracts.ai.changes' | transloco: { count: changeCount() } }}
              </span>
              <app-button size="sm" [loading]="busy()" [disabled]="busy()" (click)="apply()">
                {{ 'contracts.ai.apply' | transloco }}
              </app-button>
            </div>
            @if (contract().status === 'in_review' || contract().status === 'approved') {
              <p class="mb-3 text-meta text-warn">
                {{ 'contracts.ai.backToDraft' | transloco }}
              </p>
            }
          }
          <app-contract-extraction-summary
            [result]="x"
            [canAddObligations]="contract().can_edit"
            [canCreate]="!closed()"
            (addObligation)="addObligation($event)"
            (createRisk)="toRisk($event)"
            (createTask)="toTask($event)"
          />
          @if (canRecord() && extractionFindings().length) {
            <app-button
              class="mt-2"
              size="sm"
              variant="secondary"
              [loading]="busy()"
              [disabled]="busy()"
              (click)="recordFindings(extractionFindings())"
              data-testid="record-missing-clauses"
            >
              {{ 'contracts.ai.recordClauses' | transloco }}
            </app-button>
          }
        </div>
      }

      @if (dpaResult(); as r) {
        <div class="mt-4 border-t border-border pt-4" data-testid="dpa-result">
          <h3 class="mb-2 text-body font-semibold text-fg">
            {{ 'contracts.ai.dpaResult' | transloco }}
          </h3>
          @if (r.summary) {
            <p class="mb-2 text-ui text-fg">{{ r.summary }}</p>
          }
          @if (r.applies === false) {
            <p class="text-ui text-fg-muted">
              {{ 'contracts.ai.dpaNotApplicable' | transloco }}
            </p>
          }
          <ul class="flex flex-col gap-1.5">
            @for (c of r.clauses ?? []; track c.key) {
              <li class="rounded-tile bg-surface-2 px-3 py-2 text-ui">
                <span class="flex items-center gap-2">
                  <app-badge [tone]="c.present ? 'pass' : 'fail'">
                    {{ (c.present ? 'contracts.ai.present' : 'contracts.ai.missing') | transloco }}
                  </app-badge>
                  <span class="text-fg">{{ clauseKey(c.key) | transloco }}</span>
                </span>
                @if (c.evidence) {
                  <span class="mt-0.5 block text-meta text-fg-muted italic"
                    >“{{ c.evidence }}”</span
                  >
                }
              </li>
            }
          </ul>
          @if (canRecord() && dpaFindings().length) {
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <app-button
                size="sm"
                variant="secondary"
                [loading]="busy()"
                [disabled]="busy()"
                (click)="recordFindings(dpaFindings())"
                data-testid="record-dpa-check"
              >
                {{ 'contracts.ai.recordClauses' | transloco }}
              </app-button>
              <span class="text-meta text-fg-muted">
                {{ 'contracts.ai.recordHint' | transloco }}
              </span>
            </div>
          }
        </div>
      }
    </app-card>
  `,
})
export class ContractAiPanel {
  private readonly flows = inject(CreateFlowService);
  private readonly router = inject(Router);

  /** "Add to the risk register": a risk linked to this contract, titled after the finding. */
  protected toRisk(r: ExtractedRisk): void {
    void this.flows.start('contract.to_risk', 'contract', this.contract().id, {
      title: r.title.slice(0, 255),
      ...(r.explanation ? { description: r.explanation } : {}),
    });
  }

  /** "Create task" for a missing Art. 28(3) clause: agree it with the counterparty. */
  protected toTask(clause: string): void {
    const c = this.contract();
    const title = this.language.translate('contracts.extract.clauseTaskTitle', {
      clause: this.language.translate(dpaClauseKey(clause)),
      code: c.code,
    });
    void this.router.navigate(['/tasks/new'], {
      queryParams: { entity_type: 'contract', entity_id: c.id, title: title.slice(0, 255) },
    });
  }

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

  /** Checklist findings can be stored on this contract (open, editable, DPA-relevant). */
  protected readonly canRecord = computed(() => {
    const c = this.contract();
    return (
      c.can_edit && !isClosedContract(c.status) && (c.contract_type === 'dpa' || c.dpa.required)
    );
  });

  protected readonly closed = computed(() => isClosedContract(this.contract().status));
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

  /** The extraction's missing clauses as unconfirmed checklist entries. */
  protected readonly extractionFindings = computed(() =>
    aiClauseFindings(
      this.contract().dpa.checklist ?? [],
      (this.extraction()?.missing_dpa_clauses ?? []).map((key) => ({ key, present: false })),
    ),
  );
  /** The clause check's findings as unconfirmed checklist entries. */
  protected readonly dpaFindings = computed(() => {
    const r = this.dpaResult();
    if (!r || r.applies === false) {
      return [];
    }
    return aiClauseFindings(this.contract().dpa.checklist ?? [], [
      ...(r.clauses ?? []).map((c) => ({ key: c.key, present: c.present, note: c.evidence })),
      ...(r.missing ?? []).map((key) => ({ key, present: false })),
    ]);
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

  /** Store assistant findings in the checklist (as suggestions a person confirms). */
  protected recordFindings(clauses: readonly DpaClauseIn[]): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !clauses.length || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.updateDpaClauses(orgId, this.contract().id, clauses).subscribe({
      next: () => {
        this.busy.set(false);
        this.notifications.success('contracts.notices.dpaFindingsRecorded');
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(contractErrorKey(error));
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
