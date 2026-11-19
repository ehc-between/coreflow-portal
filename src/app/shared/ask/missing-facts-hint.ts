import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { Icon } from '../ui/icon/icon';

/**
 * "Legg inn adressen og organisasjonsnummeret i bedriftsprofilen for et mer presist
 * forslag" with a link to the company profile. `facts` are profile keys from the
 * server (`address`, `org_number`, `products_services`, ...).
 */
@Component({
  selector: 'app-missing-facts-hint',
  imports: [RouterLink, TranslocoPipe, Icon],
  viewProviders: [provideSharedScope('ask')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (facts().length) {
      <p class="flex items-start gap-1.5 text-meta text-fg-muted" data-testid="missing-facts-hint">
        <app-icon name="help" [size]="13" class="mt-0.5 flex-none" />
        <span>
          {{ 'ask.formSuggest.missingFacts' | transloco: { facts: factsText() } }}
          <a class="ml-1 text-accent underline" routerLink="/settings/profile">{{
            'ask.formSuggest.openProfile' | transloco
          }}</a>
        </span>
      </p>
    }
  `,
})
export class MissingFactsHint {
  private readonly language = inject(LanguageService);

  readonly facts = input<readonly string[]>([]);

  /** The facts, translated and joined ("adressen og organisasjonsnummeret"). */
  protected readonly factsText = computed(() => {
    const names = this.facts().map((key) =>
      this.language.translate(`ask.formSuggest.facts.${key}`),
    );
    if (names.length < 2) {
      return names.join('');
    }
    const and = this.language.translate('ask.formSuggest.and');
    return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
  });
}
