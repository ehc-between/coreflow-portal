import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { GUIDANCE_LEVELS, GuidanceLevel } from '../../core/guidance/guidance.models';

let nextId = 0;

/**
 * Learning-level radio cards (beginner / standard / expert, each with its description),
 * optionally preceded by "Use the organisation default". `null` is the default option.
 */
@Component({
  selector: 'app-level-picker',
  imports: [TranslocoPipe],
  providers: [provideTranslocoScope('guidance')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <fieldset class="flex flex-col gap-2" [disabled]="disabled()">
      <legend class="sr-only">{{ legendKey() | transloco }}</legend>
      @if (includeDefault()) {
        <label [class]="optionClass" [class.border-accent]="value() === null">
          <input
            type="radio"
            class="mt-1 accent-accent"
            data-testid="level-option-default"
            [name]="name"
            [checked]="value() === null"
            (change)="valueChange.emit(null)"
          />
          <span class="min-w-0 flex-1">
            <span class="block text-[13.5px] font-semibold text-fg">
              {{
                'guidance.level.useOrgDefault'
                  | transloco: { level: 'guidance.levels.' + defaultLevel() + '.name' | transloco }
              }}
            </span>
            <span class="block text-[12.5px] text-fg-muted">
              {{ 'guidance.level.useOrgDefaultHint' | transloco }}
            </span>
          </span>
        </label>
      }
      @for (level of levels; track level) {
        <label [class]="optionClass" [class.border-accent]="value() === level">
          <input
            type="radio"
            class="mt-1 accent-accent"
            [attr.data-testid]="'level-option-' + level"
            [name]="name"
            [checked]="value() === level"
            (change)="valueChange.emit(level)"
          />
          <span class="min-w-0 flex-1">
            <span class="block text-[13.5px] font-semibold text-fg">
              {{ 'guidance.levels.' + level + '.name' | transloco }}
            </span>
            <span class="block text-[12.5px] text-fg-muted">
              {{ 'guidance.levels.' + level + '.description' | transloco }}
            </span>
          </span>
        </label>
      }
    </fieldset>
  `,
})
export class LevelPicker {
  readonly value = input<GuidanceLevel | null>(null);
  readonly includeDefault = input(false);
  readonly defaultLevel = input<GuidanceLevel>('standard');
  readonly disabled = input(false);
  readonly legendKey = input('guidance.level.legend');
  readonly valueChange = output<GuidanceLevel | null>();

  protected readonly levels = GUIDANCE_LEVELS;
  protected readonly name = `guidance-level-${nextId++}`;
  protected readonly optionClass =
    'flex cursor-pointer items-start gap-3 rounded-tile border border-border bg-surface px-3 py-2.5 hover:bg-surface-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent';
}
