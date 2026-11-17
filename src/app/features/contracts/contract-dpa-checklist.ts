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
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Badge } from '../../shared/ui/badge/badge';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ContractsApi } from './data/contracts-api';
import {
  Contract,
  DPA_CLAUSE_KEYS,
  DPA_CLAUSE_STATES,
  DpaChecklistItem,
  DpaClauseIn,
  DpaClauseKey,
  DpaClauseState,
} from './data/contract.models';
import { dpaComplianceValue, isClosedContract } from './data/contract-display';
import { contractErrorKey } from './data/contract-errors';
import { dpaClauseKey } from './extraction-summary';

/** A row being edited: '' = not assessed yet. */
export interface ClauseDraft {
  readonly state: DpaClauseState | '';
  readonly note: string;
}

export type ClauseDrafts = Readonly<Record<string, ClauseDraft>>;

export function draftsFrom(items: readonly DpaChecklistItem[]): ClauseDrafts {
  const out: Record<string, ClauseDraft> = {};
  for (const item of items) {
    out[item.key] = {
      state: item.state === 'unknown' ? '' : item.state,
      note: item.note ?? '',
    };
  }
  return out;
}

/**
 * The checklist entries to save: every row a person changed, plus every assistant
 * suggestion they confirmed (sent again with `source: "user"`). Rows still unassessed
 * are never sent.
 */
export function clauseChanges(
  items: readonly DpaChecklistItem[],
  drafts: ClauseDrafts,
  confirmed: ReadonlySet<string>,
): readonly DpaClauseIn[] {
  const out: DpaClauseIn[] = [];
  for (const item of items) {
    const d = drafts[item.key];
    if (!d || !d.state || !(DPA_CLAUSE_KEYS as readonly string[]).includes(item.key)) {
      continue;
    }
    const changed =
      d.state !== (item.state === 'unknown' ? '' : item.state) ||
      d.note.trim() !== (item.note ?? '').trim();
    if (changed || (item.source === 'ai' && confirmed.has(item.key))) {
      out.push({
        key: item.key as DpaClauseKey,
        state: d.state,
        note: d.note.trim() || null,
        source: 'user',
      });
    }
  }
  return out;
}

/**
 * Assistant findings as checklist entries (`source: "ai"`, unconfirmed): known clause
 * keys only, and never over a clause a person already recorded.
 */
export function aiClauseFindings(
  checklist: readonly DpaChecklistItem[],
  findings: readonly {
    readonly key: string;
    readonly present: boolean;
    readonly note?: string | null;
  }[],
): readonly DpaClauseIn[] {
  const confirmedByPerson = new Set(checklist.filter((i) => i.source === 'user').map((i) => i.key));
  const seen = new Set<string>();
  const out: DpaClauseIn[] = [];
  for (const f of findings) {
    if (
      !(DPA_CLAUSE_KEYS as readonly string[]).includes(f.key) ||
      confirmedByPerson.has(f.key) ||
      seen.has(f.key)
    ) {
      continue;
    }
    seen.add(f.key);
    out.push({
      key: f.key as DpaClauseKey,
      state: f.present ? 'present' : 'missing',
      note: f.note?.trim() ? f.note.trim().slice(0, 2000) : null,
      source: 'ai',
    });
  }
  return out;
}

/** Keys of waived rows without a reason (the backend rejects them). */
export function waiversWithoutReason(drafts: ClauseDrafts): readonly string[] {
  return Object.entries(drafts)
    .filter(([, d]) => d.state === 'waived' && !d.note.trim())
    .map(([key]) => key);
}

/** A clause state as a `compliance` tone value (present → compliant, missing → gap). */
export function clauseStateValue(state: string): string {
  switch (state) {
    case 'present':
      return 'compliant';
    case 'missing':
      return 'gap';
    case 'waived':
      return 'not_applicable';
    default:
      return 'not_assessed';
  }
}

/**
 * The contract's GDPR Art. 28(3) clause checklist: each clause present, missing or
 * waived (with a reason). Assistant findings are shown as suggestions until a person
 * confirms them; only confirmed clauses count towards "covered". Missing clauses can
 * be turned into a negotiation task (a contract obligation).
 */
@Component({
  selector: 'app-contract-dpa-checklist',
  imports: [RouterLink, TranslocoPipe, Badge, Button, Card, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card>
      <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-display text-card font-bold text-fg">
          {{ 'contracts.dpa.checklist.title' | transloco }}
        </h2>
        <app-status-badge
          meaning="compliance"
          [value]="statusValue()"
          [labelKey]="'contracts.dpa.status.' + contract().dpa.status"
          data-testid="dpa-checklist-status"
        />
      </div>
      <p class="mb-3 text-ui text-fg-muted">
        {{ 'contracts.dpa.checklist.intro' | transloco }}
      </p>

      @if (evaluatedElsewhere(); as otherId) {
        <p class="mb-3 text-ui text-fg-muted" data-testid="dpa-evaluated-elsewhere">
          {{ 'contracts.dpa.checklist.evaluatedElsewhere' | transloco }}
          <a
            [routerLink]="['/contracts', otherId]"
            class="font-semibold text-accent hover:underline"
          >
            {{ 'contracts.dpa.checklist.openAgreement' | transloco }}
          </a>
        </p>
      }

      @if (suggestions().length && editable()) {
        <div
          class="mb-3 flex flex-wrap items-center gap-2 rounded-tile bg-accent-soft px-3 py-2"
          data-testid="dpa-suggestions"
        >
          <span class="flex-1 text-ui text-fg">
            {{ 'contracts.dpa.checklist.suggestions' | transloco: { count: suggestions().length } }}
          </span>
          <app-button size="sm" variant="secondary" (click)="confirmAll()">
            {{ 'contracts.dpa.checklist.confirmAll' | transloco }}
          </app-button>
        </div>
      }

      <ul class="flex flex-col gap-2" data-testid="dpa-checklist">
        @for (item of items(); track item.key) {
          <li class="rounded-tile border border-border px-3 py-2" [attr.data-clause]="item.key">
            <div class="flex flex-wrap items-center gap-2">
              <span class="flex-1 text-ui font-semibold text-fg">
                {{ clauseKey(item.key) | transloco }}
              </span>
              @if (item.source === 'ai' && !confirmed().has(item.key)) {
                <app-badge tone="accent">{{
                  'contracts.dpa.checklist.suggested' | transloco
                }}</app-badge>
              }
              <app-status-badge
                meaning="compliance"
                [value]="stateValue(item.state)"
                [labelKey]="'contracts.dpa.clauseStates.' + item.state"
              />
            </div>
            @if (editable()) {
              <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr]">
                <label class="sr-only" [for]="'dpa-state-' + item.key">
                  {{ 'contracts.dpa.checklist.state' | transloco }}
                </label>
                <select
                  [id]="'dpa-state-' + item.key"
                  class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
                  (change)="setState(item.key, $any($event.target).value)"
                  [attr.data-testid]="'dpa-state-' + item.key"
                >
                  <option value="" [selected]="!draft(item.key).state">
                    {{ 'contracts.dpa.clauseStates.unknown' | transloco }}
                  </option>
                  @for (s of states; track s) {
                    <option [value]="s" [selected]="draft(item.key).state === s">
                      {{ 'contracts.dpa.clauseStates.' + s | transloco }}
                    </option>
                  }
                </select>
                <label class="sr-only" [for]="'dpa-note-' + item.key">
                  {{ 'contracts.dpa.checklist.note' | transloco }}
                </label>
                <input
                  [id]="'dpa-note-' + item.key"
                  type="text"
                  maxlength="2000"
                  class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
                  [placeholder]="
                    (draft(item.key).state === 'waived'
                      ? 'contracts.dpa.checklist.waiverReason'
                      : 'contracts.dpa.checklist.note'
                    ) | transloco
                  "
                  [attr.aria-invalid]="missingReason().includes(item.key) ? 'true' : null"
                  [value]="draft(item.key).note"
                  (input)="setNote(item.key, $any($event.target).value)"
                  [attr.data-testid]="'dpa-note-' + item.key"
                />
              </div>
              @if (attempted() && missingReason().includes(item.key)) {
                <p class="mt-1 text-meta text-fail" role="alert">
                  {{ 'contracts.errors.waiver_reason_required' | transloco }}
                </p>
              }
              @if (item.source === 'ai' && !confirmed().has(item.key) && item.state !== 'unknown') {
                <button
                  type="button"
                  class="mt-1 text-meta font-semibold text-accent hover:underline"
                  (click)="confirm(item.key)"
                  [attr.data-testid]="'dpa-confirm-' + item.key"
                >
                  {{ 'contracts.dpa.checklist.confirm' | transloco }}
                </button>
              }
            } @else if (item.note) {
              <p class="mt-1 text-meta text-fg-muted">{{ item.note }}</p>
            }
          </li>
        }
      </ul>

      @if (editable()) {
        <div class="mt-3 flex flex-wrap items-center justify-end gap-2">
          @if (missingClauses().length) {
            <app-button
              size="sm"
              variant="secondary"
              [disabled]="busy()"
              (click)="createNegotiationTask()"
              data-testid="dpa-negotiation-task"
            >
              {{ 'contracts.dpa.checklist.negotiationTask' | transloco }}
            </app-button>
          }
          <app-button
            size="sm"
            [loading]="busy()"
            [disabled]="busy() || !pending().length"
            (click)="save()"
            data-testid="dpa-save"
          >
            {{ 'contracts.dpa.checklist.save' | transloco }}
          </app-button>
        </div>
      }
    </app-card>
  `,
})
export class ContractDpaChecklist {
  private readonly api = inject(ContractsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly contract = input.required<Contract>();
  /** The checklist was saved: the updated contract. */
  readonly changed = output<Contract>();
  /** A negotiation task (obligation) was added. */
  readonly obligationAdded = output<void>();

  protected readonly states = DPA_CLAUSE_STATES;
  protected readonly stateValue = clauseStateValue;
  protected readonly busy = signal(false);
  protected readonly attempted = signal(false);

  protected readonly items = computed(() => this.contract().dpa.checklist ?? []);
  protected readonly drafts = linkedSignal<ClauseDrafts>(() => draftsFrom(this.items()));
  protected readonly confirmed = linkedSignal<ReadonlySet<string>>(() => {
    this.items();
    return new Set<string>();
  });

  protected readonly editable = computed(
    () => this.contract().can_edit && !isClosedContract(this.contract().status),
  );
  protected readonly statusValue = computed(() => dpaComplianceValue(this.contract().dpa.status));
  protected readonly evaluatedElsewhere = computed(() => {
    const id = this.contract().dpa.evaluated_id;
    return id && id !== this.contract().id ? id : null;
  });
  protected readonly suggestions = computed(() =>
    this.items().filter(
      (i) => i.source === 'ai' && i.state !== 'unknown' && !this.confirmed().has(i.key),
    ),
  );
  /** Missing clauses: this contract's own rows marked missing (as being edited). */
  protected readonly missingClauses = computed(() =>
    this.items()
      .filter((i) => this.drafts()[i.key]?.state === 'missing')
      .map((i) => i.key),
  );
  protected readonly missingReason = computed(() => waiversWithoutReason(this.drafts()));
  protected readonly pending = computed(() =>
    clauseChanges(this.items(), this.drafts(), this.confirmed()),
  );

  protected clauseKey(key: string): string {
    return dpaClauseKey(key);
  }

  protected draft(key: string): ClauseDraft {
    return this.drafts()[key] ?? { state: '', note: '' };
  }

  protected setState(key: string, state: string): void {
    this.drafts.update((d) => ({
      ...d,
      [key]: { ...this.draft(key), state: state as DpaClauseState | '' },
    }));
  }

  protected setNote(key: string, note: string): void {
    this.drafts.update((d) => ({ ...d, [key]: { ...this.draft(key), note } }));
  }

  protected confirm(key: string): void {
    this.confirmed.update((s) => new Set([...s, key]));
  }

  protected confirmAll(): void {
    this.confirmed.update((s) => new Set([...s, ...this.suggestions().map((i) => i.key)]));
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const clauses = this.pending();
    if (!orgId || this.busy() || !clauses.length) {
      return;
    }
    this.attempted.set(true);
    if (this.missingReason().length) {
      return;
    }
    this.busy.set(true);
    this.api.updateDpaClauses(orgId, this.contract().id, clauses).subscribe({
      next: (contract) => {
        this.busy.set(false);
        this.attempted.set(false);
        this.notifications.success('contracts.notices.dpaChecklistSaved');
        this.changed.emit(contract);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(contractErrorKey(error));
      },
    });
  }

  protected createNegotiationTask(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const keys = this.missingClauses();
    if (!orgId || this.busy() || !keys.length) {
      return;
    }
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(key, params);
    const description = [
      t('contracts.dpa.checklist.negotiationIntro'),
      ...keys.map((k) => `- ${t(dpaClauseKey(k))}`),
    ].join('\n');
    this.busy.set(true);
    this.api
      .addObligation(orgId, this.contract().id, {
        title: t('contracts.dpa.checklist.negotiationTitle', { code: this.contract().code }),
        description,
        priority: 'high',
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.notifications.success('contracts.notices.negotiationTaskAdded');
          this.obligationAdded.emit();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(contractErrorKey(error));
        },
      });
  }
}
