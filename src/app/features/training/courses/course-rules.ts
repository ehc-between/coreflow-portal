import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ROLE_KEYS, roleNameKey } from '../../../core/org/roles';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { Switch } from '../../../shared/ui/switch/switch';
import { TrainingApi } from '../data/training-api';
import { trainingErrorCode, trainingErrorKey } from '../data/training-display';
import {
  NamedOption,
  RULE_TARGETS,
  Rule,
  RuleCreate,
  RulePreview,
  RuleTarget,
} from '../data/training.models';
import { TrainingPeople } from '../shared/people';

/** Whether a rule target needs a value (department, position, access role or user id). */
export function targetNeedsValue(target: RuleTarget | ''): boolean {
  return target === 'role' || target === 'department' || target === 'user' || target === 'position';
}

/** The rule body for the form, or null while it is incomplete. */
export function ruleBody(
  target: RuleTarget | '',
  value: string,
  dueDays: number | string,
  recurrence: number | string | null,
): RuleCreate | null {
  const days = Number(dueDays);
  if (!target || !Number.isInteger(days) || days < 0 || days > 365) {
    return null;
  }
  if (targetNeedsValue(target) && !value) {
    return null;
  }
  const repeat =
    recurrence === null || `${recurrence}` === '' ? null : Math.round(Number(recurrence));
  if (repeat !== null && (!Number.isFinite(repeat) || repeat < 1 || repeat > 120)) {
    return null;
  }
  return {
    target_type: target,
    target_value: targetNeedsValue(target) ? value : null,
    due_days: days,
    recurrence_months: repeat,
  };
}

/**
 * "Hvem må ta kurset": the assignment rules of a course. Training managers
 * (`training:manage`) add a rule in two steps: fill in the form, see who it
 * would assign ("Dette tildeler kurset til 12 personer", with names), then
 * confirm. Nothing is pre-filled, a duplicate rule is refused, and a new rule
 * can be undone (it withdraws the assignments nobody has started).
 */
@Component({
  selector: 'app-training-course-rules',
  imports: [
    FormsModule,
    TranslocoPipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    FieldHelp,
    Icon,
    Switch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card>
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 class="flex items-center gap-1.5 text-card font-semibold text-fg">
          {{ 'training.rules.title' | transloco }}
          <app-field-help scope="training" page="detail" field="rules" />
        </h2>
        @if (canManage()) {
          <div class="flex flex-wrap gap-2">
            @if (!formOpen()) {
              <app-button
                size="sm"
                variant="secondary"
                (click)="openForm()"
                data-testid="rule-open"
              >
                <app-icon name="plus" [size]="14" />
                {{ 'training.rules.add' | transloco }}
              </app-button>
            }
            <app-button
              size="sm"
              variant="ghost"
              [loading]="syncing()"
              [title]="'training.rules.syncHelp' | transloco"
              (click)="sync()"
            >
              {{ 'training.rules.sync' | transloco }}
            </app-button>
          </div>
        }
      </div>
      <p class="mb-3 text-ui text-fg-muted">{{ 'training.rules.intro' | transloco }}</p>
      @if (!published()) {
        <p class="mb-3 text-meta text-fg-muted">{{ 'training.rules.draftNote' | transloco }}</p>
      }

      @if (rules().length === 0) {
        <p class="mb-1 text-ui text-fg-muted" data-testid="rules-empty">
          {{ 'training.rules.empty' | transloco }}
        </p>
      } @else {
        <ul class="mb-1 flex flex-col divide-y divide-border" data-testid="rules-list">
          @for (rule of rules(); track rule.id) {
            <li class="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              <div class="min-w-0 flex-1 basis-[220px] text-ui">
                <span class="font-semibold text-fg">{{ targetLabel(rule) }}</span>
                <span class="block text-meta text-fg-muted">
                  {{ 'training.rules.dueDays' | transloco: { days: rule.due_days } }}
                  @if (rule.recurrence_months) {
                    ·
                    {{
                      (rule.recurrence_months === 1
                        ? 'training.rules.repeatsOne'
                        : 'training.rules.repeats'
                      ) | transloco: { months: rule.recurrence_months }
                    }}
                  }
                  @if (rule.open_assignments !== undefined) {
                    ·
                    {{
                      (rule.open_assignments === 1
                        ? 'training.rules.openOne'
                        : 'training.rules.open'
                      ) | transloco: { count: rule.open_assignments }
                    }}
                  }
                </span>
              </div>
              @if (!rule.active) {
                <app-badge tone="neutral">{{ 'training.rules.paused' | transloco }}</app-badge>
              }
              @if (canManage()) {
                <app-switch
                  class="w-auto"
                  [checked]="rule.active"
                  (checkedChange)="setActive(rule, $event)"
                  >{{ 'training.rules.active' | transloco }}</app-switch
                >
                <app-button
                  size="sm"
                  variant="ghost"
                  (click)="undoTarget.set(rule)"
                  [attr.data-testid]="'rule-undo-' + rule.id"
                >
                  {{ 'training.rules.remove' | transloco }}
                </app-button>
              }
            </li>
          }
        </ul>
      }

      @if (canManage() && formOpen()) {
        <form
          class="mt-3 flex flex-col gap-3 border-t border-border pt-3"
          (submit)="$event.preventDefault(); preview()"
          data-testid="rule-form"
        >
          <div class="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            <div class="flex flex-col gap-1.5">
              <label for="rule-target" class="text-ui font-semibold text-fg-muted">
                {{ 'training.rules.target' | transloco }}
              </label>
              <select
                id="rule-target"
                name="target"
                class="h-10 w-full min-w-0 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                [ngModel]="target()"
                (ngModelChange)="setTarget($event)"
              >
                <option value="">{{ 'training.rules.pickTarget' | transloco }}</option>
                @for (t of targets; track t) {
                  <option [value]="t">{{ 'training.ruleTarget.' + t | transloco }}</option>
                }
              </select>
            </div>
            @if (needsValue()) {
              <div class="flex flex-col gap-1.5">
                <label for="rule-value" class="text-ui font-semibold text-fg-muted">
                  {{ 'training.rules.valueFor.' + target() | transloco }}
                </label>
                <select
                  id="rule-value"
                  name="value"
                  class="h-10 w-full min-w-0 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                  [ngModel]="value()"
                  (ngModelChange)="setValue($event)"
                >
                  <option value="">{{ 'training.rules.pick' | transloco }}</option>
                  @switch (target()) {
                    @case ('role') {
                      @for (role of roles; track role) {
                        <option [value]="role">{{ roleName(role) }}</option>
                      }
                    }
                    @case ('department') {
                      @for (d of directory.departments(); track d.id) {
                        <option [value]="d.id">{{ d.name }}</option>
                      }
                    }
                    @case ('position') {
                      @for (p of positions(); track p.id) {
                        <option [value]="p.id">{{ p.name }}</option>
                      }
                    }
                    @case ('user') {
                      @for (p of directory.people(); track p.id) {
                        <option [value]="p.id">{{ p.name }}</option>
                      }
                    }
                  }
                </select>
                @if (target() === 'position' && positions().length === 0) {
                  <p class="text-meta text-fg-muted">
                    {{ 'training.rules.noPositions' | transloco }}
                  </p>
                }
                @if (target() === 'role') {
                  <p class="text-meta text-fg-muted">{{ 'training.rules.roleHint' | transloco }}</p>
                }
              </div>
            }
            <div class="flex flex-col gap-1.5">
              <label for="rule-days" class="text-ui font-semibold text-fg-muted">
                {{ 'training.rules.days' | transloco }}
              </label>
              <input
                id="rule-days"
                name="days"
                type="number"
                min="0"
                max="365"
                class="h-10 w-full min-w-0 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                [ngModel]="dueDays()"
                (ngModelChange)="dueDays.set($event); previewResult.set(null)"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label for="rule-repeat" class="text-ui font-semibold text-fg-muted">
                {{ 'training.rules.recurrence' | transloco }}
              </label>
              <input
                id="rule-repeat"
                name="repeat"
                type="number"
                min="1"
                max="120"
                class="h-10 w-full min-w-0 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent"
                [placeholder]="'training.rules.recurrencePlaceholder' | transloco"
                [ngModel]="recurrence()"
                (ngModelChange)="recurrence.set($event); previewResult.set(null)"
              />
              <p class="text-meta text-fg-muted">
                {{ 'training.rules.recurrenceHelp' | transloco }}
              </p>
            </div>
          </div>

          @if (previewResult(); as p) {
            <div
              class="rounded-tile border px-3 py-2.5 text-ui"
              [class]="
                p.duplicate_rule_id ? 'border-warn/40 bg-warn-soft' : 'border-info/30 bg-info-soft'
              "
              role="status"
              data-testid="rule-preview"
            >
              @if (p.duplicate_rule_id) {
                <p class="font-semibold text-warn-ink">
                  {{ 'training.rules.duplicate' | transloco }}
                </p>
              } @else {
                <p class="font-semibold text-fg">
                  {{
                    (p.will_assign === 1 ? 'training.rules.previewOne' : 'training.rules.preview')
                      | transloco: { count: p.will_assign }
                  }}
                </p>
                <p class="mt-0.5 text-meta text-fg-muted">
                  {{
                    'training.rules.previewDetail'
                      | transloco
                        : {
                            targeted: p.targeted,
                            assigned: p.already_assigned,
                            compliant: p.already_compliant,
                          }
                  }}
                </p>
                @if (!p.course_published) {
                  <p class="mt-1 text-meta text-fg-muted">
                    {{ 'training.rules.previewDraft' | transloco }}
                  </p>
                }
                @if (p.sample.length) {
                  <p class="mt-1.5 text-meta text-fg-muted">
                    {{ 'training.rules.previewSample' | transloco }}
                    {{ sampleText(p) }}
                  </p>
                }
              }
            </div>
          }

          @if (error(); as key) {
            <app-alert>{{ key | transloco }}</app-alert>
          }

          <div class="flex flex-wrap justify-end gap-2">
            <app-button variant="secondary" (click)="closeForm()">
              {{ 'training.common.cancel' | transloco }}
            </app-button>
            @if (previewResult(); as p) {
              @if (!p.duplicate_rule_id) {
                <app-button [loading]="busy()" (click)="confirm()" data-testid="rule-confirm">
                  {{
                    (p.will_assign === 1 ? 'training.rules.confirmOne' : 'training.rules.confirm')
                      | transloco: { count: p.will_assign }
                  }}
                </app-button>
              }
            } @else {
              <app-button
                type="submit"
                [loading]="busy()"
                [disabled]="!body()"
                data-testid="rule-add"
              >
                {{ 'training.rules.check' | transloco }}
              </app-button>
            }
          </div>
        </form>
      } @else if (error(); as key) {
        <div class="mt-3">
          <app-alert>{{ key | transloco }}</app-alert>
        </div>
      }
    </app-card>

    <app-confirm-dialog
      [open]="undoTarget() !== null"
      [title]="'training.rules.undoTitle' | transloco"
      [message]="
        'training.rules.undoMessage' | transloco: { count: undoTarget()?.open_assignments ?? 0 }
      "
      [confirmLabel]="'training.rules.remove' | transloco"
      [cancelLabel]="'training.common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="undo()"
      (cancelled)="undoTarget.set(null)"
    />
  `,
})
export class CourseRules {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);
  protected readonly directory = inject(TrainingPeople);

  readonly courseId = input.required<string>();
  readonly canManage = input(false);
  /** Assignments are only created for a published course. */
  readonly published = input(true);
  /** A rule was added or removed (assignments may have changed). */
  readonly changed = output<void>();

  protected readonly targets = RULE_TARGETS;
  protected readonly roles = ROLE_KEYS;
  protected readonly rules = signal<readonly Rule[]>([]);
  protected readonly positions = signal<readonly NamedOption[]>([]);
  protected readonly busy = signal(false);
  protected readonly syncing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly undoTarget = signal<Rule | null>(null);
  protected readonly previewResult = signal<RulePreview | null>(null);
  protected readonly target = signal<RuleTarget | ''>('');
  protected readonly value = signal('');
  protected readonly dueDays = signal<number | string>(30);
  protected readonly recurrence = signal<number | string | null>(null);

  protected readonly needsValue = computed(() => targetNeedsValue(this.target()));
  protected readonly body = computed(() =>
    ruleBody(this.target(), this.value(), this.dueDays(), this.recurrence()),
  );

  private readonly orgId = computed(() => this.selectedOrg.currentOrgId());

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      const courseId = this.courseId();
      untracked(() => {
        if (orgId) {
          this.load(orgId, courseId);
        }
      });
    });
    effect(() => {
      const orgId = this.orgId();
      if (this.canManage() && orgId) {
        untracked(() => {
          this.directory.ensureLoaded();
          this.api.positions(orgId).subscribe({
            next: (res) =>
              this.positions.set(
                res.items.map((p) => ({
                  id: p.id,
                  name: p.code ? `${p.title} (${p.code})` : p.title,
                })),
              ),
            error: () => this.positions.set([]),
          });
        });
      }
    });
  }

  protected roleName(role: string): string {
    return this.language.translate(roleNameKey(role));
  }

  protected targetLabel(rule: Rule): string {
    const kind = this.language.translate(`training.ruleTarget.${rule.target_type}`);
    if (!targetNeedsValue(rule.target_type)) {
      return kind;
    }
    const label =
      rule.target_type === 'role' && rule.target_value
        ? this.roleName(rule.target_value)
        : (rule.target_label ?? rule.target_value ?? '');
    return `${kind}: ${label}`;
  }

  /** "Kari Nordmann, Lars Olsen og 10 til" (email added where two people share a name). */
  protected sampleText(p: RulePreview): string {
    const counts = new Map<string, number>();
    for (const person of p.sample) {
      counts.set(person.name, (counts.get(person.name) ?? 0) + 1);
    }
    const names = p.sample.map((person) =>
      (counts.get(person.name) ?? 0) > 1 && person.email
        ? `${person.name} (${person.email})`
        : person.name,
    );
    const more = p.will_assign - names.length;
    return more > 0
      ? this.language.translate('training.rules.previewMore', {
          names: names.join(', '),
          count: more,
        })
      : names.join(', ');
  }

  protected openForm(): void {
    this.formOpen.set(true);
    this.target.set('');
    this.value.set('');
    this.dueDays.set(30);
    this.recurrence.set(null);
    this.previewResult.set(null);
    this.error.set(null);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.previewResult.set(null);
    this.error.set(null);
  }

  protected setTarget(value: string): void {
    this.target.set(
      (RULE_TARGETS as readonly string[]).includes(value) ? (value as RuleTarget) : '',
    );
    this.value.set('');
    this.previewResult.set(null);
  }

  protected setValue(value: string): void {
    this.value.set(value);
    this.previewResult.set(null);
  }

  /** Step 1: who would this rule assign? Nothing is saved. */
  protected preview(): void {
    const orgId = this.orgId();
    const body = this.body();
    if (!orgId || !body || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.previewRule(orgId, this.courseId(), body).subscribe({
      next: (p) => {
        this.busy.set(false);
        this.previewResult.set(p);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(trainingErrorKey(err));
      },
    });
  }

  /** Step 2: save the rule (the backend refuses an identical one with 409). */
  protected confirm(): void {
    const orgId = this.orgId();
    const body = this.body();
    if (!orgId || !body || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.createRule(orgId, this.courseId(), body).subscribe({
      next: (rule) => {
        this.busy.set(false);
        this.rules.update((list) => [...list, rule]);
        this.closeForm();
        this.notifications.success('training.rules.added', { count: rule.assignments_created });
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        if (trainingErrorCode(err) === 'duplicate_rule') {
          this.previewResult.update((p) =>
            p ? { ...p, duplicate_rule_id: p.duplicate_rule_id ?? 'existing' } : p,
          );
        }
        this.error.set(trainingErrorKey(err));
      },
    });
  }

  protected setActive(rule: Rule, active: boolean): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.api.updateRule(orgId, rule.id, { active }).subscribe({
      next: (updated) => {
        this.rules.update((list) => list.map((r) => (r.id === updated.id ? updated : r)));
        if (active) {
          this.changed.emit();
        }
      },
      error: (err: unknown) => this.error.set(trainingErrorKey(err)),
    });
  }

  /** Remove the rule and withdraw its untouched assignments (started ones are kept). */
  protected undo(): void {
    const orgId = this.orgId();
    const rule = this.undoTarget();
    if (!orgId || !rule) {
      return;
    }
    this.busy.set(true);
    this.api.undoRule(orgId, rule.id).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.undoTarget.set(null);
        this.rules.update((list) => list.filter((r) => r.id !== rule.id));
        this.notifications.success('training.rules.undone', {
          cancelled: res.cancelled,
          kept: res.kept,
        });
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.undoTarget.set(null);
        this.error.set(trainingErrorKey(err));
      },
    });
  }

  protected sync(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.syncing.set(true);
    this.api.sync(orgId).subscribe({
      next: (res) => {
        this.syncing.set(false);
        this.notifications.success('training.rules.synced', { count: res.created });
        this.changed.emit();
      },
      error: (err: unknown) => {
        this.syncing.set(false);
        this.error.set(trainingErrorKey(err));
      },
    });
  }

  private load(orgId: string, courseId: string): void {
    this.api.listRules(orgId, courseId).subscribe({
      next: (res) => this.rules.set(res.items),
      error: () => this.rules.set([]),
    });
  }
}
