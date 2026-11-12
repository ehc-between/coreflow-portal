import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormField } from '../ui/form-field/form-field';
import {
  DEFAULT_RULE,
  RRULE_FREQS,
  RecurrenceRule,
  RruleEnd,
  RruleFreq,
  WEEKDAYS,
  Weekday,
  buildRrule,
  parseRrule,
} from './rrule';
import { RuleSummary } from './rule-summary';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { addDays, todayDay } from './task-display';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/**
 * Picks a recurrence rule within the backend's RRULE subset: frequency, interval,
 * weekdays (weekly), day of month (monthly / yearly), month (yearly) and an end
 * (never, after N times, or on a date). Two-way bound: `[(rrule)]="rule"`. An
 * unparsable incoming rule is shown as the default monthly rule until changed.
 */
@Component({
  selector: 'app-recurrence-picker',
  imports: [TranslocoPipe, FormField, RuleSummary],
  viewProviders: [provideSharedScope('tasks')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="flex flex-col gap-3 rounded-card border border-border bg-surface-2 p-3.5">
      <legend class="px-1 text-[13px] font-semibold text-fg-muted">
        {{ 'tasks.rrule.legend' | transloco }}
      </legend>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <app-form-field [label]="'tasks.rrule.freq' | transloco" [inputId]="id('freq')">
          <select
            [id]="id('freq')"
            [value]="rule().freq"
            (change)="setFreq($any($event.target).value)"
          >
            @for (f of freqs; track f) {
              <option [value]="f" [selected]="f === rule().freq">
                {{ 'tasks.rrule.freqs.' + f | transloco }}
              </option>
            }
          </select>
        </app-form-field>
        <app-form-field [label]="'tasks.rrule.interval' | transloco" [inputId]="id('interval')">
          <input
            [id]="id('interval')"
            type="number"
            min="1"
            max="1000"
            [value]="rule().interval"
            (change)="setInterval($any($event.target).value)"
          />
        </app-form-field>
      </div>

      @if (rule().freq === 'WEEKLY') {
        <div role="group" [attr.aria-label]="'tasks.rrule.weekdaysLabel' | transloco">
          <div class="mb-1.5 text-[13px] font-semibold text-fg-muted">
            {{ 'tasks.rrule.weekdaysLabel' | transloco }}
          </div>
          <div class="flex flex-wrap gap-1.5">
            @for (d of weekdays; track d) {
              <button
                type="button"
                class="min-w-[44px] rounded-tile border px-2 py-1.5 text-[12.5px] font-semibold focus-visible:outline-2 focus-visible:outline-accent"
                [class.border-accent]="rule().byDay.includes(d)"
                [class.bg-accent-soft]="rule().byDay.includes(d)"
                [class.text-accent]="rule().byDay.includes(d)"
                [class.border-border]="!rule().byDay.includes(d)"
                [class.text-fg-muted]="!rule().byDay.includes(d)"
                [attr.aria-pressed]="rule().byDay.includes(d)"
                [attr.aria-label]="'tasks.rrule.weekdays.' + d | transloco"
                (click)="toggleDay(d)"
              >
                {{ 'tasks.rrule.weekdaysShort.' + d | transloco }}
              </button>
            }
          </div>
        </div>
      }

      @if (rule().freq === 'MONTHLY' || rule().freq === 'YEARLY') {
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          @if (rule().freq === 'YEARLY') {
            <app-form-field [label]="'tasks.rrule.month' | transloco" [inputId]="id('month')">
              <select [id]="id('month')" (change)="setMonth($any($event.target).value)">
                <option value="" [selected]="rule().byMonth === null">
                  {{ 'tasks.rrule.sameAsStart' | transloco }}
                </option>
                @for (m of months; track m) {
                  <option [value]="m" [selected]="rule().byMonth === m">
                    {{ 'tasks.rrule.months.' + m | transloco }}
                  </option>
                }
              </select>
            </app-form-field>
          }
          <app-form-field [label]="'tasks.rrule.monthDay' | transloco" [inputId]="id('monthday')">
            <input
              [id]="id('monthday')"
              type="number"
              min="1"
              max="31"
              [value]="rule().byMonthDay ?? ''"
              [placeholder]="'tasks.rrule.sameAsStart' | transloco"
              (change)="setMonthDay($any($event.target).value)"
            />
          </app-form-field>
        </div>
      }

      <div role="radiogroup" [attr.aria-label]="'tasks.rrule.ends' | transloco">
        <div class="mb-1.5 text-[13px] font-semibold text-fg-muted">
          {{ 'tasks.rrule.ends' | transloco }}
        </div>
        <div class="flex flex-col gap-2 text-[13px] text-fg">
          <label class="flex items-center gap-2">
            <input
              type="radio"
              [name]="id('end')"
              [checked]="rule().end.type === 'never'"
              (change)="setEnd({ type: 'never' })"
            />
            {{ 'tasks.rrule.endNever' | transloco }}
          </label>
          <label class="flex flex-wrap items-center gap-2">
            <input
              type="radio"
              [name]="id('end')"
              [checked]="rule().end.type === 'count'"
              (change)="setEnd({ type: 'count', count: endCount() })"
            />
            {{ 'tasks.rrule.endCount' | transloco }}
            <input
              type="number"
              min="1"
              class="h-8 w-20 rounded-tile border border-border bg-bg px-2 text-[13px]"
              [attr.aria-label]="'tasks.rrule.endCountLabel' | transloco"
              [value]="endCount()"
              (change)="setEnd({ type: 'count', count: toInt($any($event.target).value, 1) })"
            />
          </label>
          <label class="flex flex-wrap items-center gap-2">
            <input
              type="radio"
              [name]="id('end')"
              [checked]="rule().end.type === 'until'"
              (change)="setEnd({ type: 'until', until: endUntil() || defaultUntil })"
            />
            {{ 'tasks.rrule.endUntil' | transloco }}
            <input
              type="date"
              class="h-8 rounded-tile border border-border bg-bg px-2 text-[13px]"
              [attr.aria-label]="'tasks.rrule.endUntilLabel' | transloco"
              [value]="endUntil()"
              (change)="setEnd({ type: 'until', until: $any($event.target).value })"
            />
          </label>
        </div>
      </div>

      <p class="text-[12.5px] text-fg-muted" aria-live="polite">
        <span class="font-semibold">{{ 'tasks.rrule.preview' | transloco }}</span>
        <app-rule-summary [rrule]="rrule()" />
      </p>
    </fieldset>
  `,
})
export class RecurrencePicker {
  /** The rule string (no `RRULE:` prefix). */
  readonly rrule = model('FREQ=MONTHLY');
  /** Prefix for element ids, unique per form. */
  readonly idPrefix = input('task-rrule');

  protected readonly freqs = RRULE_FREQS;
  protected readonly weekdays = WEEKDAYS;
  protected readonly months = MONTHS;
  /** A year from today: the end date offered when "on a date" is picked first. */
  protected readonly defaultUntil = addDays(todayDay(), 365);

  protected readonly rule = computed<RecurrenceRule>(
    () => parseRrule(this.rrule()) ?? DEFAULT_RULE,
  );
  protected readonly endCount = computed(() => {
    const end = this.rule().end;
    return end.type === 'count' ? end.count : 10;
  });
  protected readonly endUntil = computed(() => {
    const end = this.rule().end;
    return end.type === 'until' ? end.until : '';
  });

  protected id(part: string): string {
    return `${this.idPrefix()}-${part}`;
  }

  protected toInt(value: string, min: number): number {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= min ? n : min;
  }

  protected setFreq(freq: RruleFreq): void {
    this.patch({ freq });
  }

  protected setInterval(value: string): void {
    this.patch({ interval: Math.min(1000, this.toInt(value, 1)) });
  }

  protected toggleDay(day: Weekday): void {
    const days = this.rule().byDay;
    this.patch({ byDay: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] });
  }

  protected setMonth(value: string): void {
    this.patch({ byMonth: value ? Math.min(12, this.toInt(value, 1)) : null });
  }

  protected setMonthDay(value: string): void {
    this.patch({ byMonthDay: value ? Math.min(31, this.toInt(value, 1)) : null });
  }

  protected setEnd(end: RruleEnd): void {
    if (end.type === 'until' && !end.until) {
      // No date picked yet: keep the rule valid until one is.
      this.patch({ end: { type: 'never' } });
      return;
    }
    this.patch({ end });
  }

  private patch(change: Partial<RecurrenceRule>): void {
    this.rrule.set(buildRrule({ ...this.rule(), ...change }));
  }
}
