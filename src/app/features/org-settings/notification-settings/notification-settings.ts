import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { catchError, forkJoin, of } from 'rxjs';
import { AiAvailability } from '../../../core/ai/ai-availability';
import { LanguageService } from '../../../core/i18n/language.service';
import {
  CHANNELS,
  DepartmentLead,
  NotificationRule,
  NotificationSettings,
  RecipientSpec,
} from '../../../core/notifications/activity.models';
import { NotificationRulesApi } from '../../../core/notifications/notification-rules-api';
import { OrgMember, OrgRole } from '../../../core/org/org.models';
import { OrgMembersApi } from '../../../core/org/org-members-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { ActivityGuide } from '../../../shared/activity/activity-guide';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { Switch } from '../../../shared/ui/switch/switch';
import { AskPanelService } from '../../ask/ask-panel.service';
import { DepartmentLeads } from './department-leads';
import { ReminderSettingsForm } from './reminder-settings-form';
import { RuleEditor } from './rule-editor';
import {
  Lookup,
  RuleFilter,
  categoryLabel,
  filterRules,
  groupRules,
  isValueType,
  kindLabel,
  moduleLabel,
} from './rule-helpers';

/**
 * `/settings/notifications` (org:manage): the notification rules matrix (who
 * hears about each event kind, and how), reminder / escalation settings and
 * department leads, with learning-mode guidance and assistant shortcuts.
 */
@Component({
  selector: 'app-notification-settings',
  imports: [
    TranslocoPipe,
    RouterLink,
    ActivityGuide,
    Alert,
    Badge,
    Button,
    Card,
    Icon,
    Switch,
    RuleEditor,
    ReminderSettingsForm,
    DepartmentLeads,
  ],
  providers: [provideTranslocoScope('activity')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/settings"
        class="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <app-icon name="back" [size]="14" />
        {{ 'activity.page.back' | transloco }}
      </a>
      <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ 'activity.page.title' | transloco }}
          </h1>
          <p class="mt-1.5 text-[14px] text-fg-muted">{{ 'activity.page.subtitle' | transloco }}</p>
        </div>
        @if (aiAvailable() && orgId()) {
          <div class="flex flex-wrap gap-2">
            <app-button variant="secondary" data-testid="ai-suggest" (click)="suggestSetup()">
              <app-icon name="spark" [size]="15" />
              {{ 'activity.ai.suggest' | transloco }}
            </app-button>
            <app-button variant="ghost" data-testid="ai-explain" (click)="explainPage()">
              {{ 'activity.ai.explain' | transloco }}
            </app-button>
          </div>
        }
      </div>

      @if (!orgId()) {
        <app-card>
          <p class="px-2 py-8 text-center text-[14px] text-fg-muted">
            {{ 'activity.page.noOrg' | transloco }}
          </p>
        </app-card>
      } @else {
        <div class="flex flex-col gap-8">
          <app-activity-guide page="rules" (explain)="ask.showWith($event)" />

          @if (loading()) {
            <app-card>
              <p class="px-2 py-8 text-center text-[14px] text-fg-muted" data-testid="loading">
                {{ 'activity.page.loading' | transloco }}
              </p>
            </app-card>
          } @else if (loadError()) {
            <app-card>
              <div class="flex flex-col items-center gap-3 py-6">
                <app-alert>{{ 'activity.page.loadError' | transloco }}</app-alert>
                <app-button variant="secondary" (click)="reload()">
                  {{ 'activity.page.retry' | transloco }}
                </app-button>
              </div>
            </app-card>
          } @else {
            <section aria-labelledby="rules-title" data-testid="rules-section">
              <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2
                    id="rules-title"
                    class="font-display text-[18px] font-bold tracking-[-0.02em] text-fg"
                  >
                    {{ 'activity.rules.title' | transloco }}
                  </h2>
                  <p class="mt-0.5 text-[13px] text-fg-muted">
                    {{ 'activity.rules.subtitle' | transloco }}
                  </p>
                </div>
              </div>

              <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <label class="sr-only" for="rules-search">{{
                  'activity.rules.search' | transloco
                }}</label>
                <input
                  id="rules-search"
                  type="search"
                  data-testid="rules-search"
                  [value]="query()"
                  (input)="query.set($any($event.target).value)"
                  [placeholder]="'activity.rules.search' | transloco"
                  class="h-9 w-full rounded-[10px] border border-border bg-bg px-3 text-[13px] text-fg outline-none focus:border-accent sm:w-64"
                />
                <label class="sr-only" for="rules-module">{{
                  'activity.rules.moduleFilter' | transloco
                }}</label>
                <select
                  id="rules-module"
                  data-testid="rules-module"
                  (change)="moduleFilter.set($any($event.target).value || null)"
                  class="h-9 rounded-[10px] border border-border bg-bg px-2.5 text-[13px] text-fg outline-none focus:border-accent"
                >
                  <option value="">{{ 'activity.rules.allModules' | transloco }}</option>
                  @for (m of modules(); track m.module) {
                    <option [value]="m.module" [selected]="m.module === moduleFilter()">
                      {{ m.label }}
                    </option>
                  }
                </select>
                <div class="sm:ml-2">
                  <app-switch [checked]="customOnly()" (checkedChange)="customOnly.set($event)">
                    {{ 'activity.rules.customOnly' | transloco }}
                  </app-switch>
                </div>
              </div>

              @if (rules().length === 0) {
                <app-card>
                  <div class="px-2 py-8 text-center" data-testid="rules-empty">
                    <p class="text-[14px] font-semibold text-fg">
                      {{ 'activity.rules.emptyTitle' | transloco }}
                    </p>
                    <p class="mx-auto mt-1 max-w-md text-[13px] text-fg-muted">
                      {{ 'activity.rules.emptyBody' | transloco }}
                    </p>
                  </div>
                </app-card>
              } @else if (groups().length === 0) {
                <app-card>
                  <div class="px-2 py-8 text-center" data-testid="rules-no-match">
                    <p class="text-[13.5px] text-fg-muted">
                      {{ 'activity.rules.noMatch' | transloco }}
                    </p>
                    <button
                      type="button"
                      (click)="clearFilters()"
                      class="mt-2 text-[13px] font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    >
                      {{ 'activity.rules.clearFilters' | transloco }}
                    </button>
                  </div>
                </app-card>
              } @else {
                <app-card [padded]="false">
                  <div class="overflow-x-auto">
                    <table class="w-full min-w-[720px] text-left text-[13px]">
                      <caption class="sr-only">
                        {{
                          'activity.rules.title' | transloco
                        }}
                      </caption>
                      <thead>
                        <tr class="border-b border-border text-[12px] text-fg-subtle">
                          <th scope="col" class="px-4 py-2.5 font-semibold">
                            {{ 'activity.rules.columns.event' | transloco }}
                          </th>
                          <th scope="col" class="px-4 py-2.5 font-semibold">
                            {{ 'activity.rules.columns.recipients' | transloco }}
                          </th>
                          <th scope="col" class="px-4 py-2.5 font-semibold">
                            {{ 'activity.rules.columns.channels' | transloco }}
                          </th>
                          <th scope="col" class="px-4 py-2.5 font-semibold">
                            {{ 'activity.rules.columns.status' | transloco }}
                          </th>
                          <th scope="col" class="px-4 py-2.5">
                            <span class="sr-only">{{
                              'activity.rules.columns.actions' | transloco
                            }}</span>
                          </th>
                        </tr>
                      </thead>
                      @for (group of groups(); track group.module) {
                        <tbody>
                          <tr class="bg-surface-2">
                            <th
                              scope="colgroup"
                              colspan="5"
                              class="px-4 py-1.5 text-[11.5px] font-semibold tracking-wide text-fg-muted uppercase"
                            >
                              {{ group.label }}
                            </th>
                          </tr>
                          @for (rule of group.rules; track rule.event_kind) {
                            <tr
                              class="border-b border-border align-top last:border-b-0"
                              data-testid="rule-row"
                            >
                              <th scope="row" class="px-4 py-3 font-normal">
                                <span class="block font-semibold text-fg">{{
                                  kindName(rule.event_kind)
                                }}</span>
                                <span class="mt-0.5 block text-[12px] text-fg-subtle">
                                  {{ categoryName(rule.category) }} ·
                                  <span class="font-mono">{{ rule.event_kind }}</span>
                                </span>
                              </th>
                              <td class="px-4 py-3">
                                @if (!rule.notify) {
                                  <span class="text-fg-muted">{{
                                    'activity.rules.timelineOnly' | transloco
                                  }}</span>
                                } @else if (rule.recipients.length === 0) {
                                  <span class="text-fg-muted">{{
                                    'activity.rules.nobody' | transloco
                                  }}</span>
                                } @else {
                                  <ul class="flex flex-wrap gap-1">
                                    @for (r of rule.recipients; track $index) {
                                      <li>
                                        <app-badge tone="neutral">{{ recipientName(r) }}</app-badge>
                                      </li>
                                    }
                                  </ul>
                                }
                              </td>
                              <td class="px-4 py-3">
                                @if (rule.notify) {
                                  <ul class="flex flex-wrap gap-1">
                                    @for (channel of channels; track channel) {
                                      @if (rule.channels.includes(channel)) {
                                        <li>
                                          <app-badge tone="accent">{{
                                            'activity.channels.' + channel + '.label' | transloco
                                          }}</app-badge>
                                        </li>
                                      }
                                    }
                                  </ul>
                                }
                              </td>
                              <td class="px-4 py-3">
                                @if (!rule.notify) {
                                  <app-badge tone="neutral">{{
                                    'activity.rules.status.timeline' | transloco
                                  }}</app-badge>
                                } @else if (!rule.enabled) {
                                  <app-badge tone="warn">{{
                                    'activity.rules.status.off' | transloco
                                  }}</app-badge>
                                } @else if (rule.is_default) {
                                  <app-badge tone="neutral">{{
                                    'activity.rules.status.default' | transloco
                                  }}</app-badge>
                                } @else {
                                  <app-badge tone="pass">{{
                                    'activity.rules.status.custom' | transloco
                                  }}</app-badge>
                                }
                              </td>
                              <td class="px-4 py-3 text-right">
                                @if (rule.notify) {
                                  <app-button
                                    variant="ghost"
                                    size="sm"
                                    data-testid="rule-edit"
                                    [attr.aria-label]="
                                      'activity.rules.editLabel'
                                        | transloco: { name: kindName(rule.event_kind) }
                                    "
                                    (click)="editing.set(rule)"
                                  >
                                    {{ 'activity.rules.edit' | transloco }}
                                  </app-button>
                                }
                              </td>
                            </tr>
                          }
                        </tbody>
                      }
                    </table>
                  </div>
                </app-card>
              }
            </section>

            <div class="grid gap-5 lg:grid-cols-2">
              <app-reminder-settings-form
                [orgId]="orgId()!"
                [settings]="settings()"
                [roles]="roles()"
                [roleName]="roleName"
                (saved)="settings.set($event)"
              />
              <app-department-leads
                [orgId]="orgId()!"
                [leads]="leads()"
                [members]="members()"
                (changed)="replaceLead($event)"
              />
            </div>
          }
        </div>

        <app-rule-editor
          [orgId]="orgId()!"
          [rule]="editing()"
          [roles]="roles()"
          [departments]="leads()"
          [members]="members()"
          (saved)="replaceRule($event)"
          (restored)="restored()"
          (closed)="editing.set(null)"
        />
      }
    </div>
  `,
})
export class NotificationSettingsPage {
  private readonly api = inject(NotificationRulesApi);
  private readonly membersApi = inject(OrgMembersApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly ai = inject(AiAvailability);
  protected readonly ask = inject(AskPanelService);

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly channels = CHANNELS;
  protected readonly aiAvailable = computed(() => !this.ai.unavailable());

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly rules = signal<readonly NotificationRule[]>([]);
  protected readonly settings = signal<NotificationSettings | null>(null);
  protected readonly leads = signal<readonly DepartmentLead[]>([]);
  protected readonly roles = signal<readonly OrgRole[]>([]);
  protected readonly members = signal<readonly OrgMember[]>([]);
  protected readonly editing = signal<NotificationRule | null>(null);

  protected readonly query = signal('');
  protected readonly moduleFilter = signal<string | null>(null);
  protected readonly customOnly = signal(false);

  /** Translate, or null when the key has no translation (so helpers can fall back). */
  private readonly lookup: Lookup = (key, params) => {
    const value = this.language.translate(key, params);
    return value === key ? null : value;
  };

  protected readonly modules = computed(() =>
    groupRules(this.rules(), this.lookup).map((g) => ({ module: g.module, label: g.label })),
  );

  protected readonly groups = computed(() => {
    const filter: RuleFilter = {
      query: this.query(),
      module: this.moduleFilter(),
      customOnly: this.customOnly(),
    };
    return groupRules(filterRules(this.rules(), filter, this.lookup), this.lookup);
  });

  protected readonly roleName = (role: OrgRole): string =>
    this.lookup(`roles.${role.key}.name`) ?? role.name;

  /** Incremented per load so a response for a previous org is dropped. */
  private generation = 0;

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      untracked(() => this.load(orgId));
    });
  }

  protected reload(): void {
    this.load(this.orgId());
  }

  private load(orgId: string | null): void {
    const generation = ++this.generation;
    this.editing.set(null);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.loadError.set(false);
    forkJoin({
      rules: this.api.listRules(orgId),
      settings: this.api.getSettings(orgId),
      leads: this.api.listDepartmentLeads(orgId),
      // Pickers degrade to empty lists rather than failing the page.
      roles: this.membersApi.listRoles(orgId).pipe(catchError(() => of([] as OrgRole[]))),
      members: this.membersApi.listMembers(orgId).pipe(catchError(() => of([] as OrgMember[]))),
    }).subscribe({
      next: (data) => {
        if (generation !== this.generation) return;
        this.rules.set(data.rules);
        this.settings.set(data.settings);
        this.leads.set(data.leads);
        this.roles.set(data.roles);
        this.members.set(data.members);
        this.loading.set(false);
      },
      error: () => {
        if (generation !== this.generation) return;
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  /** Re-fetch the rules only (after restoring a default). */
  private reloadRules(): void {
    const orgId = this.orgId();
    if (!orgId) return;
    const generation = this.generation;
    this.api.listRules(orgId).subscribe({
      next: (rules) => {
        if (generation === this.generation) this.rules.set(rules);
      },
      error: () => undefined,
    });
  }

  protected kindName(kind: string): string {
    return kindLabel(kind, this.lookup);
  }

  protected categoryName(category: string): string {
    return categoryLabel(category, this.lookup);
  }

  protected recipientName(recipient: RecipientSpec): string {
    const type = this.lookup(`activity.recipients.${recipient.type}.label`) ?? recipient.type;
    if (!isValueType(recipient.type) || !recipient.value) {
      return type;
    }
    const name = this.valueName(recipient.type, recipient.value);
    return this.lookup('activity.recipients.withValue', { type, name }) ?? `${type}: ${name}`;
  }

  private valueName(type: 'role' | 'department' | 'user', value: string): string {
    if (type === 'role') {
      const role = this.roles().find((r) => r.key === value);
      return this.lookup(`roles.${value}.name`) ?? role?.name ?? value;
    }
    if (type === 'department') {
      return this.leads().find((d) => d.department_id === value)?.name ?? value;
    }
    const member = this.members().find((m) => m.user_id === value);
    return member ? member.full_name || member.email : value;
  }

  protected replaceRule(saved: NotificationRule): void {
    this.rules.update((list) => list.map((r) => (r.event_kind === saved.event_kind ? saved : r)));
    this.editing.set(null);
  }

  protected restored(): void {
    this.editing.set(null);
    this.reloadRules();
  }

  protected replaceLead(saved: DepartmentLead): void {
    this.leads.update((list) =>
      list.map((d) => (d.department_id === saved.department_id ? saved : d)),
    );
  }

  protected clearFilters(): void {
    this.query.set('');
    this.moduleFilter.set(null);
    this.customOnly.set(false);
  }

  /** Ask the assistant for a rule and escalation setup suited to this organisation. */
  protected suggestSetup(): void {
    const s = this.settings();
    const kinds = this.rules()
      .filter((r) => r.notify)
      .map((r) => `${moduleLabel(r.module, this.lookup)}: ${this.kindName(r.event_kind)}`)
      .join('; ');
    this.ask.showWith(
      this.language.translate('activity.ai.suggestPrompt', {
        reminderDays: s?.reminder_days ?? 3,
        escalationDays: s?.escalation_days ?? 3,
        kinds,
      }),
    );
  }

  protected explainPage(): void {
    this.ask.showWith(this.language.translate('activity.ai.explainPagePrompt'));
  }
}
