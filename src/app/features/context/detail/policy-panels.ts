import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { CreateFlowService } from '../../../core/kit/create-flow.service';
import { KitApi } from '../../../core/kit/kit-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { EntityChip } from '../../../shared/kit/entity-chip';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ContextApi } from '../data/context-api';
import { AcknowledgementItem, Acknowledgements, Policy } from '../data/context.models';
import { contextErrorKey } from '../context-kinds';
import { PickedRecord, RecordSearch } from '../ui/record-search';

/** The badge of one person's acknowledgement (confirmed, waiting or overdue). */
export function acknowledgementState(item: AcknowledgementItem): 'done' | 'overdue' | 'open' {
  if (item.acknowledged) {
    return 'done';
  }
  return item.overdue ? 'overdue' : 'open';
}

/**
 * The connected parts of a policy on its Details tab:
 * - the controlled document carrying it (link one inline, HS 5.2 / 7.5),
 * - the objectives set from it (HS 5.2 b -> 6.2, "Nytt mål fra denne policyen"),
 * - who has read and confirmed the current version (HS 5.2 / 7.3), with a list
 *   and "Send påminnelse".
 */
@Component({
  selector: 'app-context-policy-panels',
  imports: [
    TranslocoPipe,
    EntityChip,
    LocalDayPipe,
    Button,
    FormField,
    Icon,
    ProgressBar,
    StatusBadge,
    RecordSearch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    @let p = policy();
    <section
      class="rounded-card border border-border bg-surface p-4"
      aria-labelledby="pol-doc-title"
      data-testid="policy-document"
    >
      <h3 id="pol-doc-title" class="font-display text-card font-bold text-fg">
        {{ 'context.policy.documentTitle' | transloco }}
      </h3>
      @if (p.documents.length) {
        <ul class="mt-2 flex flex-col gap-1.5">
          @for (doc of p.documents; track doc.entity_id) {
            <li><app-entity-chip [ref]="doc" [statusText]="true" /></li>
          }
        </ul>
      } @else {
        <p class="mt-1 text-ui text-fg-muted">{{ 'context.policy.noDocuments' | transloco }}</p>
      }
      @if (canEdit()) {
        @if (linking()) {
          <div class="mt-3">
            <app-form-field
              [label]="'context.policy.document' | transloco"
              inputId="pol-doc-search"
            >
              <app-context-record-search
                inputId="pol-doc-search"
                [types]="['document']"
                placeholderKey="context.policy.documentPlaceholder"
                noMatchesKey="context.policy.noDocumentMatches"
                [excluded]="documentIds()"
                (picked)="linkDocument($event)"
              />
            </app-form-field>
            <p class="mt-1 text-meta text-fg-muted">
              {{ 'context.policy.documentHint' | transloco }}
            </p>
            <app-button class="mt-2" variant="ghost" size="sm" (click)="linking.set(false)">
              {{ 'context.common.cancel' | transloco }}
            </app-button>
          </div>
        } @else {
          <app-button
            class="mt-3"
            variant="secondary"
            size="sm"
            [loading]="busy() === 'document'"
            (click)="linking.set(true)"
            data-testid="link-policy-document"
          >
            <app-icon name="link" [size]="14" />
            {{
              (p.documents.length ? 'context.policy.linkAnother' : 'context.policy.linkDocument')
                | transloco
            }}
          </app-button>
        }
      }
    </section>

    <section
      class="rounded-card border border-border bg-surface p-4"
      aria-labelledby="pol-obj-title"
      data-testid="policy-objectives"
    >
      <h3 id="pol-obj-title" class="font-display text-card font-bold text-fg">
        {{ 'context.policy.objectivesTitle' | transloco }}
      </h3>
      <p class="mt-0.5 text-meta text-fg-muted">
        {{ 'context.policy.objectivesHint' | transloco }}
      </p>
      @if (objectives().length) {
        <ul class="mt-2 flex flex-col gap-1.5">
          @for (objective of objectives(); track objective.entity_id) {
            <li><app-entity-chip [ref]="objective" [statusText]="true" /></li>
          }
        </ul>
      } @else {
        <p class="mt-2 text-ui text-warn-ink">{{ 'context.policy.noObjectives' | transloco }}</p>
      }
      @if (objectiveFlow()) {
        <app-button
          class="mt-3"
          variant="secondary"
          size="sm"
          [disabled]="flows.starting() !== null"
          (click)="newObjective()"
          data-testid="policy-new-objective"
        >
          <app-icon name="target" [size]="14" />
          {{ 'context.policy.newObjective' | transloco }}
        </app-button>
      }
    </section>

    @if (p.status === 'approved') {
      <section
        class="rounded-card border border-border bg-surface p-4"
        aria-labelledby="pol-ack-title"
        data-testid="policy-acknowledgements"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <h3 id="pol-ack-title" class="font-display text-card font-bold text-fg">
            {{ 'context.policy.ack.title' | transloco }}
          </h3>
          @if (summary().total > 0) {
            <span class="text-ui font-semibold text-fg" data-testid="ack-count">
              {{
                'context.policy.ack.count'
                  | transloco: { acknowledged: summary().acknowledged, total: summary().total }
              }}
            </span>
          }
        </div>
        @if (summary().total > 0) {
          <div class="mt-2">
            <app-progress-bar
              [value]="summary().percent"
              [label]="
                'context.policy.ack.count'
                  | transloco: { acknowledged: summary().acknowledged, total: summary().total }
              "
            />
          </div>
          <p class="mt-1.5 text-meta text-fg-muted">
            {{
              'context.policy.ack.breakdown'
                | transloco: { pending: summary().pending, overdue: summary().overdue }
            }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <app-button
              variant="ghost"
              size="sm"
              [loading]="busy() === 'list'"
              (click)="toggleList()"
              [attr.aria-expanded]="showList()"
              aria-controls="pol-ack-list"
            >
              {{ (showList() ? 'context.policy.ack.hide' : 'context.policy.ack.show') | transloco }}
            </app-button>
            @if (canWrite() && summary().pending > 0) {
              <app-button
                variant="secondary"
                size="sm"
                [loading]="busy() === 'remind'"
                [disabled]="!!busy()"
                (click)="remind()"
                data-testid="ack-remind"
              >
                <app-icon name="bell" [size]="14" />
                {{ 'context.policy.ack.remind' | transloco: { count: summary().pending } }}
              </app-button>
            }
          </div>
          @if (showList()) {
            <ul id="pol-ack-list" class="mt-3 flex flex-col divide-y divide-border">
              @for (item of list()?.items ?? []; track item.task_id) {
                @let state = stateOf(item);
                <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-ui">
                  <span class="min-w-0 truncate text-fg">{{
                    item.user?.name || ('context.policy.ack.unknownPerson' | transloco)
                  }}</span>
                  <span class="flex items-center gap-2 text-meta text-fg-muted">
                    @if (item.acknowledged && item.completed_at) {
                      {{ item.completed_at | localDay }}
                    } @else if (item.due_at) {
                      {{ 'context.policy.ack.due' | transloco: { date: (item.due_at | localDay) } }}
                    }
                    <app-status-badge
                      [meaning]="'lifecycle'"
                      [value]="state === 'done' ? 'done' : state === 'overdue' ? 'overdue' : 'open'"
                      [labelKey]="'context.policy.ack.states.' + state"
                    />
                  </span>
                </li>
              } @empty {
                <li class="py-2 text-ui text-fg-muted">
                  {{ 'context.policy.ack.empty' | transloco }}
                </li>
              }
            </ul>
          }
        } @else {
          <p class="mt-1 text-ui text-warn-ink">{{ 'context.policy.ack.none' | transloco }}</p>
          @if (canWrite()) {
            <app-button
              class="mt-3"
              size="sm"
              variant="secondary"
              (click)="communicate.emit()"
              data-testid="ack-communicate"
            >
              <app-icon name="send" [size]="14" />
              {{ 'context.actions.communicate' | transloco }}
            </app-button>
          }
        }
      </section>
    }
  `,
})
export class PolicyPanels {
  private readonly api = inject(ContextApi);
  private readonly kit = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  protected readonly flows = inject(CreateFlowService);

  readonly policy = input.required<Policy>();
  /** The user may edit the policy (link a document). */
  readonly canEdit = input(false);
  /** `context:write`: reminders and communicating. */
  readonly canWrite = input(false);
  /** The policy after a document was linked. */
  readonly changed = output<Policy>();
  /** Open the "communicate" panel. */
  readonly communicate = output<void>();

  protected readonly linking = signal(false);
  protected readonly busy = signal<'document' | 'list' | 'remind' | null>(null);
  protected readonly showList = signal(false);
  protected readonly list = signal<Acknowledgements | null>(null);
  protected readonly objectiveFlow = signal(false);

  protected readonly documentIds = computed(() =>
    this.policy().documents.map((doc) => doc.entity_id),
  );
  protected readonly objectives = computed(() => this.policy().objectives ?? []);
  protected readonly summary = computed(
    () =>
      this.list() ??
      this.policy().acknowledgements ?? {
        total: 0,
        acknowledged: 0,
        pending: 0,
        overdue: 0,
        percent: 0,
      },
  );

  private flowSub: Subscription | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.policy().id;
      untracked(() => {
        this.list.set(null);
        this.showList.set(false);
        this.loadFlows(orgId, id);
      });
    });
    inject(DestroyRef).onDestroy(() => this.flowSub?.unsubscribe());
  }

  protected stateOf(item: AcknowledgementItem) {
    return acknowledgementState(item);
  }

  protected linkDocument(doc: PickedRecord): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set('document');
    this.api.update(orgId, 'policy', this.policy().id, { document_id: doc.id }).subscribe({
      next: (policy) => {
        this.busy.set(null);
        this.linking.set(false);
        this.notifications.success('context.policy.documentLinked', {
          name: doc.code || doc.title,
        });
        this.changed.emit(policy);
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.notifications.error(contextErrorKey(error));
      },
    });
  }

  protected newObjective(): void {
    void this.flows.start('policy.to_objective', 'policy', this.policy().id);
  }

  protected toggleList(): void {
    if (this.showList()) {
      this.showList.set(false);
      return;
    }
    if (this.list()) {
      this.showList.set(true);
      return;
    }
    this.fetchList(() => this.showList.set(true));
  }

  protected remind(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set('remind');
    this.api.remindAcknowledgements(orgId, this.policy().id).subscribe({
      next: (res) => {
        this.busy.set(null);
        this.notifications.success('context.policy.ack.reminded', { count: res.reminded });
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.notifications.error(contextErrorKey(error));
      },
    });
  }

  private fetchList(then: () => void): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.busy.set('list');
    this.api.acknowledgements(orgId, this.policy().id).subscribe({
      next: (list) => {
        this.busy.set(null);
        this.list.set(list);
        then();
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.notifications.error(contextErrorKey(error));
      },
    });
  }

  private loadFlows(orgId: string | null, id: string): void {
    this.flowSub?.unsubscribe();
    this.objectiveFlow.set(false);
    if (!orgId) {
      return;
    }
    this.flowSub = this.kit.createFlows(orgId, 'policy', { entityId: id }).subscribe({
      next: (list) =>
        this.objectiveFlow.set(
          (list?.items ?? []).some((flow) => flow.key === 'policy.to_objective' && flow.enabled),
        ),
      error: () => this.objectiveFlow.set(false),
    });
  }
}
