import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { EntityChip, EntityChipRef } from '../../shared/kit/entity-chip';
import { formatLocalDate, formatLocalDay } from '../../shared/locale/locale-pipes';
import { locationName } from '../../shared/locale/countries';
import { Card } from '../../shared/ui/card/card';
import { FieldItem, FieldList } from '../../shared/ui/field-list/field-list';
import { PrivacyRecord, RetentionSchedule, RopaEntry } from './data/privacy.models';
import { PrivacyRefsService } from './data/privacy-refs.service';
import {
  FactDef,
  FieldDef,
  LinkedEntity,
  REGISTERS,
  RegisterDef,
  fieldLabelKey,
} from './data/privacy-registers';

/** Entity type of a linked module record (for the chip's type label). */
const ENTITY_TYPES: Readonly<Record<LinkedEntity, string>> = {
  supplier: 'supplier',
  contract: 'contract',
  document: 'document',
  asset: 'asset',
  employee: 'employee',
};

/** Fields shown elsewhere on the page (title, description, the DPIA tables). */
const SHOWN_ELSEWHERE = new Set(['title', 'description']);

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
  /** An Art. 30 fact that is still missing (flagged with a warning dot). */
  readonly missing: boolean;
}

interface ShownSection {
  readonly key: string;
  readonly values: readonly ShownValue[];
}

/**
 * The fields of a privacy record by section, as field lists: links to other records
 * as record chips (both privacy registers and other modules), countries by name,
 * empty values as "Ikke satt", and Art. 30 facts that are still missing flagged with a
 * warning dot (`id="field-<key>"` so the completeness meter can jump to them).
 */
@Component({
  selector: 'app-privacy-record-fields',
  imports: [TranslocoPipe, EntityChip, Card, FieldItem, FieldList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (section of sections(); track section.key) {
      <app-card [attr.data-section]="section.key">
        <h2 class="mb-3 font-display text-card font-bold text-fg">
          {{ 'privacy.form.sections.' + section.key | transloco }}
        </h2>
        <app-field-list>
          @for (v of section.values; track v.key) {
            <app-field-item
              [id]="'field-' + v.key"
              [labelKey]="v.labelKey"
              [value]="v.chips.length || v.missing ? null : v.text"
              [wide]="v.wide"
              [multiline]="v.multiline"
              [attr.data-value]="v.key"
            >
              @if (v.chips.length) {
                <span class="flex flex-wrap gap-1.5">
                  @for (c of v.chips; track c.entity_id) {
                    <app-entity-chip [ref]="c" />
                  }
                </span>
              } @else if (v.missing) {
                <span
                  class="inline-flex items-center gap-1.5 text-warn-ink"
                  [attr.data-testid]="'missing-' + v.key"
                >
                  <span class="h-2 w-2 flex-none rounded-full bg-warn" aria-hidden="true"></span>
                  {{ 'privacy.detail.missingArt30' | transloco }}
                </span>
              }
            </app-field-item>
          }
        </app-field-list>
      </app-card>
    }
  `,
})
export class PrivacyRecordFields {
  private readonly language = inject(LanguageService);
  private readonly refs = inject(PrivacyRefsService);

  readonly register = input.required<RegisterDef>();
  readonly record = input.required<PrivacyRecord>();
  /** Field keys to leave out (shown by a panel of the page). */
  readonly skip = input<readonly string[]>([]);

  protected readonly sections = computed<readonly ShownSection[]>(() => {
    const def = this.register();
    const r = this.record() as unknown as Record<string, unknown>;
    const skip = new Set(this.skip());
    const missing = new Set(
      def.key === 'ropa' ? ((this.record() as RopaEntry).completeness?.missing ?? []) : [],
    );
    const sections: ShownSection[] = [];
    const facts = def.facts
      .filter(
        (f) => !skip.has(f.key) && r[f.key] !== null && r[f.key] !== undefined && r[f.key] !== '',
      )
      .map((f) => this.showFact(f, r[f.key]));
    if (facts.length) {
      sections.push({ key: 'facts', values: facts });
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
        (f.showIf && !f.showIf(r))
      ) {
        continue;
      }
      const shown = this.showField(f, r[f.key], missing.has(f.key));
      if (HIDE_WHEN_EMPTY.has(f.key) && shown.text === null && !shown.chips.length) {
        continue;
      }
      if (!grouped.has(f.section)) {
        grouped.set(f.section, []);
        order.push(f.section);
      }
      grouped.get(f.section)!.push(shown);
    }
    for (const key of order) {
      sections.push({ key, values: grouped.get(key)! });
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
      missing: false,
    };
  }

  private showField(f: FieldDef, value: unknown, missing: boolean): ShownValue {
    const base = {
      key: f.key,
      labelKey: fieldLabelKey(f),
      wide: !!f.wide || f.kind === 'textarea',
      multiline: f.kind === 'textarea',
      missing,
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
        missing: missing && !ids.length,
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
        missing: missing && !ids.length,
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
    const text = this.formatField(f, value);
    return { ...base, text, chips: [], missing: missing && text === null };
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
