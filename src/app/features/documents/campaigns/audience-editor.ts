import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import { AssigneeOptionsService } from '../../../shared/tasks/assignee-options';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { AUDIENCE_TYPES, AudienceEntry, AudienceType } from '../data/document-control.models';

let nextId = 0;

/** Stable identity of an audience entry (for de-duplication and tracking). */
export function audienceKey(entry: AudienceEntry): string {
  return entry.type === 'all' ? 'all' : `${entry.type}:${entry.value ?? ''}`;
}

/** Add `entry` unless an equal one is there; `all` replaces everything else. */
export function addAudience(
  list: readonly AudienceEntry[],
  entry: AudienceEntry,
): readonly AudienceEntry[] {
  if (entry.type === 'all') {
    return [{ type: 'all' }];
  }
  const rest = list.filter((e) => e.type !== 'all');
  return rest.some((e) => audienceKey(e) === audienceKey(entry)) ? rest : [...rest, entry];
}

/**
 * Picks who a campaign targets: people, roles, departments or everyone. The
 * server keeps only people who can read the document (the rest are "skipped").
 */
@Component({
  selector: 'app-audience-editor',
  imports: [TranslocoPipe, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="flex flex-col gap-2" [disabled]="disabled()">
      <legend class="mb-1 text-[13px] font-semibold text-fg-muted">
        {{ 'documents.control.campaigns.audience.label' | transloco }}
      </legend>
      <ul class="flex flex-wrap gap-1.5" aria-live="polite">
        @for (entry of value(); track key(entry)) {
          <li
            class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-2.5 text-[12.5px] text-fg"
          >
            <span>{{ label(entry) }}</span>
            @if (!readOnly()) {
              <button
                type="button"
                class="flex rounded-full p-0.5 text-fg-subtle hover:text-fail"
                [attr.aria-label]="
                  'documents.control.campaigns.audience.remove' | transloco: { name: label(entry) }
                "
                (click)="remove(entry)"
              >
                <app-icon name="x" [size]="12" />
              </button>
            }
          </li>
        } @empty {
          <li class="text-[12.5px] text-fg-subtle">
            {{ 'documents.control.campaigns.audience.none' | transloco }}
          </li>
        }
      </ul>
      @if (!readOnly()) {
        <div class="flex flex-wrap items-end gap-2">
          <div class="flex flex-col gap-1">
            <label [attr.for]="typeId" class="text-[12px] text-fg-muted">
              {{ 'documents.control.campaigns.audience.type' | transloco }}
            </label>
            <select
              [id]="typeId"
              class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
              (change)="setType($any($event.target).value)"
              data-testid="audience-type"
            >
              @for (t of types; track t) {
                <option [value]="t" [selected]="t === type()">
                  {{ 'documents.control.campaigns.audience.types.' + t | transloco }}
                </option>
              }
            </select>
          </div>
          @if (type() !== 'all') {
            <div class="flex min-w-[180px] flex-1 flex-col gap-1">
              <label [attr.for]="valueId" class="text-[12px] text-fg-muted">
                {{ 'documents.control.campaigns.audience.who' | transloco }}
              </label>
              <select
                [id]="valueId"
                class="h-9 rounded-tile border border-border bg-bg px-2 text-[13px] text-fg"
                (change)="choice.set($any($event.target).value)"
                data-testid="audience-value"
              >
                <option value="" [selected]="!choice()">
                  {{ 'documents.control.campaigns.audience.choose' | transloco }}
                </option>
                @for (o of choices(); track o.value) {
                  <option [value]="o.value" [selected]="o.value === choice()">{{ o.label }}</option>
                }
              </select>
            </div>
          }
          <app-button
            size="sm"
            variant="secondary"
            [disabled]="type() !== 'all' && !choice()"
            (click)="add()"
            data-testid="audience-add"
          >
            <app-icon name="plus" [size]="13" />
            {{ 'documents.control.campaigns.audience.add' | transloco }}
          </app-button>
        </div>
      }
    </fieldset>
  `,
})
export class AudienceEditor {
  private readonly options = inject(AssigneeOptionsService);
  private readonly language = inject(LanguageService);

  readonly value = input<readonly AudienceEntry[]>([]);
  readonly disabled = input(false);
  /** Show the chips only (no add / remove controls). */
  readonly readOnly = input(false);
  readonly valueChange = output<readonly AudienceEntry[]>();

  protected readonly types = AUDIENCE_TYPES;
  protected readonly typeId = `cf-audience-type-${++nextId}`;
  protected readonly valueId = `cf-audience-value-${nextId}`;
  protected readonly type = signal<AudienceType>('user');
  protected readonly choice = signal('');

  /** Options of the selected type: `{value (id / role key), label}`. */
  protected readonly choices = computed(() => {
    const all = this.options.options();
    const type = this.type();
    const list = type === 'role' ? all.roles : type === 'department' ? all.departments : all.users;
    const prefix = `${type}:`;
    return list.map((o) => ({
      value: o.value.slice(prefix.length),
      label: o.labelIsKey ? this.language.translate(o.label) : o.label,
    }));
  });

  constructor() {
    this.options.ensureLoaded();
  }

  protected key(entry: AudienceEntry): string {
    return audienceKey(entry);
  }

  /** Display name of an entry (falls back to the raw value). */
  protected label(entry: AudienceEntry): string {
    if (entry.type === 'all') {
      return this.language.translate('documents.control.campaigns.audience.everyone');
    }
    const all = this.options.options();
    const list =
      entry.type === 'role' ? all.roles : entry.type === 'department' ? all.departments : all.users;
    const found = list.find((o) => o.value === `${entry.type}:${entry.value}`);
    const name = found
      ? found.labelIsKey
        ? this.language.translate(found.label)
        : found.label
      : (entry.value ?? '');
    return this.language.translate(`documents.control.campaigns.audience.chip.${entry.type}`, {
      name,
    });
  }

  protected setType(type: AudienceType): void {
    this.type.set(type);
    this.choice.set('');
  }

  protected add(): void {
    const type = this.type();
    const entry: AudienceEntry = type === 'all' ? { type } : { type, value: this.choice() };
    if (type !== 'all' && !entry.value) {
      return;
    }
    this.valueChange.emit(addAudience(this.value(), entry));
    this.choice.set('');
  }

  protected remove(entry: AudienceEntry): void {
    const key = audienceKey(entry);
    this.valueChange.emit(this.value().filter((e) => audienceKey(e) !== key));
  }
}
