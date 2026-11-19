import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { Button } from '../ui/button/button';
import { Icon } from '../ui/icon/icon';
import { providerI18nKey } from './starter-setup.models';
import { STARTER_SCOPE } from './starter-setup';

/**
 * The empty-register invitation to a starter setup: a short question and the primary
 * action "Lag forslag fra bedriftsprofilen" (`begin` fires; the page opens its
 * `app-starter-setup`). Texts: `starter.providers.<provider with _>.prompt{Title,Body}`.
 */
@Component({
  selector: 'app-starter-setup-prompt',
  imports: [TranslocoPipe, Button, Icon],
  viewProviders: [provideSharedScope(STARTER_SCOPE)],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="mx-auto mt-6 flex max-w-xl flex-col items-center gap-2 rounded-card border border-accent/30 bg-accent-soft px-5 py-5 text-center"
      data-testid="starter-prompt"
    >
      <app-icon name="spark" [size]="20" />
      <h2 class="font-display text-section font-bold text-fg">
        {{ 'starter.providers.' + key() + '.promptTitle' | transloco }}
      </h2>
      <p class="text-ui text-fg-muted">
        {{ 'starter.providers.' + key() + '.promptBody' | transloco }}
      </p>
      <app-button class="mt-1" data-testid="starter-start" (click)="begin.emit()">
        {{ 'starter.start' | transloco }}
      </app-button>
      <p class="text-meta text-fg-muted">{{ 'starter.promptNote' | transloco }}</p>
    </div>
  `,
})
export class StarterSetupPrompt {
  readonly provider = input.required<string>();
  readonly begin = output<void>();

  protected readonly key = computed(() => providerI18nKey(this.provider()));
}
