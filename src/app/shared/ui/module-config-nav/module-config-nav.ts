import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { moduleConfigArea, moduleConfigLink } from '../../../core/modules/module-config';
import { Icon } from '../icon/icon';
import { ModuleNav, ModuleNavItem } from '../module-nav/module-nav';

/** The tabs between a module's configuration pages (only when it has more than one). */
export function moduleConfigNavItems(module: string): ModuleNavItem[] {
  const area = moduleConfigArea(module);
  if (!area || area.pages.length < 2) return [];
  return area.pages.map((page) => ({
    labelKey: page.labelKey,
    link: moduleConfigLink(area.slug, page.path),
    testId: `module-config-nav-${page.path || 'settings'}`,
  }));
}

/**
 * Under the page header of every module configuration page: the module's other
 * configuration pages as tabs, and the way back to the module's daily pages.
 * Replaces the module's own sub-navigation there (config is never a module tab).
 * The page's breadcrumbs read Settings › Module (no link) › page.
 *
 *   <app-module-config-nav module="risk" />
 */
@Component({
  selector: 'app-module-config-nav',
  imports: [RouterLink, TranslocoPipe, Icon, ModuleNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'data-testid': 'module-config-nav' },
  template: `
    @if (items().length) {
      <app-module-nav [labelKey]="'modules.names.' + module()" [items]="items()" />
    }
    <p
      class="-mt-2 mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-muted"
      [class.mt-0]="!items().length"
    >
      <span>{{ 'settings.moduleConfig.note' | transloco }}</span>
      <a
        [routerLink]="moduleLink()"
        data-testid="module-config-open-module"
        class="inline-flex min-h-6 items-center gap-1 font-semibold text-accent hover:underline"
      >
        {{ 'settings.moduleConfig.openModule' | transloco: { module: (moduleName() | transloco) } }}
        <app-icon name="arrow" [size]="13" />
      </a>
    </p>
  `,
})
export class ModuleConfigNav {
  /** Backend module key (`risk`, `management_review`, …). */
  readonly module = input.required<string>();

  protected readonly items = computed(() => moduleConfigNavItems(this.module()));

  protected readonly moduleLink = computed(
    () => '/' + (moduleConfigArea(this.module())?.slug ?? this.module()),
  );

  protected readonly moduleName = computed(() => `modules.names.${this.module()}`);
}
