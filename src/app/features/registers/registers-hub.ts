import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { ModuleService } from '../../core/modules/module.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { MAX_PINS } from '../../core/shell/shell-preferences.models';
import { ShellPreferencesService } from '../../core/shell/shell-preferences.service';
import { MODULE_NAV_ITEMS } from '../../layout/nav';
import {
  PIN_TARGETS,
  PinTarget,
  defaultPins,
  hasShellRoute,
  isAllowed,
  registerGroups,
} from '../../layout/nav-v2';
import { Card } from '../../shared/ui/card/card';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { Icon } from '../../shared/ui/icon/icon';
import { PageHeader } from '../../shared/ui/page-header/page-header';

/** One register row. */
interface RegisterRow {
  readonly key: string;
  readonly path: string;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly icon: string;
}

interface GroupView {
  readonly key: string;
  readonly labelKey: string;
  readonly rows: readonly RegisterRow[];
}

/**
 * Registre (U03): one list of every register the user can open, grouped by job
 * area (simplify-plan §3.1), with a filter box and "Fest i menyen" per row (at most
 * five pins, stored on the server per user and org). Each row opens today's list
 * route, so record URLs never move. Only enabled modules the user may read appear.
 */
@Component({
  selector: 'app-registers-hub',
  imports: [RouterLink, TranslocoPipe, Card, EmptyState, Icon, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[1180px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header
        titleKey="shell.registers.title"
        descriptionKey="shell.registers.description"
      />

      <div class="mb-5 max-w-[420px]">
        <label for="register-filter" class="sr-only">{{
          'shell.registers.filterLabel' | transloco
        }}</label>
        <div
          class="flex h-10 items-center gap-2 rounded-tile border border-border bg-surface px-3 focus-within:ring-2 focus-within:ring-accent"
        >
          <span class="flex text-fg-subtle"><app-icon name="search" [size]="16" /></span>
          <input
            id="register-filter"
            type="search"
            data-testid="register-filter"
            class="min-w-0 flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-subtle"
            [placeholder]="'shell.registers.filterPlaceholder' | transloco"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
          />
        </div>
      </div>

      @if (pinned().length > 0) {
        <section class="mb-6" aria-labelledby="registers-pinned" data-testid="registers-pinned">
          <h2
            id="registers-pinned"
            class="mb-2 text-micro font-bold tracking-[0.08em] text-fg-subtle uppercase"
          >
            {{
              'shell.registers.pinnedHeading' | transloco: { count: pinned().length, max: maxPins }
            }}
          </h2>
          <ul class="flex flex-wrap gap-2">
            @for (pin of pinned(); track pin.key) {
              <li
                class="flex items-center gap-1 rounded-full border border-accent-border bg-accent-soft py-0.5 pr-1 pl-3 text-ui font-semibold text-accent"
              >
                <a [routerLink]="'/' + pin.path" class="hover:underline">{{
                  pin.labelKey | transloco
                }}</a>
                <button
                  type="button"
                  class="flex h-7 w-7 items-center justify-center rounded-full hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-60"
                  [disabled]="!canEditPins()"
                  [attr.aria-label]="
                    'shell.registers.unpin' | transloco: { name: (pin.labelKey | transloco) }
                  "
                  [attr.data-testid]="'unpin-' + pin.key"
                  (click)="togglePin(pin.key)"
                >
                  <app-icon name="x" [size]="14" />
                </button>
              </li>
            }
          </ul>
        </section>
      }

      @if (groups().length === 0) {
        <app-empty-state
          icon="search"
          titleKey="shell.registers.emptyTitle"
          bodyKey="shell.registers.emptyBody"
        />
      } @else {
        <div class="grid gap-4 md:grid-cols-2">
          @for (group of groups(); track group.key) {
            <section
              [attr.aria-labelledby]="'group-' + group.key"
              [attr.data-testid]="'register-group-' + group.key"
            >
              <app-card [padded]="false">
                <h2
                  [id]="'group-' + group.key"
                  class="border-b border-border px-4 pt-3.5 pb-2.5 font-display text-section font-bold tracking-[-0.02em] text-fg"
                >
                  {{ group.labelKey | transloco }}
                </h2>
                <ul class="divide-y divide-border">
                  @for (row of group.rows; track row.key) {
                    @let pinnedRow = isPinned(row.key);
                    <li class="flex items-center gap-2 px-2 py-1.5">
                      <a
                        [routerLink]="'/' + row.path"
                        [attr.data-testid]="'register-' + row.key"
                        class="flex min-w-0 flex-1 items-start gap-3 rounded-tile px-2 py-2 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                      >
                        <span class="flex pt-0.5 text-fg-subtle"
                          ><app-icon [name]="row.icon" [size]="18"
                        /></span>
                        <span class="min-w-0">
                          <span class="block text-ui font-semibold text-fg">{{
                            row.labelKey | transloco
                          }}</span>
                          <span class="block text-meta text-fg-muted">{{
                            row.descriptionKey | transloco
                          }}</span>
                        </span>
                      </a>
                      <button
                        type="button"
                        class="flex h-9 w-9 flex-none items-center justify-center rounded-tile hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-40"
                        [class]="pinnedRow ? 'text-accent' : 'text-fg-subtle'"
                        [attr.aria-pressed]="pinnedRow"
                        [attr.aria-label]="
                          (pinnedRow ? 'shell.registers.unpin' : 'shell.registers.pin')
                            | transloco: { name: (row.labelKey | transloco) }
                        "
                        [title]="
                          (pinnedRow
                            ? 'shell.registers.unpin'
                            : pinsFull()
                              ? 'shell.registers.pinsFull'
                              : 'shell.registers.pin'
                          ) | transloco: { name: (row.labelKey | transloco), max: maxPins }
                        "
                        [disabled]="!canEditPins() || (!pinnedRow && pinsFull())"
                        [attr.data-testid]="'pin-' + row.key"
                        (click)="togglePin(row.key)"
                      >
                        <app-icon name="pin" [size]="17" />
                      </button>
                    </li>
                  }
                </ul>
              </app-card>
            </section>
          }
        </div>
      }
    </div>
  `,
})
export class RegistersHub {
  private readonly modules = inject(ModuleService);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly prefs = inject(ShellPreferencesService);
  private readonly language = inject(LanguageService);
  private readonly hasLibrary = hasShellRoute(inject(Router).config, 'library');

  protected readonly maxPins = MAX_PINS;
  protected readonly query = signal('');

  private readonly granted = computed(() => this.selectedOrg.currentOrg()?.permissions);
  private readonly roles = computed(() => this.selectedOrg.currentOrg()?.roles ?? []);

  private allowed(entry: Pick<PinTarget, 'module' | 'permission'>): boolean {
    return isAllowed(entry, this.granted(), (m) => this.modules.isEnabled(m));
  }

  /** Every group with the registers this user may open, filtered by the query. */
  protected readonly groups = computed<readonly GroupView[]>(() => {
    const query = this.query().trim().toLocaleLowerCase();
    const matches = (row: RegisterRow): boolean =>
      !query ||
      this.language.translate(row.labelKey).toLocaleLowerCase().includes(query) ||
      this.language.translate(row.descriptionKey).toLocaleLowerCase().includes(query);
    return registerGroups(this.hasLibrary)
      .map((group) => ({
        key: group.key,
        labelKey: group.labelKey,
        rows: group.modules
          .map((key) => MODULE_NAV_ITEMS.find((item) => item.module === key))
          .filter((item) => !!item && this.allowed(item))
          .map((item) => ({
            key: item!.path,
            path: item!.path,
            labelKey: item!.labelKey,
            descriptionKey: `modules.descriptions.${item!.module}`,
            icon: item!.icon,
          }))
          .filter(matches),
      }))
      .filter((group) => group.rows.length > 0);
  });

  /** Effective pin keys: the user's own, else the role defaults. */
  private readonly pinKeys = computed(() => this.prefs.pins() ?? defaultPins(this.roles()));

  protected readonly pinned = computed(() =>
    this.pinKeys().flatMap((key) => {
      const target = PIN_TARGETS.get(key);
      return target && this.allowed(target) ? [target] : [];
    }),
  );

  protected readonly pinsFull = computed(() => this.pinKeys().length >= MAX_PINS);
  protected readonly canEditPins = computed(() => this.prefs.loaded() && !this.prefs.saving());

  protected isPinned(key: string): boolean {
    return this.pinKeys().includes(key);
  }

  protected togglePin(key: string): void {
    const keys = this.pinKeys();
    if (keys.includes(key)) {
      this.prefs.setPins(keys.filter((k) => k !== key));
    } else if (keys.length < MAX_PINS) {
      this.prefs.setPins([...keys, key]);
    }
  }
}
