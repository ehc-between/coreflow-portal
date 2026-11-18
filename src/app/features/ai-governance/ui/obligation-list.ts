import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ClauseChips } from '../../../shared/guidance/clause-chips';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import {
  EntityRef,
  OBLIGATION_STATUSES,
  Obligation,
  ObligationStatus,
} from '../data/ai-governance.models';
import { localRef, obligationStatusKey, obligationValue } from '../data/ai-governance-display';
import { AiRecordPicker } from './record-picker';

/** Records that can show an obligation is met (the evidence picker searches these). */
export const EVIDENCE_TYPES: readonly string[] = [
  'document',
  'course',
  'training_record',
  'risk',
  'contract',
  'supplier_evaluation',
  'audit_plan',
  'dpia',
];

interface Editor {
  readonly key: string;
  /** '' = automatic (from the task). */
  readonly status: ObligationStatus | '';
  readonly reason: string;
  readonly evidence: EntityRef | null;
}

/** The task label of an obligation row ("Oppgave: Pågår"). */
function taskStatusKey(status: string | null | undefined): string {
  return `aiGovernance.taskStatus.${status || 'open'}`;
}

/**
 * The obligations of a classification as a to-do list: each row has its
 * article (clause link, plus the article detail only when it is more specific),
 * a status (not started / in progress / met / not relevant, with a reason), the
 * evidence that shows it is met and its task ("Opprett oppgave" when there is
 * none). Read-only rows (a preview or the provider's duties) leave out status
 * and actions. `changed` emits the refreshed list after an edit.
 */
@Component({
  selector: 'app-ai-obligation-list',
  imports: [
    RouterLink,
    TranslocoPipe,
    ClauseChips,
    EntityChip,
    Button,
    Icon,
    StatusBadge,
    AiRecordPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (obligations().length === 0) {
      <p class="text-ui text-fg-muted">{{ emptyKey() | transloco }}</p>
    } @else {
      <ul class="divide-y divide-border" data-testid="obligation-list">
        @for (o of obligations(); track o.key) {
          <li class="py-3" [attr.data-testid]="'obligation-' + o.key">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-body font-semibold text-fg">{{ o.title }}</p>
                <p class="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-meta text-fg-subtle">
                  <app-clause-chips [clauses]="[o.clause_ref || o.ref]" />
                  @if (o.article_detail) {
                    <span>· {{ articleLabel(o.article_detail) }}</span>
                  }
                </p>
                @if (o.status === 'not_relevant' && o.reason) {
                  <p class="mt-1 text-meta text-fg-muted">
                    {{ 'aiGovernance.obligations.reason' | transloco: { reason: o.reason } }}
                  </p>
                }
                @if (o.evidence; as ev) {
                  <p class="mt-1.5 flex flex-wrap items-center gap-1.5 text-meta text-fg-muted">
                    {{ 'aiGovernance.obligations.evidence' | transloco }}
                    <app-entity-chip [ref]="ev" />
                  </p>
                }
              </div>
              @if (tracked()) {
                <div class="flex flex-wrap items-center gap-2 sm:justify-end">
                  <app-status-badge
                    meaning="compliance"
                    [value]="statusValue(o.status)"
                    [labelKey]="statusKey(o.status || 'not_started')"
                  />
                  @if (o.task_id) {
                    <a
                      [routerLink]="['/tasks', o.task_id]"
                      class="inline-flex min-h-6 items-center gap-1 text-meta font-semibold text-accent hover:underline"
                    >
                      <app-icon name="check" [size]="13" />
                      {{
                        'aiGovernance.obligations.task'
                          | transloco: { status: (taskKey(o.task_status) | transloco) }
                      }}
                    </a>
                  } @else if (
                    canWrite() && systemId() && o.status !== 'not_relevant' && o.status !== 'met'
                  ) {
                    <app-button
                      size="sm"
                      variant="secondary"
                      [loading]="busy() === 'task:' + o.key"
                      [disabled]="!!busy()"
                      (click)="createTask(o)"
                      [attr.data-testid]="'obligation-task-' + o.key"
                    >
                      <app-icon name="plus" [size]="13" />
                      {{ 'aiGovernance.obligations.createTask' | transloco }}
                    </app-button>
                  } @else if (o.status !== 'not_relevant' && o.status !== 'met') {
                    <span class="text-meta text-fg-subtle">{{
                      'aiGovernance.obligations.noTask' | transloco
                    }}</span>
                  }
                  @if (canWrite() && systemId() && editing()?.key !== o.key) {
                    <app-button
                      size="sm"
                      variant="ghost"
                      [disabled]="!!busy()"
                      (click)="edit(o)"
                      [attr.aria-label]="
                        'aiGovernance.obligations.editFor' | transloco: { title: o.title }
                      "
                      [attr.data-testid]="'obligation-edit-' + o.key"
                    >
                      {{ 'aiGovernance.obligations.edit' | transloco }}
                    </app-button>
                  }
                </div>
              }
            </div>

            @if (editing(); as e) {
              @if (e.key === o.key) {
                <form
                  class="mt-3 flex flex-col gap-3 rounded-tile border border-border bg-surface-2 p-3"
                  (submit)="$event.preventDefault(); save()"
                  (keydown.escape)="editing.set(null)"
                  data-testid="obligation-editor"
                >
                  <fieldset class="flex flex-col gap-1.5">
                    <legend class="mb-1 text-ui font-semibold text-fg-muted">
                      {{ 'aiGovernance.obligations.statusLabel' | transloco }}
                    </legend>
                    <div class="flex flex-wrap gap-x-4 gap-y-1.5">
                      <label class="inline-flex min-h-6 items-center gap-2 text-ui text-fg">
                        <input
                          type="radio"
                          [name]="'ob-status-' + o.key"
                          [checked]="e.status === ''"
                          (change)="patch({ status: '' })"
                        />
                        {{ 'aiGovernance.obligations.statusAuto' | transloco }}
                      </label>
                      @for (s of statuses; track s) {
                        <label class="inline-flex min-h-6 items-center gap-2 text-ui text-fg">
                          <input
                            type="radio"
                            [name]="'ob-status-' + o.key"
                            [checked]="e.status === s"
                            (change)="patch({ status: s })"
                          />
                          {{ statusKey(s) | transloco }}
                        </label>
                      }
                    </div>
                  </fieldset>
                  @if (e.status === 'not_relevant') {
                    <label class="flex flex-col gap-1 text-ui font-semibold text-fg-muted">
                      {{ 'aiGovernance.obligations.reasonLabel' | transloco }}
                      <textarea
                        rows="2"
                        maxlength="2000"
                        required
                        class="rounded-tile border border-border bg-bg px-3 py-2 text-ui font-normal text-fg"
                        [value]="e.reason"
                        (input)="patch({ reason: $any($event.target).value })"
                      ></textarea>
                      @if (reasonMissing()) {
                        <span class="text-meta font-semibold text-fail-ink" role="alert">{{
                          'aiGovernance.errors.reason_required' | transloco
                        }}</span>
                      }
                    </label>
                  }
                  <div class="flex flex-col gap-1">
                    <span
                      class="text-ui font-semibold text-fg-muted"
                      [id]="'ob-evidence-' + o.key"
                      >{{ 'aiGovernance.obligations.evidenceLabel' | transloco }}</span
                    >
                    <app-ai-record-picker
                      [types]="evidenceTypes"
                      [value]="e.evidence"
                      [describedBy]="'ob-evidence-' + o.key"
                      placeholderKey="aiGovernance.obligations.evidencePlaceholder"
                      (picked)="patch({ evidence: $event })"
                      (cleared)="patch({ evidence: null })"
                    />
                    <span class="text-meta text-fg-subtle">{{
                      'aiGovernance.obligations.evidenceHint' | transloco
                    }}</span>
                  </div>
                  <div class="flex justify-end gap-2">
                    <app-button size="sm" variant="ghost" (click)="editing.set(null)">{{
                      'aiGovernance.common.cancel' | transloco
                    }}</app-button>
                    <app-button
                      size="sm"
                      type="submit"
                      [loading]="busy() === 'save'"
                      data-testid="obligation-save"
                    >
                      {{ 'aiGovernance.common.save' | transloco }}
                    </app-button>
                  </div>
                </form>
              }
            }
          </li>
        }
      </ul>
    }
  `,
})
export class AiObligationList {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  /** The article detail ("Art. 26(4)-(6)") in the UI language. */
  protected articleLabel(ref: string | null | undefined): string {
    return localRef(ref, this.language.active());
  }

  readonly obligations = input<readonly Obligation[]>([]);
  /** Show status and task per row (off for previews and the provider's duties). */
  readonly tracked = input(true);
  /** Set to make the rows editable (status, evidence, create task). */
  readonly systemId = input<string | null>(null);
  readonly canWrite = input(false);
  readonly emptyKey = input('aiGovernance.obligations.none');
  readonly changed = output<readonly Obligation[]>();

  protected readonly statuses = OBLIGATION_STATUSES;
  protected readonly evidenceTypes = EVIDENCE_TYPES;
  protected readonly statusKey = obligationStatusKey;
  protected readonly statusValue = obligationValue;
  protected readonly taskKey = taskStatusKey;
  protected readonly editing = signal<Editor | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly reasonMissing = signal(false);

  protected edit(o: Obligation): void {
    this.reasonMissing.set(false);
    this.editing.set({
      key: o.key,
      status: o.status_source === 'manual' && o.status ? o.status : '',
      reason: o.reason ?? '',
      evidence: o.evidence ?? null,
    });
  }

  protected patch(change: Partial<Editor>): void {
    this.editing.update((e) => (e ? { ...e, ...change } : e));
    if (change.reason) {
      this.reasonMissing.set(false);
    }
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const systemId = this.systemId();
    const e = this.editing();
    if (!orgId || !systemId || !e || this.busy()) {
      return;
    }
    if (e.status === 'not_relevant' && !e.reason.trim()) {
      this.reasonMissing.set(true);
      return;
    }
    this.busy.set('save');
    this.api
      .updateObligation(orgId, systemId, e.key, {
        status: e.status || null,
        reason: e.status === 'not_relevant' ? e.reason.trim() : null,
        evidence: e.evidence
          ? { entity_type: e.evidence.entity_type, entity_id: e.evidence.entity_id }
          : null,
      })
      .subscribe({
        next: (list) => {
          this.busy.set(null);
          this.editing.set(null);
          this.notifications.success('aiGovernance.obligations.saved');
          this.changed.emit(list);
        },
        error: (err: unknown) => {
          this.busy.set(null);
          this.notifications.error(aiGovernanceErrorKey(err));
        },
      });
  }

  protected createTask(o: Obligation): void {
    const orgId = this.selectedOrg.currentOrgId();
    const systemId = this.systemId();
    if (!orgId || !systemId || this.busy()) {
      return;
    }
    this.busy.set('task:' + o.key);
    this.api.createObligationTask(orgId, systemId, o.key).subscribe({
      next: (list) => {
        this.busy.set(null);
        this.notifications.success('aiGovernance.obligations.taskCreated');
        this.changed.emit(list);
      },
      error: (err: unknown) => {
        this.busy.set(null);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}
