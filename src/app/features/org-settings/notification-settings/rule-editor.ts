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
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import {
  CHANNELS,
  Channel,
  DepartmentLead,
  NotificationRule,
} from '../../../core/notifications/activity.models';
import { activityErrorKey } from '../../../core/notifications/activity-errors';
import { NotificationRulesApi } from '../../../core/notifications/notification-rules-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { OrgMember, OrgRole } from '../../../core/org/org.models';
import { Alert } from '../../../shared/ui/alert/alert';
import { Button } from '../../../shared/ui/button/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { Switch } from '../../../shared/ui/switch/switch';
import {
  Lookup,
  RuleDraft,
  SIMPLE_RECIPIENT_TYPES,
  SimpleRecipientType,
  VALUE_TYPES,
  ValueRecipientType,
  draftFromRule,
  draftProblem,
  draftToUpdate,
  kindLabel,
} from './rule-helpers';

/** An option for a value recipient (role / department / user). */
export interface RecipientOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Slide-over editing one event kind's rule: who is notified (owner, assignees,
 * watchers, department lead, specific roles / departments / people), on which
 * channels, and whether the rule is on. "Restore default" deletes the org rule.
 */
@Component({
  selector: 'app-rule-editor',
  imports: [TranslocoPipe, SlideOver, Switch, Button, Alert, Icon, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="rule() !== null"
      [width]="520"
      [title]="title()"
      [closeLabel]="'activity.rules.editor.close' | transloco"
      (closed)="closed.emit()"
    >
      @if (rule(); as r) {
        @let d = draft();
        <div class="flex flex-col gap-6 px-5 py-5" data-testid="rule-editor">
          <p class="font-mono text-[12px] text-fg-subtle">{{ r.event_kind }}</p>

          <app-switch [checked]="d.enabled" (checkedChange)="setEnabled($event)">
            {{ 'activity.rules.editor.enabled' | transloco }}
          </app-switch>

          <fieldset class="flex flex-col gap-2" [disabled]="!d.enabled">
            <legend class="mb-1 text-[13px] font-semibold text-fg">
              {{ 'activity.rules.editor.recipients' | transloco }}
            </legend>
            <p class="text-[12.5px] text-fg-muted">
              {{ 'activity.rules.editor.recipientsHint' | transloco }}
            </p>
            @for (type of simpleTypes; track type) {
              <label class="flex items-start gap-2.5 text-[13px] text-fg">
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                  [checked]="d.simple.has(type)"
                  (change)="toggleSimple(type)"
                  [attr.data-testid]="'recipient-' + type"
                />
                <span>
                  <span class="font-medium">{{
                    'activity.recipients.' + type + '.label' | transloco
                  }}</span>
                  <span class="block text-[12px] text-fg-muted">{{
                    'activity.recipients.' + type + '.hint' | transloco
                  }}</span>
                </span>
              </label>
            }

            @for (type of valueTypes; track type) {
              <div class="mt-2 flex flex-col gap-1.5">
                <label [for]="'add-' + type" class="text-[12.5px] font-semibold text-fg-muted">
                  {{ 'activity.recipients.' + type + '.label' | transloco }}
                </label>
                @if (d.values[type].length > 0) {
                  <ul class="flex flex-wrap gap-1.5">
                    @for (value of d.values[type]; track value) {
                      <li
                        class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-2.5 text-[12.5px] text-fg"
                      >
                        {{ optionLabel(type, value) }}
                        <button
                          type="button"
                          (click)="removeValue(type, value)"
                          [attr.aria-label]="
                            'activity.rules.editor.remove'
                              | transloco: { name: optionLabel(type, value) }
                          "
                          class="flex h-5 w-5 items-center justify-center rounded-full text-fg-subtle hover:bg-surface hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                        >
                          <app-icon name="x" [size]="12" />
                        </button>
                      </li>
                    }
                  </ul>
                }
                <select
                  [id]="'add-' + type"
                  [attr.data-testid]="'add-' + type"
                  (change)="addValue(type, $event)"
                  class="h-9 rounded-[10px] border border-border bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent disabled:opacity-60"
                >
                  <option value="">{{ 'activity.rules.editor.add' | transloco }}</option>
                  @for (option of available(type); track option.value) {
                    <option [value]="option.value">{{ option.label }}</option>
                  }
                </select>
              </div>
            }
          </fieldset>

          <fieldset class="flex flex-col gap-2" [disabled]="!d.enabled">
            <legend class="mb-1 text-[13px] font-semibold text-fg">
              {{ 'activity.rules.editor.channels' | transloco }}
            </legend>
            @for (channel of channels; track channel) {
              <label class="flex items-start gap-2.5 text-[13px] text-fg">
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                  [checked]="d.channels.has(channel)"
                  (change)="toggleChannel(channel)"
                  [attr.data-testid]="'channel-' + channel"
                />
                <span>
                  <span class="font-medium">{{
                    'activity.channels.' + channel + '.label' | transloco
                  }}</span>
                  <span class="block text-[12px] text-fg-muted">{{
                    'activity.channels.' + channel + '.hint' | transloco
                  }}</span>
                </span>
              </label>
            }
          </fieldset>

          @if (problem(); as p) {
            <app-alert tone="info">{{ p | transloco }}</app-alert>
          }
          @if (errorKey(); as e) {
            <app-alert data-testid="rule-error">{{ e | transloco }}</app-alert>
          }

          <div
            class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4"
          >
            <app-button
              variant="ghost"
              [disabled]="r.is_default || busy()"
              (click)="confirmReset.set(true)"
            >
              {{ 'activity.rules.editor.reset' | transloco }}
            </app-button>
            <div class="flex gap-2">
              <app-button variant="secondary" (click)="closed.emit()">
                {{ 'activity.rules.editor.cancel' | transloco }}
              </app-button>
              <app-button
                data-testid="rule-save"
                [loading]="busy()"
                [disabled]="problem() !== null"
                (click)="save()"
              >
                {{ 'activity.rules.editor.save' | transloco }}
              </app-button>
            </div>
          </div>
        </div>

        <app-confirm-dialog
          [open]="confirmReset()"
          [title]="'activity.rules.editor.resetTitle' | transloco"
          [message]="'activity.rules.editor.resetMessage' | transloco"
          [confirmLabel]="'activity.rules.editor.reset' | transloco"
          [cancelLabel]="'activity.rules.editor.cancel' | transloco"
          confirmVariant="primary"
          [busy]="busy()"
          (confirmed)="reset()"
          (cancelled)="confirmReset.set(false)"
        />
      }
    </app-slide-over>
  `,
})
export class RuleEditor {
  private readonly api = inject(NotificationRulesApi);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);

  readonly orgId = input.required<string>();
  /** The rule being edited; null keeps the panel closed. */
  readonly rule = input<NotificationRule | null>(null);
  readonly roles = input<readonly OrgRole[]>([]);
  readonly departments = input<readonly DepartmentLead[]>([]);
  readonly members = input<readonly OrgMember[]>([]);

  readonly saved = output<NotificationRule>();
  /** The org rule was deleted; the host reloads to get the default back. */
  readonly restored = output<string>();
  readonly closed = output<void>();

  protected readonly simpleTypes = SIMPLE_RECIPIENT_TYPES;
  protected readonly valueTypes = VALUE_TYPES;
  protected readonly channels = CHANNELS;

  protected readonly draft = signal<RuleDraft>({
    enabled: true,
    simple: new Set(),
    values: { role: [], department: [], user: [] },
    channels: new Set(),
  });
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly confirmReset = signal(false);
  protected readonly problem = computed(() => draftProblem(this.draft()));

  private readonly lookup: Lookup = (key, params) => {
    const value = this.language.translate(key, params);
    return value === key ? null : value;
  };

  protected readonly title = computed(() => {
    const rule = this.rule();
    return rule ? kindLabel(rule.event_kind, this.lookup) : '';
  });

  private readonly options = computed<Record<ValueRecipientType, RecipientOption[]>>(() => ({
    role: this.roles().map((r) => ({
      value: r.key,
      label: this.lookup(`roles.${r.key}.name`) ?? r.name,
    })),
    department: this.departments().map((d) => ({ value: d.department_id, label: d.name })),
    user: this.members()
      .filter((m) => m.is_active)
      .map((m) => ({ value: m.user_id, label: m.full_name || m.email })),
  }));

  constructor() {
    effect(() => {
      const rule = this.rule();
      untracked(() => {
        this.errorKey.set(null);
        this.confirmReset.set(false);
        if (rule) this.draft.set(draftFromRule(rule));
      });
    });
  }

  protected available(type: ValueRecipientType): RecipientOption[] {
    const chosen = new Set(this.draft().values[type]);
    return this.options()[type].filter((o) => !chosen.has(o.value));
  }

  protected optionLabel(type: ValueRecipientType, value: string): string {
    return this.options()[type].find((o) => o.value === value)?.label ?? value;
  }

  protected setEnabled(enabled: boolean): void {
    this.draft.update((d) => ({ ...d, enabled }));
  }

  protected toggleSimple(type: SimpleRecipientType): void {
    this.draft.update((d) => {
      const simple = new Set(d.simple);
      if (simple.has(type)) simple.delete(type);
      else simple.add(type);
      return { ...d, simple };
    });
  }

  protected toggleChannel(channel: Channel): void {
    this.draft.update((d) => {
      const channels = new Set(d.channels);
      if (channels.has(channel)) channels.delete(channel);
      else channels.add(channel);
      return { ...d, channels };
    });
  }

  protected addValue(type: ValueRecipientType, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    select.value = '';
    if (!value) return;
    this.draft.update((d) =>
      d.values[type].includes(value)
        ? d
        : { ...d, values: { ...d.values, [type]: [...d.values[type], value] } },
    );
  }

  protected removeValue(type: ValueRecipientType, value: string): void {
    this.draft.update((d) => ({
      ...d,
      values: { ...d.values, [type]: d.values[type].filter((v) => v !== value) },
    }));
  }

  protected save(): void {
    const rule = this.rule();
    if (!rule || this.busy() || this.problem()) return;
    this.busy.set(true);
    this.errorKey.set(null);
    this.api.setRule(this.orgId(), rule.event_kind, draftToUpdate(this.draft())).subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.toasts.success('activity.rules.saved');
        this.saved.emit(saved);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.errorKey.set(activityErrorKey(error));
      },
    });
  }

  protected reset(): void {
    const rule = this.rule();
    if (!rule || this.busy()) return;
    this.busy.set(true);
    this.api.resetRule(this.orgId(), rule.event_kind).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmReset.set(false);
        this.toasts.success('activity.rules.restored');
        this.restored.emit(rule.event_kind);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.confirmReset.set(false);
        this.errorKey.set(activityErrorKey(error));
      },
    });
  }
}
