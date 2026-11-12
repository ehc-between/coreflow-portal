import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AiAssistButton } from '../../../shared/ask/ai-assist-button';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Timeline } from '../../../shared/kit/timeline';
import { LocalDatePipe, LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { AssigneeSelect } from '../../../shared/tasks/assignee-select';
import { EntityTasks } from '../../../shared/tasks/entity-tasks';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { RefSelect } from '../components/ref-select';
import {
  dateInputToIso,
  findingStatusKey,
  findingStatusTone,
  isoToDateInput,
  severityKey,
  severityTone,
} from '../data/inspection-display';
import { inspectionErrorKey } from '../data/inspection-errors';
import { InspectionReferences } from '../data/inspection-references';
import {
  ASSIST_SUGGEST_ACTIONS,
  FINDING_ENTITY_TYPE,
  Finding,
  FindingAssignee,
  InspectionPermissions,
  SEVERITIES,
  Severity,
} from '../data/inspection.models';
import { InspectionsApi } from '../data/inspections-api';

interface FindingEdit {
  readonly title: string;
  readonly description: string;
  readonly severity: Severity;
  readonly ownerId: string;
  readonly dueDate: string;
}

/** `user:<id>` / `role:<key>` / `department:<id>` -> the API's assignee (null when empty). */
export function parseAssignee(encoded: string): FindingAssignee | null {
  const match = /^(user|role|department):(.+)$/.exec(encoded);
  return match ? { type: match[1] as FindingAssignee['type'], value: match[2] } : null;
}

/**
 * One finding, in a side panel of its inspection: what failed, severity, owner and
 * due date, the linked deviation, follow-up actions (F2 tasks), the timeline and an
 * assistant suggestion for actions. People with edit rights edit, close and reopen
 * it, add actions and escalate it to a deviation (`deviations:write`); managers
 * delete it.
 */
@Component({
  selector: 'app-finding-panel',
  imports: [
    RouterLink,
    TranslocoPipe,
    AiAssistButton,
    FieldHelp,
    Timeline,
    LocalDatePipe,
    LocalDayPipe,
    MarkdownPipe,
    AssigneeSelect,
    EntityTasks,
    Badge,
    Button,
    ConfirmDialog,
    FormField,
    Icon,
    RefSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = finding();
    <div class="flex flex-col gap-4" data-testid="finding-panel">
      <div>
        <p class="font-mono text-[12px] text-fg-subtle">{{ f.code }}</p>
        <div class="mt-1 flex flex-wrap gap-1.5">
          <app-badge [tone]="severityTone(f.severity)">{{
            severityKey(f.severity) | transloco
          }}</app-badge>
          <app-badge [tone]="statusTone(f.status)">{{ statusKey(f.status) | transloco }}</app-badge>
          <app-badge tone="neutral">{{
            'inspections.findings.source.' + f.source | transloco
          }}</app-badge>
          @if (f.is_overdue) {
            <app-badge tone="fail">{{ 'inspections.list.overdue' | transloco }}</app-badge>
          }
        </div>
      </div>

      @if (editing()) {
        <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); saveEdit()">
          <app-form-field [label]="'inspections.fields.title' | transloco" inputId="fp-title">
            <input
              id="fp-title"
              required
              maxlength="255"
              [value]="edit().title"
              (input)="patchEdit({ title: $any($event.target).value })"
            />
          </app-form-field>
          <app-form-field [label]="'inspections.fields.description' | transloco" inputId="fp-desc">
            <textarea
              id="fp-desc"
              rows="3"
              maxlength="20000"
              [value]="edit().description"
              (input)="patchEdit({ description: $any($event.target).value })"
            ></textarea>
          </app-form-field>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <app-form-field [label]="'inspections.fields.severity' | transloco" inputId="fp-sev">
              <select id="fp-sev" (change)="patchEdit({ severity: $any($event.target).value })">
                @for (s of severities; track s) {
                  <option [value]="s" [selected]="s === edit().severity">
                    {{ severityKey(s) | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
            <app-form-field [label]="'inspections.fields.owner' | transloco" inputId="fp-owner">
              <app-ref-select
                inputId="fp-owner"
                [options]="references.users()"
                [value]="edit().ownerId"
                [currentName]="f.owner?.name ?? null"
                [noneLabel]="'inspections.form.noOwner' | transloco"
                (valueChange)="patchEdit({ ownerId: $event })"
              />
            </app-form-field>
            <app-form-field [label]="'inspections.fields.dueAt' | transloco" inputId="fp-due">
              <input
                id="fp-due"
                type="date"
                [value]="edit().dueDate"
                (input)="patchEdit({ dueDate: $any($event.target).value })"
              />
            </app-form-field>
          </div>
          <div class="flex justify-end gap-2">
            <app-button variant="ghost" size="sm" (click)="editing.set(false)">
              {{ 'inspections.actions.cancel' | transloco }}
            </app-button>
            <app-button
              type="submit"
              size="sm"
              [loading]="busy()"
              [disabled]="!edit().title.trim()"
            >
              {{ 'inspections.actions.save' | transloco }}
            </app-button>
          </div>
        </form>
      } @else {
        <div>
          <h3 class="text-[16px] font-bold text-fg">{{ f.title }}</h3>
          @if (f.question_text) {
            <p class="mt-1 text-[12.5px] text-fg-muted">
              {{ 'inspections.findings.fromQuestion' | transloco }}: {{ f.question_text }}
            </p>
          }
          @if (f.description) {
            <p class="mt-2 text-[13.5px] whitespace-pre-line text-fg">{{ f.description }}</p>
          }
        </div>
        <dl class="grid grid-cols-2 gap-2 text-[13px]">
          <dt class="text-fg-muted">{{ 'inspections.fields.owner' | transloco }}</dt>
          <dd class="text-fg">
            {{ f.owner?.name ?? ('inspections.findings.noOwner' | transloco) }}
          </dd>
          <dt class="text-fg-muted">{{ 'inspections.fields.dueAt' | transloco }}</dt>
          <dd [class.text-fail]="f.is_overdue">{{ f.due_at ? (f.due_at | localDay) : '—' }}</dd>
          <dt class="text-fg-muted">{{ 'inspections.findings.deviation' | transloco }}</dt>
          <dd>
            @if (f.deviation; as dev) {
              <a [routerLink]="dev.url" class="font-semibold text-accent hover:underline">
                {{ dev.code }}
              </a>
              <span class="text-fg-muted"> · {{ dev.status }}</span>
            } @else {
              <span class="text-fg-subtle">{{
                'inspections.findings.noDeviation' | transloco
              }}</span>
            }
          </dd>
          @if (f.closed_at) {
            <dt class="text-fg-muted">{{ 'inspections.findings.closedAt' | transloco }}</dt>
            <dd class="text-fg">
              {{ f.closed_at | localDate }}
              @if (f.closed_by?.name) {
                · {{ f.closed_by?.name }}
              }
            </dd>
          }
        </dl>
        <app-field-help scope="inspections" page="detail" field="finding" />

        <div class="flex flex-wrap gap-2">
          @if (canEdit()) {
            <app-button variant="secondary" size="sm" (click)="startEdit()">
              {{ 'inspections.actions.edit' | transloco }}
            </app-button>
            @if (f.status === 'open') {
              <app-button
                size="sm"
                [loading]="busy()"
                (click)="setStatus('close')"
                data-testid="close-finding"
              >
                {{ 'inspections.findings.close' | transloco }}
              </app-button>
            } @else {
              <app-button
                variant="secondary"
                size="sm"
                [loading]="busy()"
                (click)="setStatus('reopen')"
              >
                {{ 'inspections.findings.reopen' | transloco }}
              </app-button>
            }
            @if (!f.deviation && canEscalate()) {
              <app-button
                variant="secondary"
                size="sm"
                [loading]="busy()"
                (click)="escalate()"
                data-testid="escalate"
              >
                <app-icon name="flag" [size]="14" />
                {{ 'inspections.findings.escalate' | transloco }}
              </app-button>
            }
          }
          @if (permissions().can_manage) {
            <app-button variant="danger" size="sm" (click)="confirmDelete.set(true)">
              <app-icon name="trash" [size]="14" />
              {{ 'inspections.actions.delete' | transloco }}
            </app-button>
          }
        </div>
      }

      <section class="border-t border-border pt-3">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-[14px] font-bold text-fg">
            {{ 'inspections.findings.actions' | transloco }}
          </h3>
          <app-ai-assist-button
            [assist]="suggestAssist"
            labelKey="inspections.ai.suggestActions"
            [input]="{ finding_id: f.id }"
            [entityType]="entityType"
            [entityId]="f.id"
            (text)="suggestion.set($event)"
          />
        </div>
        @if (suggestion()) {
          <div
            class="mb-3 rounded-card border border-accent-border bg-accent-soft p-3 text-[13px] text-fg"
            data-testid="suggestion"
            [innerHTML]="suggestion() | appMarkdown"
          ></div>
        }
        @for (rev of [tasksRev()]; track rev) {
          <app-entity-tasks
            [entityType]="entityType"
            [entityId]="f.id"
            [canCreate]="false"
            [entityLabel]="f.code + ' ' + f.title"
          />
        }
        @if (canEdit() && f.status === 'open') {
          <form
            class="mt-3 flex flex-col gap-2 rounded-card border border-border p-3"
            (submit)="$event.preventDefault(); addAction()"
          >
            <app-form-field
              [label]="'inspections.findings.actionTitle' | transloco"
              inputId="fp-action"
            >
              <input
                id="fp-action"
                maxlength="255"
                [value]="actionTitle()"
                (input)="actionTitle.set($any($event.target).value)"
                data-testid="action-title"
              />
            </app-form-field>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <app-form-field
                [label]="'inspections.findings.actionAssignee' | transloco"
                inputId="fp-assignee"
              >
                <app-assignee-select
                  inputId="fp-assignee"
                  [value]="actionAssignee()"
                  (valueChange)="actionAssignee.set($event)"
                />
              </app-form-field>
              <app-form-field
                [label]="'inspections.fields.dueAt' | transloco"
                inputId="fp-action-due"
              >
                <input
                  id="fp-action-due"
                  type="date"
                  [value]="actionDue()"
                  (input)="actionDue.set($any($event.target).value)"
                />
              </app-form-field>
            </div>
            <div class="flex justify-end">
              <app-button
                type="submit"
                size="sm"
                [loading]="busy()"
                [disabled]="!actionTitle().trim()"
              >
                <app-icon name="plus" [size]="14" />
                {{ 'inspections.findings.addAction' | transloco }}
              </app-button>
            </div>
          </form>
        }
      </section>

      <section class="border-t border-border pt-3">
        <h3 class="mb-2 text-[14px] font-bold text-fg">
          {{ 'inspections.findings.activity' | transloco }}
        </h3>
        <app-timeline [entityType]="entityType" [entityId]="f.id" />
      </section>
    </div>

    <app-confirm-dialog
      [open]="confirmDelete()"
      [title]="'inspections.findings.deleteTitle' | transloco"
      [message]="'inspections.findings.deleteMessage' | transloco: { code: f.code }"
      [confirmLabel]="'inspections.actions.delete' | transloco"
      [cancelLabel]="'inspections.actions.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="remove()"
      (cancelled)="confirmDelete.set(false)"
    />
  `,
})
export class FindingPanel {
  private readonly api = inject(InspectionsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  protected readonly references = inject(InspectionReferences);

  readonly finding = input.required<Finding>();
  /** Rights on the finding's inspection. */
  readonly permissions = input.required<InspectionPermissions>();

  readonly changed = output<Finding>();
  readonly deleted = output<string>();

  protected readonly entityType = FINDING_ENTITY_TYPE;
  protected readonly suggestAssist = ASSIST_SUGGEST_ACTIONS;
  protected readonly severities = SEVERITIES;
  protected readonly severityKey = severityKey;
  protected readonly severityTone = severityTone;
  protected readonly statusKey = findingStatusKey;
  protected readonly statusTone = findingStatusTone;

  protected readonly editing = signal(false);
  protected readonly edit = signal<FindingEdit>({
    title: '',
    description: '',
    severity: 'medium',
    ownerId: '',
    dueDate: '',
  });
  protected readonly busy = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly suggestion = signal('');
  protected readonly actionTitle = signal('');
  protected readonly actionAssignee = signal('');
  protected readonly actionDue = signal('');
  protected readonly tasksRev = signal(0);

  private readonly orgPermissions = computed(
    () => this.selectedOrg.currentOrg()?.permissions ?? [],
  );

  /** Mirrors the server's finding edit rights (it decides; buttons only hide). */
  private readonly auth = inject(AuthService);

  /** The caller owns or created the finding. */
  private readonly ownsFinding = computed(() => {
    const me = this.auth.user()?.id;
    const f = this.finding();
    return !!me && (f.owner?.id === me || f.created_by?.id === me);
  });

  protected readonly canEdit = computed(() => {
    const p = this.permissions();
    return (
      p.can_manage ||
      (this.orgPermissions().includes('inspections:write') &&
        (p.can_perform || p.can_edit || this.ownsFinding()))
    );
  });

  protected readonly canEscalate = computed(() =>
    this.orgPermissions().includes('deviations:write'),
  );

  constructor() {
    this.references.ensurePeople();
  }

  protected startEdit(): void {
    const f = this.finding();
    this.edit.set({
      title: f.title,
      description: f.description ?? '',
      severity: f.severity,
      ownerId: f.owner?.id ?? '',
      dueDate: isoToDateInput(f.due_at),
    });
    this.editing.set(true);
  }

  protected patchEdit(change: Partial<FindingEdit>): void {
    this.edit.update((e) => ({ ...e, ...change }));
  }

  private orgId(): string | null {
    return this.selectedOrg.currentOrgId();
  }

  protected saveEdit(): void {
    const orgId = this.orgId();
    const e = this.edit();
    if (!orgId || !e.title.trim()) {
      return;
    }
    this.busy.set(true);
    this.api
      .updateFinding(orgId, this.finding().id, {
        title: e.title.trim(),
        description: e.description.trim() || null,
        severity: e.severity,
        owner_user_id: e.ownerId || null,
        due_at: dateInputToIso(e.dueDate),
      })
      .subscribe({
        next: (f) =>
          this.done(f, 'inspections.notices.findingSaved', () => this.editing.set(false)),
        error: (err: unknown) => this.fail(err),
      });
  }

  protected setStatus(action: 'close' | 'reopen'): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.busy.set(true);
    const call =
      action === 'close'
        ? this.api.closeFinding(orgId, this.finding().id)
        : this.api.reopenFinding(orgId, this.finding().id);
    call.subscribe({
      next: (f) =>
        this.done(
          f,
          action === 'close'
            ? 'inspections.notices.findingClosed'
            : 'inspections.notices.findingReopened',
        ),
      error: (err: unknown) => this.fail(err),
    });
  }

  protected escalate(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.busy.set(true);
    this.api.escalateFinding(orgId, this.finding().id).subscribe({
      next: (f) => this.done(f, 'inspections.notices.escalated'),
      error: (err: unknown) => this.fail(err),
    });
  }

  protected addAction(): void {
    const orgId = this.orgId();
    const title = this.actionTitle().trim();
    if (!orgId || !title) {
      return;
    }
    this.busy.set(true);
    this.api
      .addFindingAction(orgId, this.finding().id, {
        title,
        assignee: parseAssignee(this.actionAssignee()),
        due_at: dateInputToIso(this.actionDue()),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.actionTitle.set('');
          this.actionAssignee.set('');
          this.actionDue.set('');
          this.tasksRev.update((n) => n + 1);
          this.notifications.success('inspections.notices.actionAdded');
        },
        error: (err: unknown) => this.fail(err),
      });
  }

  protected remove(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.busy.set(true);
    const id = this.finding().id;
    this.api.deleteFinding(orgId, id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.notifications.success('inspections.notices.findingDeleted');
        this.deleted.emit(id);
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  private done(f: Finding, notice: string, after?: () => void): void {
    this.busy.set(false);
    after?.();
    this.notifications.success(notice, { code: f.code });
    this.changed.emit(f);
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.notifications.error(inspectionErrorKey(error));
  }
}
