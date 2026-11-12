import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  AI_ACT_ROLES,
  AiActRole,
  CertificationStatus,
  FRAMEWORK_KEYS,
  OrgProfileUpdate,
  SIZE_BANDS,
  SizeBand,
} from '../../../core/modules/module.models';

const COUNTRY = /^[A-Za-z]{2}$/;

/** Splits "no, se  DK" into upper-cased, de-duplicated alpha-2 codes. */
export function parseCountries(value: string): string[] {
  const codes = value
    .split(/[\s,;]+/)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(codes)];
}

/** Validator: every token is a two-letter country code. */
export function countriesValidator(control: AbstractControl<string>): ValidationErrors | null {
  const tokens = (control.value ?? '').split(/[\s,;]+/).filter(Boolean);
  return tokens.every((token) => COUNTRY.test(token)) ? null : { countries: true };
}

function countryCode(control: AbstractControl<string>): ValidationErrors | null {
  const value = (control.value ?? '').trim();
  return COUNTRY.test(value) ? null : { country: true };
}

export function siteGroup(fb: FormBuilder) {
  return fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    country: ['', [countryCode]],
    city: ['', [Validators.maxLength(200)]],
    kind: ['', [Validators.maxLength(64)]],
  });
}

export function targetGroup(fb: FormBuilder) {
  return fb.nonNullable.group({
    framework: [FRAMEWORK_KEYS[0] as string, [Validators.required]],
    target_date: [''],
    certification_body: ['', [Validators.maxLength(200)]],
    status: ['planned' as CertificationStatus],
  });
}

export type SiteGroup = ReturnType<typeof siteGroup>;
export type TargetGroup = ReturnType<typeof targetGroup>;

/** The profile form: one control per editable field (frameworks as a boolean per key). */
export function createProfileForm(fb: FormBuilder) {
  const frameworks: Record<string, boolean> = {};
  for (const key of FRAMEWORK_KEYS) {
    frameworks[key] = false;
  }
  return fb.nonNullable.group({
    industry: ['', [Validators.maxLength(64)]],
    size_band: ['' as SizeBand | ''],
    countries: ['', [countriesValidator]],
    ai_act_role: ['unknown' as AiActRole],
    description: ['', [Validators.maxLength(5000)]],
    frameworks: fb.nonNullable.group(frameworks),
    sites: fb.array<SiteGroup>([]),
    certification_targets: fb.array<TargetGroup>([]),
  });
}

export type ProfileForm = ReturnType<typeof createProfileForm>;

/** Fill the form from a profile (rebuilding the site / target rows). */
export function patchProfileForm(
  fb: FormBuilder,
  form: ProfileForm,
  profile: OrgProfileUpdate,
): void {
  const frameworks: Record<string, boolean> = {};
  for (const key of FRAMEWORK_KEYS) {
    frameworks[key] = profile.frameworks.includes(key);
  }
  form.patchValue({
    industry: profile.industry ?? '',
    size_band: profile.size_band && SIZE_BANDS.includes(profile.size_band) ? profile.size_band : '',
    countries: profile.countries.join(', '),
    ai_act_role: AI_ACT_ROLES.includes(profile.ai_act_role) ? profile.ai_act_role : 'unknown',
    description: profile.description ?? '',
    frameworks,
  });
  resetArray(form.controls.sites, profile.sites.length, () => siteGroup(fb));
  form.controls.sites.patchValue(
    profile.sites.map((site) => ({
      name: site.name,
      country: site.country,
      city: site.city ?? '',
      kind: site.kind ?? '',
    })),
  );
  resetArray(form.controls.certification_targets, profile.certification_targets.length, () =>
    targetGroup(fb),
  );
  form.controls.certification_targets.patchValue(
    profile.certification_targets.map((target) => ({
      framework: target.framework,
      target_date: target.target_date ?? '',
      certification_body: target.certification_body ?? '',
      status: target.status,
    })),
  );
}

function resetArray<T extends FormGroup>(array: FormArray<T>, length: number, make: () => T): void {
  array.clear();
  for (let i = 0; i < length; i++) {
    array.push(make());
  }
}

const blank = (value: string): string | null => (value.trim() ? value.trim() : null);

/** The selected framework keys, in catalogue order. */
export function selectedFrameworks(form: ProfileForm): string[] {
  const value = form.controls.frameworks.getRawValue() as Record<string, boolean>;
  return FRAMEWORK_KEYS.filter((key) => value[key]);
}

/** The `PUT /profile` body from the form. */
export function readProfileForm(form: ProfileForm): OrgProfileUpdate {
  const v = form.getRawValue();
  return {
    industry: blank(v.industry),
    size_band: v.size_band || null,
    countries: parseCountries(v.countries),
    ai_act_role: v.ai_act_role,
    description: blank(v.description),
    frameworks: selectedFrameworks(form),
    sites: v.sites.map((site) => ({
      name: site.name.trim(),
      country: site.country.trim().toUpperCase(),
      city: blank(site.city),
      kind: blank(site.kind),
    })),
    certification_targets: v.certification_targets.map((target) => ({
      framework: target.framework,
      target_date: target.target_date || null,
      certification_body: blank(target.certification_body),
      status: target.status,
    })),
  };
}
