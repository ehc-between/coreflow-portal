import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { ConnectionItem } from '../../core/kit/connections.models';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { flowSourceType } from './kit-format';
import { provideKitScope } from './kit-scope';

/**
 * How a connection came about, as a small badge with an explanation on hover:
 * "Automatic" (a rule linked them), "Via field" (a form field relates them),
 * "Source" / "Created from here" (a create-from-here flow), "AI suggestion".
 * Plain links made by a person show nothing.
 */
@Component({
  selector: 'app-origin-badge',
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (badge(); as b) {
      <span
        class="inline-flex items-center rounded-full border px-1.5 text-micro font-semibold"
        [class]="b.cls"
        [title]="b.hint"
        data-testid="origin-badge"
        >{{ b.text }}<span class="sr-only">. {{ b.hint }}</span></span
      >
    }
  `,
  host: { class: 'inline-flex' },
})
export class OriginBadge {
  private readonly language = inject(LanguageService);
  private readonly entityTypes = inject(EntityTypesService);

  readonly item = input.required<Pick<ConnectionItem, 'origin' | 'flow_key' | 'other'>>();

  protected readonly badge = computed(() => {
    const { origin, flow_key, other } = this.item();
    const t = (key: string, params?: Record<string, unknown>) =>
      this.language.translate(`kit.connections.origin.${key}`, params);
    switch (origin) {
      case 'auto':
        return { text: t('auto'), hint: t('autoHint'), cls: 'border-info/30 text-info-ink' };
      case 'structural':
        return {
          text: t('structural'),
          hint: t('structuralHint'),
          cls: 'border-border text-fg-muted',
        };
      case 'ai':
        return { text: t('ai'), hint: t('aiHint'), cls: 'border-accent-border text-accent' };
      case 'flow': {
        // Seen from the new record, the other side is where it was created from.
        const isSource = flowSourceType(flow_key) === other.entity_type;
        const type = this.entityTypes.label(other.entity_type, other.label_key);
        return isSource
          ? {
              text: t('flowSource'),
              hint: t('flowSourceHint', { type }),
              cls: 'border-pass/30 text-pass-ink',
            }
          : {
              text: t('flowCreated'),
              hint: t('flowCreatedHint', { type }),
              cls: 'border-pass/30 text-pass-ink',
            };
      }
      default:
        return null;
    }
  });
}
