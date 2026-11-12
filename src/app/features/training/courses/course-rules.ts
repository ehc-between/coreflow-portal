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
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Switch } from '../../../shared/ui/switch/switch';
import { TrainingApi } from '../data/training-api';
import { trainingErrorKey } from '../data/training-display';
import { RULE_TARGETS, Rule, RuleTarget } from '../data/training.models';
import { TrainingPeople } from '../shared/people';

/** Whether a rule target needs a value (role key, department id or user id). */
export function targetNeedsValue(target: RuleTarget): boolean {
  return target === 'role' || target === 'department' || target === 'user';
}

/**
 * Assignment rules of a course: who must take it and how many days they get.
 * Training managers (`training:manage`) add, pause and remove rules; the
 * planner then creates the assignments (also on publish, daily and on sync).
 */
@Component({
  selector: 'app-training-course-rules',
  imports: [FormsModule, TranslocoPipe, Alert, Badge, Button, Card, FormField, Switch, FieldHelp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-[15px] font-semibold text-fg">{{ 'training.rules.title' | transloco }}</h2>
        @if (canManage()) {
          <app-button size="sm" variant="ghost" [loading]="syncing()" (click)="sync()">
            {{ 'training.rules.sync' | transloco }}
          </app-button>
        }
      </div>
      <p class="mb-3 text-[13px] text-fg-muted">{{ 'training.rules.intro' | transloco }}</p>

      @if (rules().length === 0) {
        <p class="mb-3 text-[13px] text-fg-muted" data-testid="rules-empty">
          {{ 'training.rules.empty' | transloco }}
        </p>
      } @else {
        <ul class="mb-3 flex flex-col divide-y divide-border" data-testid="rules-list">
          @for (rule of rules(); track rule.id) {
            <li class="flex flex-wrap items-center gap-3 py-2">
              <div class="min-w-0 flex-1 text-[13px]">
                <span class="font-semibold text-fg">{{ targetLabel(rule) }}</span>
                <span class="text-fg-muted">
                  · {{ 'training.rules.dueDays' | transloco: { days: rule.due_days } }}
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
                <app-button size="sm" variant="ghost" (click)="remove(rule)">
                  {{ 'training.common.remove' | transloco }}
                </app-button>
              }
            </li>
          }
        </ul>
      }

      @if (canManage()) {
        <form
          class="grid gap-3 border-t border-border pt-3 sm:grid-cols-[180px_1fr_110px_auto] sm:items-end"
          (submit)="$event.preventDefault(); add()"
          data-testid="rule-form"
        >
          <app-form-field [label]="'training.rules.target' | transloco" inputId="rule-target">
            <select
              id="rule-target"
              name="target"
              [(ngModel)]="target"
              (ngModelChange)="value = ''"
            >
              @for (t of targets; track t) {
                <option [value]="t">{{ 'training.ruleTarget.' + t | transloco }}</option>
              }
            </select>
          </app-form-field>
          <app-form-field [label]="'training.rules.value' | transloco" inputId="rule-value">
            @switch (target) {
              @case ('role') {
                <select id="rule-value" name="value" [(ngModel)]="value">
                  <option value="">{{ 'training.rules.pick' | transloco }}</option>
                  @for (role of roles; track role) {
                    <option [value]="role">{{ roleName(role) }}</option>
                  }
                </select>
              }
              @case ('department') {
                <select id="rule-value" name="value" [(ngModel)]="value">
                  <option value="">{{ 'training.rules.pick' | transloco }}</option>
                  @for (d of directory.departments(); track d.id) {
                    <option [value]="d.id">{{ d.name }}</option>
                  }
                </select>
              }
              @case ('user') {
                <select id="rule-value" name="value" [(ngModel)]="value">
                  <option value="">{{ 'training.rules.pick' | transloco }}</option>
                  @for (p of directory.people(); track p.id) {
                    <option [value]="p.id">{{ p.name }}</option>
                  }
                </select>
              }
              @default {
                <input
                  id="rule-value"
                  name="value"
                  disabled
                  [value]="'training.rules.noValue' | transloco"
                />
              }
            }
          </app-form-field>
          <app-form-field [label]="'training.rules.days' | transloco" inputId="rule-days">
            <input
              id="rule-days"
              name="days"
              type="number"
              min="0"
              max="365"
              [(ngModel)]="dueDays"
            />
          </app-form-field>
          <app-button
            type="submit"
            [loading]="busy()"
            [disabled]="!canAdd()"
            data-testid="rule-add"
          >
            {{ 'training.rules.add' | transloco }}
          </app-button>
          <div class="sm:col-span-4">
            <app-field-help scope="training" page="detail" field="rules" />
          </div>
        </form>
      }
      @if (error(); as key) {
        <div class="mt-3">
          <app-alert>{{ key | transloco }}</app-alert>
        </div>
      }
    </app-card>
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
  /** A rule was added (assignments may have been created). */
  readonly changed = output<void>();

  protected readonly targets = RULE_TARGETS;
  protected readonly roles = ROLE_KEYS;
  protected readonly rules = signal<readonly Rule[]>([]);
  protected readonly busy = signal(false);
  protected readonly syncing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected target: RuleTarget = 'all';
  protected value = '';
  protected dueDays = 30;

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
      if (this.canManage()) {
        untracked(() => this.directory.ensureLoaded());
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

  protected canAdd(): boolean {
    const days = Number(this.dueDays);
    return (
      !this.busy() &&
      Number.isInteger(days) &&
      days >= 0 &&
      days <= 365 &&
      (!targetNeedsValue(this.target) || !!this.value)
    );
  }

  protected add(): void {
    const orgId = this.orgId();
    if (!orgId || !this.canAdd()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api
      .createRule(orgId, this.courseId(), {
        target_type: this.target,
        target_value: targetNeedsValue(this.target) ? this.value : null,
        due_days: Number(this.dueDays),
      })
      .subscribe({
        next: (rule) => {
          this.busy.set(false);
          this.rules.update((list) => [...list, rule]);
          this.value = '';
          this.notifications.success('training.rules.added', {
            count: rule.assignments_created,
          });
          this.changed.emit();
        },
        error: (err: unknown) => {
          this.busy.set(false);
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

  protected remove(rule: Rule): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.api.deleteRule(orgId, rule.id).subscribe({
      next: () => this.rules.update((list) => list.filter((r) => r.id !== rule.id)),
      error: (err: unknown) => this.error.set(trainingErrorKey(err)),
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
