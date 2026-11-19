import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { EntityChip, EntityChipRef } from '../../shared/kit/entity-chip';
import { formatLocalDate, formatLocalDay } from '../../shared/locale/locale-pipes';
import { locationName } from '../../shared/locale/countries';
import { FieldItem } from '../../shared/ui/field-list/field-list';
import { PrivacyRecord, RetentionSchedule } from './data/privacy.models';
import { PrivacyRefsService } from './data/privacy-refs.service';
import {
  FactDef,
  FieldDef,
  LinkedEntity,
  REGISTERS,
  RegisterDef,
  fieldLabelKey,
} from './data/privacy-registers';
import { LeadField } from './detail-lead';

/** Entity type of a linked module record (for the chip's type label). */
const ENTITY_TYPES: Readonly<Record<LinkedEntity, string>> = {
  supplier: 'supplier',
  contract: 'contract',
  document: 'document',
  asset: 'asset',
  employee: 'employee',
};

/** Fields shown elsewhere on the page (the title is the h1; owner and review in the card). */
const SHOWN_ELSEWHERE = new Set(['title', 'owner_user_id', 'review_due_at']);

/**
 * Which fields a register hides when their value says nothing: an "on time" breach
 * has no delay reason, a ROPA entry without automated decisions no logic.
 */
const HIDE_WHEN_EMPTY = new Set([
  'authority_delay_reason',
  'automated_decision_logic',
  'subjects_exemption',
  'extension_reason',
]);

interface ShownValue {
  readonly key: string;
  readonly labelKey: string;
  readonly text: string | null;
  readonly chips: readonly EntityChipRef[];
  readonly wide: boolean;
  readonly multiline: boolean;
}

interface ShownSection {
  readonly key: string;
  readonly values: readonly ShownValue[];
  /** Every value is empty: the section is hidden (its fields are still counted). */
  readonly empty: boolean;
}

const isEmpty = (v: ShownValue): boolean => v.text === null && !v.chips.length;

/**
 * The fields of a privacy record inside a detail-page section (docs/ux-guide.md §2.7):
 * links to other records as record chips (privacy registers and other modules),
 * countries by name, and a "no" that changes nothing left out. Empty fields hide
 * themselves; the enclosing `app-record-lead` / `app-record-details` names them.
 *
 * - `mode="lead"`: only the `lead` fields, in that order, large ("Hovedinformasjon").
 * - `mode="details"`: every other field, grouped by form section under small headings.
 */
@Component({
  selector: 'app-privacy-record-fields',
  imports: [NgTemplateOutlet, TranslocoPipe, EntityChip, FieldItem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (mode() === 'lead') {
      @for (v of leadValues(); track v.key) {
        <ng-container *ngTemplateOutlet="field; context: { $implicit: v, lead: true }" />
      }
    } @else {
      <div class="flex flex-col gap-6">
        @for (section of sections(); track section.key) {
          <section
            [attr.data-section]="section.key"
            [hidden]="section.empty"
            [attr.aria-labelledby]="'privacy-section-' + section.key"
          >
            <h3
              [id]="'privacy-section-' + section.key"
              class="mb-3 text-meta font-semibold tracking-wide text-fg-muted uppercase"
            >
              {{ 'privacy.form.sections.' + section.key | transloco }}
            </h3>
            <div class="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              @for (v of section.values; track v.key) {
                <ng-container *ngTemplateOutlet="field; context: { $implicit: v, lead: false }" />
              }
            </div>
          </section>
        }
      </div>
    }

    <ng-template #field let-v let-lead="lead">
      <app-field-item
        [id]="'field-' + v.key"
        [labelKey]="v.labelKey"
        [value]="v.chips.length ? null : v.text"
        [wide]="v.wide"
        [multiline]="v.multiline"
        [size]="lead ? 'lead' : 'default'"
        [attr.data-value]="v.key"
      >
        @if (v.chips.length) {
          <span class="flex flex-col items-start gap-1.5">
            @for (c of v.chips; track c.entity_id) {
              <app-entity-chip [ref]="c" [stacked]="true" />
            }
          </span>
        }
      </app-field-item>
    </ng-template>
  `,
})
export class PrivacyRecordFields {
  private readonly language = inject(LanguageService);
  private readonly refs = inject(PrivacyRefsService);

  readonly register = input.required<RegisterDef>();
  readonly record = input.required<PrivacyRecord>();
  readonly mode = input<'lead' | 'details'>('details');
  /** The "Hovedinformasjon" fields (shown in lead mode, left out in details mode). */
  readonly lead = input<readonly LeadField[]>([]);
  /** Field keys to leave out (shown by a panel of the page). */
  readonly skip = input<readonly string[]>([]);

  /** The lead fields, in their order, with their plain labels. */
  protected readonly leadValues = computed<readonly ShownValue[]>(() => {
    const def = this.register();
    const r = this.record() as unknown as Record<string, unknown>;
    const out: ShownValue[] = [];
    for (const l of this.lead()) {
      const f = def.fields.find((x) => x.key === l.key);
      const fact = def.facts.find((x) => x.key === l.key);
      const shown = f ? this.showField(f, r[l.key]) : fact ? this.showFact(fact, r[l.key]) : null;
      if (shown) {
        out.push({ ...shown, labelKey: l.labelKey ?? shown.labelKey });
      }
    }
    return out;
  });

  protected readonly sections = computed<readonly ShownSection[]>(() => {
    const def = this.register();
    const r = this.record() as unknown as Record<string, unknown>;
    const skip = new Set([...this.skip(), ...this.lead().map((l) => l.key)]);
    const sections: ShownSection[] = [];
    const facts = def.facts
      .filter(
        (f) =>
          !skip.has(f.key) &&
          r[f.key] !== null &&
          r[f.key] !== undefined &&
          r[f.key] !== '' &&
          !(f.kind === 'boolean' && r[f.key] === false),
      )
      .map((f) => this.showFact(f, r[f.key]));
    if (facts.length) {
      sections.push({ key: 'facts', values: facts, empty: false });
    }
    const factKeys = new Set(def.facts.map((f) => f.key));
    const order: string[] = [];
    const grouped = new Map<string, ShownValue[]>();
    for (const f of def.fields) {
      if (
        SHOWN_ELSEWHERE.has(f.key) ||
        skip.has(f.key) ||
        f.kind === 'screening' ||
        f.kind === 'risks' ||
        factKeys.has(f.key) ||
        (f.showIf && !f.showIf(r)) ||
        // A "no" that changes nothing is not shown (docs/ux-guide.md §2.7 rule 6).
        (f.kind === 'boolean' && !r[f.key])
      ) {
        continue;
      }
      const shown = this.showField(f, r[f.key]);
      if (HIDE_WHEN_EMPTY.has(f.key) && isEmpty(shown)) {
        continue;
      }
      if (!grouped.has(f.section)) {
        grouped.set(f.section, []);
        order.push(f.section);
      }
      grouped.get(f.section)!.push(shown);
    }
    for (const key of order) {
      const values = grouped.get(key)!;
      sections.push({ key, values, empty: values.every(isEmpty) });
    }
    return sections;
  });

  private t(key: string, params?: Record<string, unknown>): string {
    return this.language.translate(key, params);
  }

  private showFact(f: FactDef, value: unknown): ShownValue {
    return {
      key: f.key,
      labelKey: f.labelKey ?? `privacy.fields.${f.key}`,
      text: this.format(f.kind, value, f.optionSet),
      chips: [],
      wide: f.kind === 'text',
      multiline: f.kind === 'text',
    };
  }

  private showField(f: FieldDef, value: unknown): ShownValue {
    const base = {
      key: f.key,
      labelKey: fieldLabelKey(f),
      wide: !!f.wide || f.kind === 'textarea' || f.kind === 'ref' || f.kind === 'entity',
      multiline: f.kind === 'textarea',
    };
    const ids = Array.isArray(value)
      ? (value as unknown[]).filter((v): v is string => typeof v === 'string' && !!v)
      : typeof value === 'string' && value
        ? [value]
        : [];
    if ((f.kind === 'ref' || f.kind === 'refs') && f.ref) {
      const target = REGISTERS[f.ref];
      return {
        ...base,
        text: null,
        chips: ids.map((id) => {
          const label = this.refs.label(f.ref!, id);
          return {
            entity_type: target.entityType,
            entity_id: id,
            title: label ?? this.t('privacy.detail.linkedRecord'),
            url: `/privacy/${target.segment}/${id}`,
          };
        }),
      };
    }
    if ((f.kind === 'entity' || f.kind === 'entities') && f.entity) {
      const entity = f.entity;
      return {
        ...base,
        text: null,
        chips: ids.map((id) => {
          const option = this.refs.entityOption(entity, id);
          return {
            entity_type: ENTITY_TYPES[entity],
            entity_id: id,
            title: option?.label ?? this.t('privacy.detail.linkedRecord'),
            url: option?.url ?? null,
          };
        }),
      };
    }
    if (f.kind === 'screening') {
      const met = Object.entries((value ?? {}) as Record<string, boolean>)
        .filter(([, on]) => on)
        .map(([k]) => this.t(`privacy.criteria.${k}.label`));
      return { ...base, text: met.length ? met.join(', ') : null, chips: [] };
    }
    const text = this.formatField(f, value);
    return { ...base, text, chips: [] };
  }

  private formatField(f: FieldDef, value: unknown): string | null {
    if (f.key === 'retention_months' && typeof value === 'number') {
      return this.t('privacy.retention.months', { count: value });
    }
    if (
      f.key === 'retention_period' &&
      this.register().key === 'retention' &&
      typeof (this.record() as RetentionSchedule).retention_months === 'number'
    ) {
      // The period in words only adds something when it is not just "<n> months".
      const months = (this.record() as RetentionSchedule).retention_months;
      if (typeof value === 'string' && /^\s*\d+\s+months?\s*$/i.test(value)) {
        return this.t('privacy.retention.months', { count: months });
      }
    }
    if (f.key === 'execution_interval_months' && typeof value === 'number') {
      return this.t('privacy.retention.everyMonths', { count: value });
    }
    return this.format(f.kind, value, f.optionSet);
  }

  /** A value as text, or null when it is empty (the field list then says "Ikke satt"). */
  private format(kind: string, value: unknown, optionSet?: string): string | null {
    if (value === null || value === undefined || value === '') {
      return kind === 'tristate' ? this.t('privacy.common.undecided') : null;
    }
    const locale = this.language.locale();
    switch (kind) {
      case 'boolean':
      case 'tristate':
        return this.t(value ? 'privacy.common.yes' : 'privacy.common.no');
      case 'date':
        return formatLocalDay(String(value), 'mediumDate', locale);
      case 'datetime':
        return formatLocalDate(String(value), 'medium', locale);
      case 'select':
        return optionSet ? this.t(`privacy.options.${optionSet}.${value}`) : String(value);
      case 'multi':
        return Array.isArray(value) && value.length
          ? value.map((v) => this.t(`privacy.options.${optionSet}.${v}`)).join(', ')
          : null;
      case 'tags':
        return Array.isArray(value) && value.length ? value.join(', ') : null;
      case 'country':
        return locationName(String(value), this.language);
      case 'countries':
        return Array.isArray(value) && value.length
          ? value.map((c) => locationName(String(c), this.language)).join(', ')
          : null;
      case 'owner':
        return this.refs.userName(String(value)) ?? this.t('privacy.common.someone');
      case 'department':
        return this.refs.departmentName(String(value)) ?? this.t('privacy.detail.linkedRecord');
      default:
        return String(value);
    }
  }
}
