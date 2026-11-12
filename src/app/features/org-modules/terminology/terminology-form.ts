import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormRecord,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { TERM_LANGS, TermOverride, TermOverrides } from '../../../core/modules/module.models';

/** The four inputs of one term row. */
export interface TermRowValue {
  readonly en_one: string;
  readonly en_other: string;
  readonly nb_one: string;
  readonly nb_other: string;
}

/** Group validator: per language, both forms or neither. */
export function bothFormsValidator(group: AbstractControl): ValidationErrors | null {
  const value = group.value as TermRowValue;
  const incomplete = TERM_LANGS.filter((lang) => {
    const one = value[`${lang}_one`]?.trim() ?? '';
    const other = value[`${lang}_other`]?.trim() ?? '';
    return !!one !== !!other;
  });
  return incomplete.length ? { incomplete: incomplete } : null;
}

export function termRow(fb: FormBuilder, override: TermOverride | undefined) {
  const field = (value: string | undefined) => [value ?? '', [Validators.maxLength(64)]];
  return fb.nonNullable.group(
    {
      en_one: field(override?.en?.one),
      en_other: field(override?.en?.other),
      nb_one: field(override?.nb?.one),
      nb_other: field(override?.nb?.other),
    },
    { validators: [bothFormsValidator] },
  );
}

export type TermRow = ReturnType<typeof termRow>;

/** One row per term key, prefilled with the org's overrides. */
export function buildTermsForm(
  fb: FormBuilder,
  keys: readonly string[],
  overrides: TermOverrides,
): FormRecord<TermRow> {
  const record = fb.record<TermRow>({});
  for (const key of keys) {
    record.addControl(key, termRow(fb, overrides[key]));
  }
  return record;
}

/** The `PUT /terminology` body: only languages with both forms filled, trimmed. */
export function readTermsForm(form: FormRecord<FormGroup>): TermOverrides {
  const result: Record<string, TermOverride> = {};
  for (const [key, control] of Object.entries(form.controls)) {
    const value = control.getRawValue() as TermRowValue;
    const override: { -readonly [L in keyof TermOverride]: TermOverride[L] } = {};
    for (const lang of TERM_LANGS) {
      const one = value[`${lang}_one`].trim();
      const other = value[`${lang}_other`].trim();
      if (one && other) {
        override[lang] = { one, other };
      }
    }
    if (Object.keys(override).length) {
      result[key] = override;
    }
  }
  return result;
}
