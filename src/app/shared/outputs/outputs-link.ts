import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { SECONDARY_LINK } from '../requirement-locations/location-links';
import { Icon } from '../ui/icon/icon';
import { OUTPUTS_SCOPE } from './output-display';

/** The library's portal path. */
export const LIBRARY_PATH = '/library';

/**
 * The "Dokumenter og rapporter" secondary action (principle 8): the same entry in
 * the same place on every module and standard page, opening the library filtered to
 * what this page owns. `app-page-header` renders it from `outputsModule` /
 * `outputsStandard`; use it directly only outside a page header.
 */
@Component({
  selector: 'app-outputs-link',
  imports: [RouterLink, TranslocoPipe, Icon],
  viewProviders: [provideSharedScope(OUTPUTS_SCOPE)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="path" [queryParams]="params()" [class]="linkClass" data-testid="outputs-link">
      <app-icon name="documents" [size]="15" />
      {{ 'outputs.link' | transloco }}
    </a>
  `,
})
export class OutputsLink {
  readonly module = input<string | null>(null);
  readonly standard = input<string | null>(null);

  protected readonly path = LIBRARY_PATH;
  protected readonly linkClass = SECONDARY_LINK.replace('h-8', 'h-9');
  protected readonly params = computed(() => {
    const params: Record<string, string> = {};
    if (this.module()) {
      params['module'] = this.module()!;
    }
    if (this.standard()) {
      params['standard'] = this.standard()!;
    }
    return params;
  });
}
