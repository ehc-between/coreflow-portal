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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { ModuleService } from '../../../core/modules/module.service';
import { FRAMEWORK_KEYS, OrgModule } from '../../../core/modules/module.models';
import { ModulesApi, moduleErrorDetail } from '../../../core/modules/modules-api';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { Switch } from '../../../shared/ui/switch/switch';
import { AskPanelService } from '../../ask/ask-panel.service';
import { GUIDE_CLAUSES, frameworkShortKey } from '../frameworks';
import { ModulesGuide } from '../guide/modules-guide';
import { ModulesLesson } from '../guide/modules-lesson';
import { moduleDescriptionKey, moduleNameKey, moduleNameList } from '../module-names';

export type ModuleStatusFilter = 'all' | 'enabled' | 'disabled';

/** Filters the module list by status, framework and a free-text query (on the translated texts). */
export function filterModules(
  modules: readonly OrgModule[],
  options: {
    readonly status: ModuleStatusFilter;
    readonly framework: string;
    readonly query: string;
    readonly text: (module: OrgModule) => string;
  },
): OrgModule[] {
  const q = options.query.trim().toLocaleLowerCase();
  return modules.filter(
    (m) =>
      (options.status === 'all' || (options.status === 'enabled') === m.enabled) &&
      (!options.framework || m.frameworks.includes(options.framework)) &&
      (!q || options.text(m).toLocaleLowerCase().includes(q)),
  );
}

/**
 * Settings → Modules (`org:manage`): every module of the platform as a card
 * with an on/off switch, its frameworks and dependency hints. Turning a module
 * off asks first (data is kept; members lose access until it's back on). The
 * backend owns the dependency rules; its 409s are explained in place. Changes
 * reload the shared {@link ModuleService}, so the nav follows immediately.
 */
@Component({
  selector: 'app-modules-settings',
  imports: [
    RouterLink,
    TranslocoPipe,
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    Switch,
    ModulesGuide,
    ModulesLesson,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1080px] px-4 pt-7 pb-12 sm:px-8">
      <nav class="mb-2 text-[13px]" [attr.aria-label]="'modules.common.breadcrumb' | transloco">
        <a routerLink="/settings" class="font-semibold text-accent hover:underline">
          {{ 'nav.settings' | transloco }}
        </a>
      </nav>
      <div class="mb-[18px] flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-display text-[26px] font-bold tracking-[-0.025em] text-fg">
            {{ 'modules.settings.title' | transloco }}
          </h1>
          <p class="mt-1.5 text-[14px] text-fg-muted">
            {{ 'modules.settings.subtitle' | transloco }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <app-button variant="secondary" size="sm" (click)="askFit()">
            <app-icon name="spark" [size]="15" />
            {{ 'modules.settings.askFit' | transloco }}
          </app-button>
          <a
            routerLink="/setup"
            class="inline-flex h-8 items-center gap-2 rounded-tile border border-border bg-surface px-3 text-[13px] font-semibold text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <app-icon name="sliders" [size]="15" />
            {{ 'modules.settings.runWizard' | transloco }}
          </a>
        </div>
      </div>

      <app-modules-guide class="mb-5 block" page="modules" [steps]="3" [clauses]="clauses" />

      @if (!orgId()) {
        <app-card>
          <p class="py-8 text-center text-[14px] text-fg-muted">
            {{ 'modules.common.noOrg' | transloco }}
          </p>
        </app-card>
      } @else {
        <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end" role="search">
          <label class="flex flex-1 flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
            {{ 'modules.settings.search' | transloco }}
            <input
              type="search"
              class="h-9 rounded-[10px] border border-border bg-bg px-3 text-[13.5px] font-normal text-fg outline-none focus:border-accent"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
              [placeholder]="'modules.settings.searchPlaceholder' | transloco"
            />
          </label>
          <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
            {{ 'modules.settings.statusFilter' | transloco }}
            <select
              class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13.5px] font-normal text-fg outline-none focus:border-accent"
              [value]="status()"
              (change)="status.set($any($event.target).value)"
            >
              @for (option of statusOptions; track option) {
                <option [value]="option">
                  {{ 'modules.settings.status.' + option | transloco }}
                </option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
            {{ 'modules.settings.frameworkFilter' | transloco }}
            <select
              class="h-9 rounded-[10px] border border-border bg-bg px-2 text-[13.5px] font-normal text-fg outline-none focus:border-accent"
              [value]="framework()"
              (change)="framework.set($any($event.target).value)"
            >
              <option value="">{{ 'modules.settings.allFrameworks' | transloco }}</option>
              @for (fw of frameworks; track fw) {
                <option [value]="fw">{{ frameworkShortKey(fw) | transloco }}</option>
              }
            </select>
          </label>
        </div>

        @if (error(); as message) {
          <app-alert class="mb-4 block">{{ message }}</app-alert>
        }

        @if (loading()) {
          <app-card>
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'common.loading' | transloco }}
            </p>
          </app-card>
        } @else if (loadFailed()) {
          <app-card>
            <div class="flex flex-col items-center gap-3 py-10 text-center">
              <p class="text-[14px] text-fg-muted">{{ 'modules.common.loadFailed' | transloco }}</p>
              <app-button size="sm" variant="secondary" (click)="load()">
                {{ 'modules.common.retry' | transloco }}
              </app-button>
            </div>
          </app-card>
        } @else if (modules().length === 0) {
          <app-card>
            <div class="flex flex-col items-center gap-2 py-10 text-center">
              <p class="text-[15px] font-bold text-fg">
                {{ 'modules.settings.empty.title' | transloco }}
              </p>
              <p class="max-w-md text-[13.5px] text-fg-muted">
                {{ 'modules.settings.empty.body' | transloco }}
              </p>
            </div>
          </app-card>
        } @else {
          <p class="mb-2 text-[13px] text-fg-muted" role="status">
            {{
              'modules.settings.count'
                | transloco
                  : { shown: visible().length, enabled: enabledCount(), total: modules().length }
            }}
          </p>
          @if (visible().length === 0) {
            <app-card>
              <p class="py-8 text-center text-[14px] text-fg-muted">
                {{ 'modules.settings.noMatches' | transloco }}
              </p>
            </app-card>
          } @else {
            <ul class="grid gap-3 md:grid-cols-2" data-testid="module-list">
              @for (m of visible(); track m.key) {
                <li
                  class="flex flex-col gap-2.5 rounded-card border bg-surface p-4 shadow-card"
                  [class]="m.enabled ? 'border-accent-border' : 'border-border'"
                  [attr.data-module]="m.key"
                >
                  <div class="flex items-start gap-3">
                    <div class="min-w-0 flex-1">
                      <h2 class="text-[15px] font-bold text-fg" [id]="'module-' + m.key">
                        {{ nameKey(m) | transloco }}
                      </h2>
                      <p class="mt-0.5 text-[13px] text-fg-muted">
                        {{ descriptionKey(m) | transloco }}
                      </p>
                    </div>
                    @if (m.always_on) {
                      <app-badge tone="accent">{{
                        'modules.settings.alwaysOn' | transloco
                      }}</app-badge>
                    } @else {
                      <div class="w-auto flex-none" [attr.aria-describedby]="'module-' + m.key">
                        <app-switch
                          [checked]="m.enabled"
                          [class.pointer-events-none]="saving() === m.key"
                          [class.opacity-60]="saving() === m.key"
                          (checkedChange)="request(m, $event)"
                        >
                          <span class="sr-only">{{ nameKey(m) | transloco }}</span>
                          {{
                            (m.enabled ? 'modules.settings.on' : 'modules.settings.off') | transloco
                          }}
                        </app-switch>
                      </div>
                    }
                  </div>

                  @if (m.frameworks.length) {
                    <div class="flex flex-wrap gap-1">
                      @for (fw of m.frameworks; track fw) {
                        <app-badge>{{ frameworkShortKey(fw) | transloco }}</app-badge>
                      }
                    </div>
                  }
                  @if (m.depends_on.length) {
                    <p class="text-[12.5px] text-fg-subtle">
                      {{
                        'modules.settings.dependsOn' | transloco: { modules: names(m.depends_on) }
                      }}
                    </p>
                  }
                  @if (m.required_by.length) {
                    <p class="text-[12.5px] text-fg-subtle">
                      {{
                        'modules.settings.requiredBy' | transloco: { modules: names(m.required_by) }
                      }}
                    </p>
                  }
                  @if (m.enabled && m.portal_path) {
                    <a
                      [routerLink]="['/', m.portal_path]"
                      class="self-start text-[13px] font-semibold text-accent hover:underline"
                    >
                      {{ 'modules.settings.open' | transloco }}
                    </a>
                  }
                </li>
              }
            </ul>
          }
        }

        <app-modules-lesson class="mt-6 block" />
      }

      <app-confirm-dialog
        [open]="pendingDisable() !== null"
        [title]="'modules.settings.disableTitle' | transloco: { module: pendingName() }"
        [message]="'modules.settings.disableBody' | transloco: { module: pendingName() }"
        [confirmLabel]="'modules.settings.disableConfirm' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        [busy]="saving() !== null"
        confirmVariant="danger"
        (confirmed)="confirmDisable()"
        (cancelled)="pendingDisable.set(null)"
      />
    </div>
  `,
})
export class ModulesSettings {
  private readonly api = inject(ModulesApi);
  private readonly moduleService = inject(ModuleService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly ask = inject(AskPanelService);
  private readonly lang = inject(LanguageService).active;

  protected readonly clauses = GUIDE_CLAUSES.modules;
  protected readonly frameworks = FRAMEWORK_KEYS;
  protected readonly statusOptions: readonly ModuleStatusFilter[] = ['all', 'enabled', 'disabled'];
  protected readonly frameworkShortKey = frameworkShortKey;

  protected readonly orgId = this.selectedOrg.currentOrgId;
  protected readonly modules = signal<readonly OrgModule[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly pendingDisable = signal<OrgModule | null>(null);

  protected readonly query = signal('');
  protected readonly status = signal<ModuleStatusFilter>('all');
  protected readonly framework = signal('');

  protected readonly visible = computed(() => {
    this.lang();
    return filterModules(this.modules(), {
      status: this.status(),
      framework: this.framework(),
      query: this.query(),
      text: (m) =>
        `${this.transloco.translate(moduleNameKey(m.key))} ${this.transloco.translate(moduleDescriptionKey(m.key))} ${m.key}`,
    });
  });
  protected readonly enabledCount = computed(() => this.modules().filter((m) => m.enabled).length);
  protected readonly pendingName = computed(() => {
    const m = this.pendingDisable();
    return m ? this.names([m.key]) : '';
  });

  constructor() {
    effect(() => {
      const orgId = this.orgId();
      untracked(() => {
        this.modules.set([]);
        this.error.set(null);
        if (orgId) {
          this.load();
        }
      });
    });
  }

  protected nameKey(m: OrgModule): string {
    return m.name_key || moduleNameKey(m.key);
  }

  protected descriptionKey(m: OrgModule): string {
    return m.description_key || moduleDescriptionKey(m.key);
  }

  protected names(keys: readonly string[]): string {
    return moduleNameList(this.transloco, keys);
  }

  load(): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.loading.set(true);
    this.loadFailed.set(false);
    this.api.list(orgId).subscribe({
      next: (modules) => {
        if (this.orgId() === orgId) {
          this.modules.set(modules);
          this.loading.set(false);
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  /** Switch flipped: turning on applies directly, turning off asks first. */
  protected request(m: OrgModule, enabled: boolean): void {
    if (this.saving()) {
      return;
    }
    if (enabled) {
      this.apply(m, true);
    } else {
      this.pendingDisable.set(m);
    }
  }

  protected confirmDisable(): void {
    const m = this.pendingDisable();
    if (m) {
      this.apply(m, false);
    }
  }

  protected askFit(): void {
    const enabled = this.modules()
      .filter((m) => m.enabled)
      .map((m) => m.key);
    this.ask.showWith(
      this.transloco.translate('modules.settings.askFitPrompt', {
        modules: enabled.length ? this.names(enabled) : '-',
      }),
    );
  }

  private apply(m: OrgModule, enabled: boolean): void {
    const orgId = this.orgId();
    if (!orgId) {
      return;
    }
    this.saving.set(m.key);
    this.error.set(null);
    this.api.setEnabled(orgId, m.key, enabled).subscribe({
      next: () => {
        this.saving.set(null);
        this.pendingDisable.set(null);
        this.notifications.success(
          enabled ? 'modules.settings.enabledToast' : 'modules.settings.disabledToast',
        );
        this.load();
        this.moduleService.reload();
      },
      error: (err: unknown) => {
        this.saving.set(null);
        this.pendingDisable.set(null);
        this.error.set(this.errorMessage(err));
      },
    });
  }

  private errorMessage(err: unknown): string {
    const detail = moduleErrorDetail(err);
    switch (detail?.code) {
      case 'module_dependency_disabled':
        return this.transloco.translate('modules.settings.errors.dependencyDisabled', {
          module: this.names([detail.module]),
          modules: this.names(detail.missing),
        });
      case 'module_required_by':
        return this.transloco.translate('modules.settings.errors.requiredBy', {
          module: this.names([detail.module]),
          modules: this.names(detail.modules),
        });
      case 'module_always_on':
        return this.transloco.translate('modules.settings.errors.alwaysOn', {
          module: this.names([detail.module]),
        });
      case 'unknown_module':
        return this.transloco.translate('modules.settings.errors.unknown');
      default:
        return this.transloco.translate('modules.common.saveFailed');
    }
  }
}
