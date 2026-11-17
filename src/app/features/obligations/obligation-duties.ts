import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, forkJoin, map, of } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { KitApi } from '../../core/kit/kit-api';
import { kitErrorKey } from '../../core/kit/kit-errors';
import { LinkItem, SearchHit } from '../../core/kit/kit.models';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { TASK_PRIORITIES, TaskPriority } from '../../core/tasks/task.models';
import { FieldHelp } from '../../shared/guidance/field-help';
import { EntityChip } from '../../shared/kit/entity-chip';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { AssigneeSelect } from '../../shared/tasks/assignee-select';
import { decodeAssignee, dueAtFromDay, taskPriorityKey } from '../../shared/tasks/task-display';
import { Button } from '../../shared/ui/button/button';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { ObligationsApi } from './data/obligations-api';
import {
  DEFAULT_FOLLOW_UP_DAYS,
  DUTY_ENTITY_TYPE,
  Duty,
  FollowUpIn,
  Obligation,
} from './data/obligation.models';
import { addDaysIso, clauseLabel, complianceKey } from './data/obligation-display';
import { obligationErrorKey } from './data/obligation-errors';
import { ObligationRecordPicker } from './obligation-record-picker';

/**
 * The obligation's duties ("plikter"): each one with its own owner, the clauses and
 * articles it documents, its own compliance result from the latest evaluation, the
 * records that document it (linked "evidence for" the duty) and follow-up tasks.
 * `highlight` (`?duty=<id>`, the duty's own URL) scrolls to and marks one duty.
 */
@Component({
  selector: 'app-obligation-duties',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    EntityChip,
    LocalDayPipe,
    AssigneeSelect,
    Button,
    FormField,
    Icon,
    StatusBadge,
    ObligationRecordPicker,
  ],
  viewProviders: [provideSharedScope('tasks', 'kit')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-ob-duties-h" id="obligation-duties">
      <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="cf-ob-duties-h"
          class="flex items-center gap-1.5 font-display text-card font-bold text-fg"
        >
          {{ 'obligations.duties.title' | transloco }}
          @if (duties().length) {
            <span class="rounded-full bg-surface-2 px-1.5 text-micro font-semibold text-fg-muted">{{
              duties().length
            }}</span>
          }
          <app-field-help scope="obligations" page="detail" field="duties" />
        </h2>
        @if (canEdit()) {
          <a
            [routerLink]="['/obligations', obligation().id, 'edit']"
            fragment="duties"
            class="text-ui font-semibold text-accent hover:underline"
          >
            {{
              (duties().length ? 'obligations.duties.editAll' : 'obligations.duties.add')
                | transloco
            }}
          </a>
        }
      </div>
      <p class="mb-3 text-meta text-fg-muted">{{ 'obligations.duties.subtitle' | transloco }}</p>

      @if (duties().length === 0) {
        <p class="text-ui text-fg-muted" data-testid="duties-empty">
          {{ 'obligations.duties.none' | transloco }}
        </p>
      } @else {
        <ol class="flex flex-col gap-3" data-testid="duty-rows">
          @for (d of duties(); track d.id) {
            <li
              [id]="'duty-' + d.id"
              class="rounded-tile border p-3 transition-colors"
              [class]="d.id === highlight() ? 'border-accent bg-accent-soft' : 'border-border'"
              [attr.data-testid]="'duty-' + d.code"
            >
              <div class="flex flex-wrap items-start gap-x-3 gap-y-1">
                <span class="mt-0.5 font-mono text-meta text-fg-subtle">{{ d.code }}</span>
                <p class="min-w-0 flex-1 text-body font-semibold break-words text-fg">
                  {{ d.title }}
                </p>
                <app-status-badge
                  meaning="compliance"
                  [value]="d.compliance_status"
                  [labelKey]="complianceKey(d.compliance_status)"
                />
              </div>
              <p class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-meta text-fg-muted">
                <span>
                  {{
                    d.owner?.name
                      ? ('obligations.duties.owner' | transloco: { name: d.owner?.name })
                      : ('obligations.duties.ownerDefault' | transloco)
                  }}
                </span>
                <span>
                  @if (d.last_evaluated_on) {
                    {{
                      'obligations.duties.lastEvaluated'
                        | transloco: { date: (d.last_evaluated_on | localDay) }
                    }}
                  } @else {
                    {{ 'obligations.duties.neverEvaluated' | transloco }}
                  }
                </span>
                @if (d.open_actions) {
                  <span class="font-semibold text-fg">
                    {{ 'obligations.duties.openActions' | transloco: { count: d.open_actions } }}
                  </span>
                }
              </p>
              @if (d.clause_refs.length) {
                <ul
                  class="mt-2 flex flex-wrap gap-1.5"
                  [attr.aria-label]="'obligations.duties.clauses' | transloco"
                >
                  @for (ref of d.clause_refs; track ref) {
                    <li
                      class="rounded-full border border-border-strong px-2 py-0.5 text-micro font-semibold text-fg-muted"
                    >
                      {{ label(ref) }}
                    </li>
                  }
                </ul>
              }
              @if (d.last_note) {
                <p class="mt-2 text-ui whitespace-pre-line text-fg-muted">
                  <span class="font-semibold text-fg"
                    >{{ 'obligations.duties.lastNote' | transloco }}:</span
                  >
                  {{ d.last_note }}
                </p>
              }

              <div class="mt-2">
                <p class="text-meta font-semibold text-fg-subtle">
                  {{ 'obligations.duties.documentation' | transloco }}
                </p>
                @if (docsFor(d.id); as docs) {
                  @if (docs.length) {
                    <ul
                      class="mt-1 flex flex-wrap gap-1.5"
                      [attr.data-testid]="'duty-docs-' + d.code"
                    >
                      @for (l of docs; track l.id) {
                        <li><app-entity-chip [ref]="l.other" /></li>
                      }
                    </ul>
                  } @else {
                    <p class="mt-0.5 text-meta text-fg-muted">
                      {{ 'obligations.duties.noDocumentation' | transloco }}
                    </p>
                  }
                }
              </div>

              @if (canEdit()) {
                <div class="mt-3 flex flex-wrap gap-2">
                  <app-button
                    variant="secondary"
                    size="sm"
                    (click)="toggle(d.id, 'link')"
                    [attr.aria-expanded]="openFor() === d.id + ':link'"
                    [attr.data-testid]="'duty-link-' + d.code"
                  >
                    <app-icon name="link" [size]="14" />
                    {{ 'obligations.duties.linkDocumentation' | transloco }}
                  </app-button>
                  <app-button
                    variant="ghost"
                    size="sm"
                    (click)="toggle(d.id, 'task')"
                    [attr.aria-expanded]="openFor() === d.id + ':task'"
                    [attr.data-testid]="'duty-task-' + d.code"
                  >
                    <app-icon name="plus" [size]="14" />
                    {{ 'obligations.duties.newTask' | transloco }}
                  </app-button>
                </div>
                @if (openFor() === d.id + ':link') {
                  <div class="mt-3 rounded-tile border border-border bg-surface-2 p-3">
                    <p class="mb-2 text-meta text-fg-muted">
                      {{ 'obligations.duties.linkHelp' | transloco }}
                    </p>
                    <app-obligation-record-picker
                      [exclude]="excludeFor(d.id)"
                      [busy]="busy()"
                      actionKey="obligations.duties.linkAction"
                      (picked)="linkEvidence(d, $event)"
                    />
                  </div>
                }
                @if (openFor() === d.id + ':task') {
                  <form
                    class="mt-3 grid grid-cols-1 gap-3 rounded-tile border border-border bg-surface-2 p-3 sm:grid-cols-2"
                    (submit)="$event.preventDefault(); addTask(d)"
                    [attr.data-testid]="'duty-task-form-' + d.code"
                  >
                    <div class="sm:col-span-2">
                      <app-form-field
                        [label]="'obligations.actions.titleLabel' | transloco"
                        [inputId]="'cf-dt-title-' + d.id"
                      >
                        <input
                          [id]="'cf-dt-title-' + d.id"
                          type="text"
                          maxlength="255"
                          required
                          [placeholder]="'obligations.duties.taskPlaceholder' | transloco"
                          [value]="taskTitle()"
                          (input)="taskTitle.set($any($event.target).value)"
                        />
                      </app-form-field>
                    </div>
                    <app-form-field
                      [label]="'obligations.actions.assignee' | transloco"
                      [inputId]="'cf-dt-assignee-' + d.id"
                    >
                      <app-assignee-select
                        [inputId]="'cf-dt-assignee-' + d.id"
                        [value]="taskAssignee()"
                        (valueChange)="taskAssignee.set($event)"
                      />
                    </app-form-field>
                    <app-form-field
                      [label]="'obligations.actions.dueDate' | transloco"
                      [inputId]="'cf-dt-due-' + d.id"
                    >
                      <input
                        [id]="'cf-dt-due-' + d.id"
                        type="date"
                        [value]="taskDue()"
                        (change)="taskDue.set($any($event.target).value)"
                      />
                    </app-form-field>
                    <app-form-field
                      [label]="'obligations.actions.priority' | transloco"
                      [inputId]="'cf-dt-priority-' + d.id"
                    >
                      <select
                        [id]="'cf-dt-priority-' + d.id"
                        (change)="taskPriority.set($any($event.target).value)"
                      >
                        @for (p of priorities; track p) {
                          <option [value]="p" [selected]="taskPriority() === p">
                            {{ priorityKey(p) | transloco }}
                          </option>
                        }
                      </select>
                    </app-form-field>
                    <p class="text-meta text-fg-subtle sm:col-span-2">
                      {{ 'obligations.duties.taskDefaults' | transloco }}
                    </p>
                    <div class="flex justify-end gap-2 sm:col-span-2">
                      <app-button variant="ghost" size="sm" (click)="openFor.set(null)">
                        {{ 'common.cancel' | transloco }}
                      </app-button>
                      <app-button
                        type="submit"
                        size="sm"
                        [disabled]="!taskTitle().trim() || busy()"
                        [loading]="busy()"
                      >
                        {{ 'obligations.actions.save' | transloco }}
                      </app-button>
                    </div>
                  </form>
                }
              }
            </li>
          }
        </ol>
      }
    </section>
  `,
})
export class ObligationDuties {
  private readonly api = inject(ObligationsApi);
  private readonly kit = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  readonly obligation = input.required<Obligation>();
  readonly canEdit = input(false);
  /** The duty to scroll to and mark (`?duty=`). */
  readonly highlight = input<string | null>(null);
  /** A duty task was added (the obligation's counts change). */
  readonly changed = output<void>();

  protected readonly priorities = TASK_PRIORITIES;
  protected readonly priorityKey = taskPriorityKey;
  protected readonly complianceKey = complianceKey;

  protected readonly duties = computed<readonly Duty[]>(() => this.obligation().duties ?? []);
  /** Records linked to each duty, by duty id (null while loading). */
  private readonly links = signal<Readonly<Record<string, readonly LinkItem[]>> | null>(null);
  protected readonly openFor = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly taskTitle = signal('');
  protected readonly taskAssignee = signal('');
  protected readonly taskDue = signal('');
  protected readonly taskPriority = signal<TaskPriority>('normal');

  private readonly dutyIds = computed(() =>
    this.duties()
      .map((d) => d.id)
      .join(','),
  );
  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const ids = this.dutyIds();
      untracked(() => this.loadLinks(orgId, ids ? ids.split(',') : []));
    });
    afterNextRender(() => this.scrollToHighlight());
  }

  protected label(ref: string): string {
    return clauseLabel(ref, (key) => this.language.translate(key));
  }

  protected docsFor(dutyId: string): readonly LinkItem[] | null {
    const all = this.links();
    return all ? (all[dutyId] ?? []) : null;
  }

  protected excludeFor(dutyId: string): readonly string[] {
    return (this.docsFor(dutyId) ?? []).map((l) => `${l.other.entity_type}:${l.other.entity_id}`);
  }

  protected toggle(dutyId: string, what: 'link' | 'task'): void {
    const key = `${dutyId}:${what}`;
    if (this.openFor() === key) {
      this.openFor.set(null);
      return;
    }
    this.taskTitle.set('');
    this.taskAssignee.set('');
    this.taskDue.set(addDaysIso(DEFAULT_FOLLOW_UP_DAYS));
    this.taskPriority.set('normal');
    this.openFor.set(key);
  }

  /** The picked record documents the duty: `<record> evidence_for <duty>`. */
  protected linkEvidence(duty: Duty, hit: SearchHit): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.kit
      .createLink(orgId, {
        source_type: hit.entity_type,
        source_id: hit.entity_id,
        target_type: DUTY_ENTITY_TYPE,
        target_id: duty.id,
        link_type: 'evidence_for',
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.openFor.set(null);
          this.notifications.success('obligations.notices.dutyLinked', { code: duty.code });
          this.loadLinks(
            orgId,
            this.duties().map((d) => d.id),
          );
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.notifications.error(kitErrorKey(error));
        },
      });
  }

  protected addTask(duty: Duty): void {
    const orgId = this.selectedOrg.currentOrgId();
    const title = this.taskTitle().trim();
    if (!orgId || !title || this.busy()) {
      return;
    }
    const body: FollowUpIn = {
      title,
      assignee: decodeAssignee(this.taskAssignee()),
      due_at: dueAtFromDay(this.taskDue()),
      priority: this.taskPriority(),
    };
    this.busy.set(true);
    this.api.addDutyAction(orgId, this.obligation().id, duty.id, body).subscribe({
      next: () => {
        this.busy.set(false);
        this.openFor.set(null);
        this.notifications.success('obligations.notices.actionAdded');
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(obligationErrorKey(error));
      },
    });
  }

  private loadLinks(orgId: string | null, ids: readonly string[]): void {
    this.request.unsubscribe();
    if (!orgId || ids.length === 0) {
      this.links.set({});
      return;
    }
    this.request = forkJoin(
      ids.map((id) =>
        this.kit.links(orgId, DUTY_ENTITY_TYPE, id).pipe(
          map((list) => [id, list.items] as const),
          catchError(() => of([id, [] as readonly LinkItem[]] as const)),
        ),
      ),
    ).subscribe((pairs) => this.links.set(Object.fromEntries(pairs)));
  }

  private scrollToHighlight(): void {
    const id = this.highlight();
    if (!id) {
      return;
    }
    const el = this.host.nativeElement.querySelector<HTMLElement>(`#duty-${CSS.escape(id)}`);
    el?.scrollIntoView?.({ block: 'center' });
  }
}
