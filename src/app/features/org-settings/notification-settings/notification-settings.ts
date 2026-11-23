import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { flattenScopedKey } from '../../../core/notifications/notification-text';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { eventLabelFromTemplate, scopeOfKey } from './event-label';
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
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
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
import { provideSharedScope } from '../../../core/i18n/shared-scope';
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

/** Tabs of the notifications page (`?tab=`). */
export const NOTIFICATION_TABS = ['rules', 'reminders', 'leads'] as const;
export type NotificationTab = (typeof NOTIFICATION_TABS)[number];

/**
 * `/settings/notifications` (org:manage), in three tabs: the rules (who hears
 * about each kind of activity, and how; by default only the kinds that notify
 * someone, with a switch for all), reminders and escalation, and department
 * leads. Every kind can be switched on, including those that by default only
 * appear on the timeline (e.g. "a new deviation is registered"). Kinds are named
 * from their notification text in the UI language; technical names are hidden
 * behind a switch.
 */
@Component({
  selector: 'app-notification-settings',
  imports: [
    TranslocoPipe,
    PageHeader,
    HelpStrip,
    WhyItMatters,
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
  viewProviders: [provideSharedScope('activity')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="activity.page.title"
        descriptionKey="activity.page.subtitle"
        [breadcrumbs]="[
          { labelKey: 'settings.hub.title', link: '/settings' },
          { labelKey: 'activity.page.title' },
        ]"
      >
        @if (aiAvailable() && orgId()) {
          <ng-container secondary>
            <app-button variant="secondary" data-testid="ai-suggest" (click)="suggestSetup()">
              <app-icon name="spark" [size]="15" />
              {{ 'activity.ai.suggest' | transloco }}
            </app-button>
          </ng-container>
        }
      </app-page-header>

      <app-help-strip scope="settings" page="notifications" lesson="reminders-and-escalation" />

      @if (!orgId()) {
        <app-card>
          <p class="px-2 py-8 text-center text-body text-fg-muted">
            {{ 'activity.page.noOrg' | transloco }}
          </p>
        </app-card>
      } @else {
        <div class="flex flex-col gap-6">
          <div
            role="tablist"
            class="flex gap-1 overflow-x-auto border-b border-border"
            [attr.aria-label]="'activity.page.tabs' | transloco"
          >
            @for (t of tabs; track t) {
              <button
                type="button"
                role="tab"
                [id]="'notif-tab-' + t"
                [attr.aria-selected]="tab() === t"
                [attr.aria-controls]="'notif-panel-' + t"
                [attr.tabindex]="tab() === t ? 0 : -1"
                [attr.data-testid]="'notif-tab-' + t"
                class="-mb-px min-h-10 border-b-2 px-3 py-2 text-ui font-semibold whitespace-nowrap"
                [class]="
                  tab() === t
                    ? 'border-accent text-fg'
                    : 'border-transparent text-fg-muted hover:text-fg'
                "
                (click)="selectTab(t)"
                (keydown.arrowRight)="cycleTab(1)"
                (keydown.arrowLeft)="cycleTab(-1)"
              >
                {{ 'activity.page.tab.' + t | transloco }}
              </button>
            }
          </div>

          @if (loading()) {
            <app-card>
              <p class="px-2 py-8 text-center text-body text-fg-muted" data-testid="loading">
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
            <div
              role="tabpanel"
              [id]="'notif-panel-' + tab()"
              [attr.aria-labelledby]="'notif-tab-' + tab()"
            >
              @switch (tab()) {
                @case ('reminders') {
                  <app-reminder-settings-form
                    [orgId]="orgId()!"
                    [settings]="settings()"
                    [roles]="roles()"
                    [roleName]="roleName"
                    (saved)="settings.set($event)"
                  />
                }
                @case ('leads') {
                  <app-department-leads
                    [orgId]="orgId()!"
                    [leads]="leads()"
                    [members]="members()"
                    (changed)="replaceLead($event)"
                  />
                }
                @default {
                  <section aria-labelledby="rules-title" data-testid="rules-section">
                    <h2 id="rules-title" class="sr-only">
                      {{ 'activity.rules.title' | transloco }}
                    </h2>
                    <p class="mb-3 text-ui text-fg-muted">
                      {{ 'activity.rules.subtitle' | transloco }}
                    </p>

                    <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
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
                        class="h-9 w-full rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent sm:w-64"
                      />
                      <label class="sr-only" for="rules-module">{{
                        'activity.rules.moduleFilter' | transloco
                      }}</label>
                      <select
                        id="rules-module"
                        data-testid="rules-module"
                        (change)="moduleFilter.set($any($event.target).value || null)"
                        class="h-9 rounded-tile border border-border bg-bg px-2.5 text-ui text-fg outline-none focus:border-accent"
                      >
                        <option value="">{{ 'activity.rules.allModules' | transloco }}</option>
                        @for (m of modules(); track m.module) {
                          <option [value]="m.module" [selected]="m.module === moduleFilter()">
                            {{ m.label }}
                          </option>
                        }
                      </select>
                      <div class="flex flex-wrap gap-x-4 gap-y-2 sm:ml-2">
                        <app-switch
                          [checked]="!notifyingOnly()"
                          (checkedChange)="notifyingOnly.set(!$event)"
                          data-testid="rules-show-all"
                        >
                          {{ 'activity.rules.showAll' | transloco: { count: rules().length } }}
                        </app-switch>
                        <app-switch
                          [checked]="customOnly()"
                          (checkedChange)="customOnly.set($event)"
                        >
                          {{ 'activity.rules.customOnly' | transloco }}
                        </app-switch>
                        <app-switch [checked]="technical()" (checkedChange)="technical.set($event)">
                          {{ 'activity.rules.technical' | transloco }}
                        </app-switch>
                      </div>
                    </div>
                    @if (notifyingOnly()) {
                      <p class="mb-3 text-meta text-fg-subtle" data-testid="rules-short-list">
                        {{
                          'activity.rules.shortList'
                            | transloco: { count: notifyingCount(), total: rules().length }
                        }}
                      </p>
                    }

                    @if (rules().length === 0) {
                      <app-card>
                        <div class="px-2 py-8 text-center" data-testid="rules-empty">
                          <p class="text-body font-semibold text-fg">
                            {{ 'activity.rules.emptyTitle' | transloco }}
                          </p>
                          <p class="mx-auto mt-1 max-w-md text-ui text-fg-muted">
                            {{ 'activity.rules.emptyBody' | transloco }}
                          </p>
                        </div>
                      </app-card>
                    } @else if (groups().length === 0) {
                      <app-card>
                        <div class="px-2 py-8 text-center" data-testid="rules-no-match">
                          <p class="text-ui text-fg-muted">
                            {{ 'activity.rules.noMatch' | transloco }}
                          </p>
                          <button
                            type="button"
                            (click)="clearFilters()"
                            class="mt-2 text-ui font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                          >
                            {{ 'activity.rules.clearFilters' | transloco }}
                          </button>
                        </div>
                      </app-card>
                    } @else {
                      <app-card [padded]="false">
                        @for (group of groups(); track group.module) {
                          <h3
                            class="border-b border-border bg-surface-2 px-4 py-1.5 text-micro font-semibold tracking-wide text-fg-muted uppercase"
                          >
                            {{ group.label }}
                          </h3>
                          <ul>
                            @for (rule of group.rules; track rule.event_kind) {
                              <li
                                class="grid grid-cols-1 gap-x-4 gap-y-1.5 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto] md:items-center"
                                data-testid="rule-row"
                              >
                                <div class="min-w-0">
                                  <span class="block font-semibold text-fg">{{
                                    kindName(rule.event_kind)
                                  }}</span>
                                  <span class="mt-0.5 block text-meta text-fg-subtle">
                                    {{ categoryName(rule.category) }}
                                    @if (technical()) {
                                      · <span class="font-mono">{{ rule.event_kind }}</span>
                                    }
                                  </span>
                                </div>
                                <div class="min-w-0 text-ui">
                                  @if (!rule.enabled) {
                                    <span class="text-fg-muted">{{
                                      (rule.notify
                                        ? 'activity.rules.nobodyOff'
                                        : 'activity.rules.timelineOnly'
                                      ) | transloco
                                    }}</span>
                                  } @else if (rule.recipients.length === 0) {
                                    <span class="text-fg-muted">{{
                                      'activity.rules.nobody' | transloco
                                    }}</span>
                                  } @else {
                                    <ul class="flex flex-wrap gap-1">
                                      @for (r of rule.recipients; track $index) {
                                        <li>
                                          <app-badge tone="neutral">{{
                                            recipientName(r)
                                          }}</app-badge>
                                        </li>
                                      }
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
                                </div>
                                <div>
                                  @if (!rule.enabled) {
                                    <app-badge tone="neutral">{{
                                      (rule.notify
                                        ? 'activity.rules.status.off'
                                        : 'activity.rules.status.timeline'
                                      ) | transloco
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
                                </div>
                                <div class="md:text-right">
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
                                    {{
                                      (rule.enabled
                                        ? 'activity.rules.edit'
                                        : 'activity.rules.turnOn'
                                      ) | transloco
                                    }}
                                  </app-button>
                                </div>
                              </li>
                            }
                          </ul>
                        }
                      </app-card>
                    }
                  </section>
                }
              }
            </div>
          }

          <app-why-it-matters scope="settings" page="notifications" />
        </div>

        <app-rule-editor
          [orgId]="orgId()!"
          [rule]="editing()"
          [roles]="roles()"
          [departments]="leads()"
          [members]="members()"
          [kindLabel]="editing() ? kindName(editing()!.event_kind) : ''"
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
  private readonly transloco = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly tabs = NOTIFICATION_TABS;
  protected readonly tab = signal<NotificationTab>(this.initialTab());
  /** Only kinds that notify someone (the short list); off = every kind. */
  protected readonly notifyingOnly = signal(true);
  protected readonly technical = signal(false);
  /** Scope files already requested for kind labels. */
  private readonly requestedScopes = new Set<string>();
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
    const rules = this.notifyingOnly() ? this.rules().filter((r) => r.enabled) : this.rules();
    return groupRules(filterRules(rules, filter, this.labelLookup), this.labelLookup);
  });
  protected readonly notifyingCount = computed(() => this.rules().filter((r) => r.enabled).length);

  protected readonly roleName = (role: OrgRole): string =>
    this.lookup(`roles.${role.key}.name`) ?? role.name;

  /** Incremented per load so a response for a previous org is dropped. */
  private generation = 0;

  /**
   * Like `lookup`, but `activity.kinds.<kind>` falls back to the kind's own
   * notification / timeline text, so the helpers sort and search by the label
   * the user sees.
   */
  private readonly labelLookup: Lookup = (key, params) => {
    const prefix = 'activity.kinds.';
    if (key.startsWith(prefix)) {
      const labels = this.kindLabels();
      const kind = key.slice(prefix.length);
      if (labels.has(kind)) return labels.get(kind) ?? null;
    }
    return this.lookup(key, params);
  };

  /**
   * The label of every rule's kind, worked out once per rules / language / scope
   * load, so sorting and filtering do not translate (and miss) the same keys
   * thousands of times.
   */
  private readonly kindLabels = computed(() => {
    const labels = new Map<string, string | null>();
    for (const rule of this.rules()) {
      const kind = rule.event_kind;
      if (labels.has(kind)) continue;
      labels.set(kind, this.lookup(`activity.kinds.${kind}`) ?? this.templateLabel(rule));
    }
    return labels;
  });

  constructor() {
    providePageContext(() => ({
      module: null,
      entityType: 'notification_rule',
      view: 'settings',
      title: this.language.translate('activity.page.title'),
    }));

    effect(() => {
      const orgId = this.orgId();
      untracked(() => this.load(orgId));
    });

    // Load the module translation files the kind labels come from.
    effect(() => {
      const lang = this.language.active();
      const scopes = new Set<string>();
      for (const rule of this.rules()) {
        for (const key of [rule.title_key, rule.timeline_key]) {
          const scope = scopeOfKey(key);
          if (scope) scopes.add(scope);
        }
      }
      untracked(() => {
        for (const scope of scopes) {
          const path = `${scope}/${lang}`;
          if (this.requestedScopes.has(path)) continue;
          this.requestedScopes.add(path);
          this.transloco.load(path).subscribe({ error: () => undefined });
        }
      });
    });
  }

  private initialTab(): NotificationTab {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    return (NOTIFICATION_TABS as readonly string[]).includes(tab ?? '')
      ? (tab as NotificationTab)
      : 'rules';
  }

  protected selectTab(tab: NotificationTab): void {
    this.tab.set(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'rules' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected cycleTab(step: number): void {
    const index = NOTIFICATION_TABS.indexOf(this.tab());
    const next =
      NOTIFICATION_TABS[(index + step + NOTIFICATION_TABS.length) % NOTIFICATION_TABS.length];
    this.selectTab(next);
    queueMicrotask(() => document.getElementById(`notif-tab-${next}`)?.focus());
  }

  /** The kind's notification (or timeline) text with placeholders removed. */
  private templateLabel(rule: NotificationRule): string | null {
    for (const key of [rule.title_key, rule.timeline_key]) {
      if (!key) continue;
      const flat = flattenScopedKey(key);
      // Tracks language changes and scope loads.
      const translated = this.language.translate(flat);
      if (translated === flat) continue;
      const raw = this.rawTranslation(flat) ?? translated;
      const label = eventLabelFromTemplate(raw);
      if (label) return label;
    }
    return null;
  }

  private rawTranslation(flat: string): string | null {
    const all = this.transloco.getTranslation(this.language.active()) as Record<string, unknown>;
    const direct = all[flat];
    if (typeof direct === 'string') return direct;
    let node: unknown = all;
    for (const part of flat.split('.')) {
      node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
    }
    return typeof node === 'string' ? node : null;
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
    return kindLabel(kind, this.labelLookup);
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
    this.notifyingOnly.set(false);
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
}
