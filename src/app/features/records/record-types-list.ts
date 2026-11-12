import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { hasAnyPermission } from '../../core/auth/permission';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { localize } from '../../core/records/localized';
import {
  RecordTemplate,
  RecordType,
  Workflow,
  WorkflowAiDraft,
} from '../../core/records/record.models';
import { recordsErrorMessage } from '../../core/records/records-errors';
import { RecordsApi } from '../../core/records/records-api';
import { RelativeTimePipe } from '../../shared/relative-time/relative-time';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { AskPanelService } from '../ask/ask-panel.service';
import { MODULE_KEYS, moduleLabelKey } from './designer-model';
import { AiDraftPanel } from './designer/ai-draft-panel';
import { RecordDraftStore } from './draft-store';
import {
  RecordsGuideIntro,
  RecordsLesson,
  RecordsTeachingEmpty,
  RecordsWhy,
} from './guidance/records-guidance';
import { providePageContext } from './page-context';

export type ListTab = 'types' | 'workflows' | 'templates';
export type ListSort = 'name' | 'updated';

/** Search, module filter and sort shared by the record type and workflow lists. */
export function filterAndSort<
  T extends { name: string; key: string; module: string; updated_at: string },
>(items: readonly T[], opts: { search: string; module: string; sort: ListSort }): T[] {
  const q = opts.search.trim().toLowerCase();
  return items
    .filter((item) => !opts.module || item.module === opts.module)
    .filter(
      (item) => !q || item.name.toLowerCase().includes(q) || item.key.toLowerCase().includes(q),
    )
    .sort((a, b) =>
      opts.sort === 'updated'
        ? b.updated_at.localeCompare(a.updated_at)
        : a.name.localeCompare(b.name),
    );
}

/**
 * `/settings/record-types`: the org's configurable record types, workflows and
 * built-in templates, with search, a module filter and sorting. Designers
 * (`records:admin`) can create types and workflows, install templates and
 * describe a process for the assistant to draft; readers see everything
 * read-only.
 */
@Component({
  selector: 'app-record-types-list',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    RelativeTimePipe,
    Badge,
    Button,
    Card,
    FormField,
    Icon,
    AiDraftPanel,
    RecordsGuideIntro,
    RecordsWhy,
    RecordsLesson,
    RecordsTeachingEmpty,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
      <a
        routerLink="/settings"
        class="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        <app-icon name="back" [size]="16" />
        {{ 'records.backToSettings' | transloco }}
      </a>

      <div class="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ 'records.list.title' | transloco }}
          </h1>
          <p class="mt-1.5 text-[14px] text-fg-muted">{{ 'records.list.subtitle' | transloco }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <app-button variant="ghost" size="sm" (click)="explain()">
            <app-icon name="spark" [size]="15" />
            {{ 'records.list.explain' | transloco }}
          </app-button>
          <app-records-lesson lesson="workflows-101" />
        </div>
      </div>

      <div class="mb-5 grid gap-4 lg:grid-cols-[1fr_320px]">
        <app-records-guide-intro page="list" />
        <app-records-why page="list" />
      </div>

      @if (canAdmin()) {
        <div class="mb-5 flex flex-wrap gap-2" data-testid="records-actions">
          <a routerLink="/settings/record-types/new">
            <app-button>
              <app-icon name="plus" [size]="15" />
              {{ 'records.list.newType' | transloco }}
            </app-button>
          </a>
          <a routerLink="/settings/record-types/workflows/new">
            <app-button variant="secondary">
              <app-icon name="plus" [size]="15" />
              {{ 'records.list.newWorkflow' | transloco }}
            </app-button>
          </a>
          <app-button variant="secondary" (click)="aiOpen.set(true)">
            <app-icon name="spark" [size]="15" />
            {{ 'records.list.describe' | transloco }}
          </app-button>
        </div>
      }

      <div
        role="tablist"
        class="mb-4 flex gap-1 border-b border-border"
        [attr.aria-label]="'records.list.tabs' | transloco"
      >
        @for (t of tabs(); track t) {
          <button
            type="button"
            role="tab"
            [id]="'records-tab-' + t"
            [attr.aria-selected]="tab() === t"
            [attr.aria-controls]="'records-panel-' + t"
            [attr.tabindex]="tab() === t ? 0 : -1"
            class="-mb-px border-b-2 px-3 py-2 text-[13.5px] font-semibold"
            [class]="
              tab() === t
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:text-fg'
            "
            (click)="selectTab(t)"
            (keydown.arrowRight)="cycleTab(1)"
            (keydown.arrowLeft)="cycleTab(-1)"
          >
            {{ 'records.list.tab.' + t | transloco }}
          </button>
        }
      </div>

      <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px_170px]">
        <app-form-field [label]="'records.list.search' | transloco" inputId="records-search">
          <input
            id="records-search"
            type="search"
            autocomplete="off"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
            [placeholder]="'records.list.searchPlaceholder' | transloco"
          />
        </app-form-field>
        <app-form-field [label]="'records.list.module' | transloco" inputId="records-module">
          <select id="records-module" [ngModel]="module()" (ngModelChange)="setModule($event)">
            <option value="">{{ 'records.list.allModules' | transloco }}</option>
            @for (key of modules; track key) {
              <option [value]="key">{{ moduleLabel(key) | transloco }}</option>
            }
          </select>
        </app-form-field>
        @if (tab() !== 'templates') {
          <app-form-field [label]="'records.list.sort' | transloco" inputId="records-sort">
            <select id="records-sort" [ngModel]="sort()" (ngModelChange)="sort.set($event)">
              <option value="name">{{ 'records.list.sortName' | transloco }}</option>
              <option value="updated">{{ 'records.list.sortUpdated' | transloco }}</option>
            </select>
          </app-form-field>
        }
      </div>

      <div
        role="tabpanel"
        [id]="'records-panel-' + tab()"
        [attr.aria-labelledby]="'records-tab-' + tab()"
      >
        @if (tab() === 'types') {
          <label class="mb-3 flex items-center gap-2 text-[13px] text-fg-muted">
            <input
              type="checkbox"
              class="h-4 w-4 accent-[var(--accent)]"
              [ngModel]="showInactive()"
              (ngModelChange)="showInactive.set($event)"
            />
            {{ 'records.list.showInactive' | transloco }}
          </label>
          <app-card [padded]="false">
            @if (loading()) {
              <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
                {{ 'common.loading' | transloco }}
              </p>
            } @else if (visibleTypes().length === 0) {
              @if (types().length === 0) {
                <app-records-teaching-empty
                  page="list"
                  [showAction]="canAdmin()"
                  (action)="selectTab('templates')"
                />
              } @else {
                <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
                  {{ 'records.list.noMatch' | transloco }}
                </p>
              }
            } @else {
              <ul>
                @for (type of visibleTypes(); track type.id) {
                  <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                    <a
                      [routerLink]="['/settings/record-types', type.id]"
                      class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
                    >
                      <span class="w-[72px] flex-none font-mono text-[12px] text-fg-subtle">{{
                        type.code_prefix ?? '—'
                      }}</span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-semibold text-fg">{{ type.name }}</span>
                        <span class="block truncate font-mono text-[12px] text-fg-subtle">{{
                          type.key
                        }}</span>
                      </span>
                      <app-badge tone="neutral">{{
                        moduleLabel(type.module) | transloco
                      }}</app-badge>
                      <span class="text-[12.5px] text-fg-muted">
                        @if (type.current_version; as v) {
                          {{
                            'records.list.typeMeta'
                              | transloco: { version: v.version, count: v.fields.length }
                          }}
                        } @else {
                          {{ 'records.list.unpublished' | transloco }}
                        }
                      </span>
                      @if (!type.current_version?.workflow_version_id) {
                        <app-badge tone="warn">{{
                          'records.list.noWorkflow' | transloco
                        }}</app-badge>
                      }
                      <app-badge [tone]="type.is_active ? 'pass' : 'neutral'">
                        {{
                          (type.is_active ? 'records.list.active' : 'records.list.inactive')
                            | transloco
                        }}
                      </app-badge>
                    </a>
                  </li>
                }
              </ul>
            }
          </app-card>
        }

        @if (tab() === 'workflows') {
          <app-card [padded]="false">
            @if (loading()) {
              <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
                {{ 'common.loading' | transloco }}
              </p>
            } @else if (visibleWorkflows().length === 0) {
              @if (workflows().length === 0) {
                <app-records-teaching-empty
                  page="workflows"
                  [showAction]="canAdmin()"
                  (action)="newWorkflow()"
                />
              } @else {
                <p class="px-4 py-10 text-center text-[14px] text-fg-muted">
                  {{ 'records.list.noMatch' | transloco }}
                </p>
              }
            } @else {
              <ul>
                @for (wf of visibleWorkflows(); track wf.id) {
                  <li class="border-b border-border last:border-b-0 hover:bg-surface-2">
                    <a
                      [routerLink]="['/settings/record-types/workflows', wf.id]"
                      class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
                    >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-semibold text-fg">{{ wf.name }}</span>
                        <span class="block truncate font-mono text-[12px] text-fg-subtle">{{
                          wf.key
                        }}</span>
                      </span>
                      <app-badge tone="neutral">{{ moduleLabel(wf.module) | transloco }}</app-badge>
                      <span class="text-[12.5px] text-fg-muted">
                        @if (wf.current_version; as v) {
                          {{
                            'records.list.workflowMeta'
                              | transloco
                                : {
                                    version: v.version,
                                    states: v.definition.states.length,
                                    transitions: v.definition.transitions.length,
                                  }
                          }}
                        } @else {
                          {{ 'records.list.unpublished' | transloco }}
                        }
                      </span>
                      <span class="text-[12px] text-fg-subtle">
                        {{
                          'records.list.updated'
                            | transloco: { when: wf.updated_at | relativeTime: lang() }
                        }}
                      </span>
                    </a>
                  </li>
                }
              </ul>
            }
          </app-card>
        }

        @if (tab() === 'templates') {
          @if (templates().length === 0 && !loading()) {
            <app-card>
              <p class="px-2 py-8 text-center text-[14px] text-fg-muted">
                {{ 'records.templates.empty' | transloco }}
              </p>
            </app-card>
          }
          <ul class="grid grid-cols-1 gap-3 md:grid-cols-2">
            @for (tpl of visibleTemplates(); track tpl.key) {
              <li>
                <app-card>
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <h3 class="font-display text-[15px] font-bold text-fg">
                        {{ text(tpl.name) }}
                      </h3>
                      <p class="mt-0.5 text-[12px] text-fg-subtle">
                        {{ moduleLabel(tpl.module) | transloco }}
                        ·
                        {{
                          'records.templates.meta'
                            | transloco
                              : {
                                  fields: tpl.field_count,
                                  states: tpl.state_count,
                                  transitions: tpl.transition_count,
                                }
                        }}
                      </p>
                    </div>
                    @if (tpl.installed) {
                      <app-badge tone="pass">{{
                        'records.templates.installed' | transloco
                      }}</app-badge>
                    }
                  </div>
                  <p class="mt-2 text-[13px] leading-relaxed text-fg-muted">
                    {{ text(tpl.description) }}
                  </p>
                  @if (!tpl.installed) {
                    <div class="mt-3">
                      <app-button
                        size="sm"
                        [loading]="installing() === tpl.key"
                        [disabled]="installing() !== null"
                        (click)="install(tpl)"
                      >
                        {{ 'records.templates.install' | transloco }}
                      </app-button>
                    </div>
                  }
                </app-card>
              </li>
            }
          </ul>
        }
      </div>
    </div>

    @if (canAdmin()) {
      <app-ai-draft-panel
        [open]="aiOpen()"
        [initialModule]="module() || 'deviations'"
        (closed)="aiOpen.set(false)"
        (use)="useDraft($event)"
      />
    }
  `,
})
export class RecordTypesList {
  private readonly api = inject(RecordsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly drafts = inject(RecordDraftStore);
  private readonly ask = inject(AskPanelService);
  private readonly transloco = inject(TranslocoService);

  protected readonly lang = inject(LanguageService).active;
  protected readonly modules = MODULE_KEYS;

  protected readonly tab = signal<ListTab>('types');
  protected readonly search = signal('');
  protected readonly module = signal('');
  protected readonly sort = signal<ListSort>('name');
  protected readonly showInactive = signal(true);
  protected readonly loading = signal(false);
  protected readonly aiOpen = signal(false);
  protected readonly installing = signal<string | null>(null);

  protected readonly types = signal<readonly RecordType[]>([]);
  protected readonly workflows = signal<readonly Workflow[]>([]);
  protected readonly templates = signal<readonly RecordTemplate[]>([]);

  protected readonly canAdmin = computed(() =>
    hasAnyPermission(this.selectedOrg.currentOrg()?.permissions, 'records:admin'),
  );
  /** Templates are a design-time (`records:admin`) surface. */
  protected readonly tabs = computed<ListTab[]>(() =>
    this.canAdmin() ? ['types', 'workflows', 'templates'] : ['types', 'workflows'],
  );

  protected readonly visibleTypes = computed(() =>
    filterAndSort(
      this.types().filter((t) => this.showInactive() || t.is_active),
      { search: this.search(), module: this.module(), sort: this.sort() },
    ),
  );
  protected readonly visibleWorkflows = computed(() =>
    filterAndSort(this.workflows(), {
      search: this.search(),
      module: this.module(),
      sort: this.sort(),
    }),
  );
  protected readonly visibleTemplates = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.templates()
      .filter((t) => !this.module() || t.module === this.module())
      .filter((t) => !q || this.text(t.name).toLowerCase().includes(q) || t.key.includes(q));
  });

  constructor() {
    providePageContext(() => ({
      module: 'records',
      view: 'list',
      title: this.transloco.translate('records.list.title'),
    }));

    const initialTab = this.route.snapshot.queryParamMap.get('tab');
    if (initialTab === 'workflows' || initialTab === 'templates') {
      this.tab.set(initialTab);
    }

    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const admin = this.canAdmin();
      untracked(() => this.load(orgId, admin));
    });
  }

  protected moduleLabel(key: string): string {
    return moduleLabelKey(key);
  }

  protected text(value: Readonly<Record<string, string>>): string {
    return localize(value, this.lang());
  }

  protected selectTab(tab: ListTab): void {
    this.tab.set(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'types' ? null : tab },
      replaceUrl: true,
    });
  }

  protected cycleTab(delta: 1 | -1): void {
    const tabs = this.tabs();
    const next = tabs[(tabs.indexOf(this.tab()) + delta + tabs.length) % tabs.length];
    this.selectTab(next);
    globalThis.document?.getElementById(`records-tab-${next}`)?.focus();
  }

  protected setModule(module: string): void {
    this.module.set(module);
  }

  protected newWorkflow(): void {
    void this.router.navigate(['/settings/record-types/workflows/new']);
  }

  protected explain(): void {
    this.ask.showWith(this.transloco.translate('records.list.explainPrompt'));
  }

  protected useDraft(event: { module: string; draft: WorkflowAiDraft }): void {
    this.drafts.put(event);
    this.aiOpen.set(false);
    void this.router.navigate(['/settings/record-types/new'], { queryParams: { draft: 1 } });
  }

  protected install(template: RecordTemplate): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.installing()) {
      return;
    }
    this.installing.set(template.key);
    this.api
      .installTemplate(orgId, template.key, { lang: this.lang() === 'nb' ? 'nb' : 'en' })
      .subscribe({
        next: (res) => {
          this.installing.set(null);
          this.notifications.success('records.templates.installedToast', {
            name: res.record_type.name,
          });
          void this.router.navigate(['/settings/record-types', res.record_type.id]);
        },
        error: (error: unknown) => {
          this.installing.set(null);
          const message = recordsErrorMessage(error);
          if (message) {
            this.notifications.error(message.key, message.params);
          }
        },
      });
  }

  private load(orgId: string | null, admin: boolean): void {
    this.types.set([]);
    this.workflows.set([]);
    this.templates.set([]);
    if (!orgId) {
      return;
    }
    this.loading.set(true);
    let pending = admin ? 3 : 2;
    const done = () => {
      pending -= 1;
      if (pending === 0) {
        this.loading.set(false);
      }
    };
    this.api.listRecordTypes(orgId).subscribe({
      next: (types) => {
        this.types.set(types);
        done();
      },
      error: done,
    });
    this.api.listWorkflows(orgId).subscribe({
      next: (workflows) => {
        this.workflows.set(workflows);
        done();
      },
      error: done,
    });
    if (admin) {
      this.api.listTemplates(orgId).subscribe({
        next: (templates) => {
          this.templates.set(templates);
          done();
        },
        error: done,
      });
    }
  }
}
