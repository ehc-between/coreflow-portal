import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { FieldGroup } from '../ui/field-list/field-list';
import { Icon } from '../ui/icon/icon';
import { provideKitScope } from './kit-scope';

let nextId = 0;

/**
 * The one line a section shows for its hidden empty fields (docs/ux-guide.md §2.7):
 * "3 felt er ikke fylt ut · Fyll ut". `list` names them ("Ikke fylt ut: Behov,
 * Beskrivelse · Fyll ut"); the lead section always lists, the details section
 * lists for beginners.
 */
@Component({
  selector: 'app-empty-fields-line',
  imports: [RouterLink, TranslocoPipe],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (labels().length > 0) {
      <p class="text-ui text-fg-muted" data-testid="empty-fields">
        @if (list()) {
          {{ 'kit.detail.empty.listed' | transloco: { fields: labels().join(', ') } }}
        } @else {
          {{
            (labels().length === 1 ? 'kit.detail.empty.countOne' : 'kit.detail.empty.count')
              | transloco: { count: labels().length }
          }}
        }
        @if (fillLink(); as link) {
          <span aria-hidden="true"> · </span>
          <a
            [routerLink]="link"
            class="font-semibold whitespace-nowrap text-accent hover:underline"
            data-testid="empty-fields-fill"
            >{{ 'kit.detail.empty.fill' | transloco }}</a
          >
        }
      </p>
    }
  `,
})
export class EmptyFieldsLine {
  readonly labels = input<readonly string[]>([]);
  readonly list = input(false);
  readonly fillLink = input<string | readonly unknown[] | null | undefined>(null);
}

/**
 * "Hovedinformasjon" (detail-page anatomy, docs/ux-guide.md §2.7): the 2-4 fields
 * that matter most for the record type, large and first. Put it in the layout's
 * `[record-lead]` slot:
 *
 *   <app-record-lead record-lead [fillLink]="editLink()">
 *     <app-record-status-line status tone="pass">Håndtert – …</app-record-status-line>
 *     <app-field-item size="lead" labelKey="…" [value]="r.needs" [multiline]="true" />
 *   </app-record-lead>
 *
 * Empty fields are hidden and named in one line ("Ikke fylt ut: Behov · Fyll ut").
 */
@Component({
  selector: 'app-record-lead',
  imports: [TranslocoPipe, EmptyFieldsLine],
  providers: [FieldGroup],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section
      class="rounded-card border border-border bg-surface p-5 shadow-card"
      [attr.aria-labelledby]="headingId"
      data-testid="record-lead"
    >
      <h2
        [id]="headingId"
        class="mb-3 text-meta font-semibold tracking-wide text-fg-muted uppercase"
      >
        {{ titleKey() | transloco }}
      </h2>
      <ng-content select="[status]" />
      <div class="grid gap-x-8 gap-y-5" [class.sm:grid-cols-2]="columns() === 2">
        <ng-content />
      </div>
      @if (group.emptyLabels().length > 0) {
        <app-empty-fields-line
          class="mt-4 block border-t border-border pt-3"
          [labels]="group.emptyLabels()"
          [list]="true"
          [fillLink]="fillLink()"
        />
      }
    </section>
  `,
})
export class RecordLead {
  protected readonly group = inject(FieldGroup);
  protected readonly headingId = `cf-record-lead-${++nextId}`;

  readonly titleKey = input('kit.detail.lead.title');
  readonly columns = input<1 | 2>(2);
  /** Edit page ("Fyll ut"). */
  readonly fillLink = input<string | readonly unknown[] | null | undefined>(null);
}

/** Tone of a status sentence. */
export type StatusLineTone = 'pass' | 'warn' | 'fail' | 'info' | 'neutral';

const TONE_CLASSES: Readonly<Record<StatusLineTone, string>> = {
  pass: 'bg-pass-soft text-pass-ink',
  warn: 'bg-warn-soft text-warn-ink',
  fail: 'bg-fail-soft text-fail-ink',
  info: 'bg-info-soft text-info-ink',
  neutral: 'bg-surface-2 text-fg',
};

/**
 * The short plain-language status sentence at the top of "Hovedinformasjon"
 * ("Håndtert – forventningene er ivaretatt."). The first words up to the dash
 * are the status; keep it to one sentence.
 */
@Component({
  selector: 'app-record-status-line',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block mb-4' },
  template: `
    <p
      class="flex items-start gap-2 rounded-tile px-3 py-2 text-ui font-semibold"
      [class]="toneClass()"
      data-testid="record-status-line"
      [attr.data-tone]="tone()"
    >
      <app-icon class="mt-px flex-none" [name]="icon()" [size]="15" />
      <span class="min-w-0"><ng-content /></span>
    </p>
  `,
})
export class RecordStatusLine {
  readonly tone = input<StatusLineTone>('neutral');
  protected readonly toneClass = computed(() => TONE_CLASSES[this.tone()]);
  protected readonly icon = computed(() =>
    this.tone() === 'pass' ? 'checkcircle' : this.tone() === 'neutral' ? 'flag' : 'alert',
  );
}

/**
 * The secondary fields of a record (detail-page anatomy, docs/ux-guide.md §2.7),
 * under "Hovedinformasjon" in the Details tab. Empty fields are hidden and counted
 * in one line ("3 felt er ikke fylt ut · Fyll ut"; beginners see which).
 *
 *   <app-record-details [fillLink]="editLink()">
 *     <app-field-item labelKey="…" [value]="…" />
 *   </app-record-details>
 */
@Component({
  selector: 'app-record-details',
  imports: [TranslocoPipe, EmptyFieldsLine],
  providers: [FieldGroup],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section [attr.aria-labelledby]="headingId" data-testid="record-details">
      <h2 [id]="headingId" class="mb-3 font-display text-card font-bold text-fg">
        {{ titleKey() | transloco }}
      </h2>
      <div
        class="grid gap-x-6 gap-y-4"
        [class.sm:grid-cols-2]="columns() >= 2"
        [class.lg:grid-cols-3]="columns() >= 3"
      >
        <ng-content />
      </div>
      @if (group.emptyLabels().length > 0) {
        <app-empty-fields-line
          class="block"
          [class.mt-4]="group.shownCount() > 0"
          [labels]="group.emptyLabels()"
          [list]="beginner()"
          [fillLink]="fillLink()"
        />
      }
      <ng-content select="[after]" />
    </section>
  `,
})
export class RecordDetails {
  protected readonly group = inject(FieldGroup);
  protected readonly beginner = inject(GuidanceService).isBeginner;
  protected readonly headingId = `cf-record-details-${++nextId}`;

  readonly titleKey = input('kit.detail.details.title');
  readonly columns = input<1 | 2 | 3>(2);
  readonly fillLink = input<string | readonly unknown[] | null | undefined>(null);
}

/**
 * The compact metadata block at the bottom of the "Oppfølging" card (layout slot
 * `[follow-up-meta]`): owner, reviewed, next review, last changed, one per row
 * (`app-field-item layout="inline"`). Unset values are hidden; keep one visible
 * with `keepEmpty` + `emptyKey` / `emptyLink` ("Neste gjennomgang: Ikke planlagt ·
 * Planlegg").
 */
@Component({
  selector: 'app-record-meta',
  providers: [FieldGroup],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-1.5', 'data-testid': 'record-meta' },
  template: `<ng-content />`,
})
export class RecordMeta {}
