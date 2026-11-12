import { FormBuilder } from '@angular/forms';
import { OrgModule, emptyProfile } from '../../core/modules/module.models';
import { filterModules } from './modules-settings/modules-settings';
import {
  countriesValidator,
  createProfileForm,
  parseCountries,
  patchProfileForm,
  readProfileForm,
} from './profile/profile-form';
import {
  dueAt,
  firstTasksFor,
  initialSelection,
  moduleChoices,
  nextStep,
  previousStep,
  resumeStep,
} from './setup/setup-steps';
import { buildTermsForm, readTermsForm } from './terminology/terminology-form';

function mod(key: string, enabled: boolean, extra: Partial<OrgModule> = {}): OrgModule {
  return {
    key,
    name_key: `modules.names.${key}`,
    description_key: `modules.descriptions.${key}`,
    portal_path: key,
    enabled,
    always_on: false,
    depends_on: [],
    frameworks: [],
    required_by: [],
    ...extra,
  };
}

describe('setup steps', () => {
  it('resumes at the saved step of an unfinished setup', () => {
    expect(resumeStep(null)).toBe('profile');
    expect(resumeStep({ completed_at: null, step: 'modules' })).toBe('modules');
    expect(resumeStep({ completed_at: null, step: 'bogus' })).toBe('profile');
    expect(resumeStep({ completed_at: null, step: 'done' })).toBe('profile');
    // A completed setup is being re-run from the start.
    expect(resumeStep({ completed_at: '2026-11-01T00:00:00', step: 'done' })).toBe('profile');
  });

  it('moves forward and back within bounds', () => {
    expect(nextStep('profile')).toBe('frameworks');
    expect(nextStep('done')).toBe('done');
    expect(previousStep('profile')).toBe('profile');
    expect(previousStep('tasks')).toBe('roles');
  });

  it('merges recommendations with the module list, recommended first', () => {
    const choices = moduleChoices(
      [
        { key: 'risk', recommended: false, reason_key: 'modules.reasons.risk', frameworks: [] },
        { key: 'audits', recommended: true, reason_key: 'modules.reasons.audits', frameworks: [] },
        { key: 'tasks', recommended: true, reason_key: 'modules.reasons.tasks', frameworks: [] },
        { key: 'documents', recommended: false, reason_key: 'x', frameworks: [] },
      ],
      [
        mod('documents', true),
        mod('tasks', true, { always_on: true }),
        mod('audits', false, { depends_on: ['documents'] }),
      ],
    );
    expect(choices.map((c) => c.key)).toEqual(['audits', 'documents', 'risk']);
    expect(choices[0].dependsOn).toEqual(['documents']);
    expect([...initialSelection(choices)].sort()).toEqual(['audits', 'documents']);
  });

  it('suggests first tasks for the chosen modules only', () => {
    const ids = firstTasksFor(new Set(['documents'])).map((t) => t.id);
    expect(ids).toContain('policy');
    expect(ids).toContain('inviteTeam');
    expect(ids).not.toContain('risk');
  });

  it('formats a naive-UTC due date', () => {
    expect(dueAt(7, new Date(Date.UTC(2026, 10, 12, 8)))).toBe('2026-11-19T12:00:00');
  });
});

describe('profile form', () => {
  const fb = new FormBuilder();

  it('parses and validates country codes', () => {
    expect(parseCountries(' no, se;DK  no ')).toEqual(['NO', 'SE', 'DK']);
    const form = createProfileForm(fb);
    form.controls.countries.setValue('NO, Norway');
    expect(countriesValidator(form.controls.countries)).toEqual({ countries: true });
    form.controls.countries.setValue('no se');
    expect(countriesValidator(form.controls.countries)).toBeNull();
  });

  it('round-trips a profile', () => {
    const profile = {
      ...emptyProfile('org'),
      industry: 'Food production',
      size_band: '51-250' as const,
      countries: ['NO', 'SE'],
      frameworks: ['iso9001', 'gdpr'],
      ai_act_role: 'deployer' as const,
      description: 'We make food.',
      sites: [{ name: 'Plant', country: 'NO', city: 'Oslo', kind: null }],
      certification_targets: [
        {
          framework: 'iso9001',
          target_date: '2027-06-01',
          certification_body: null,
          status: 'planned' as const,
        },
      ],
    };
    const form = createProfileForm(fb);
    patchProfileForm(fb, form, profile);
    expect(form.controls.sites.length).toBe(1);
    expect(readProfileForm(form)).toEqual({
      industry: 'Food production',
      size_band: '51-250',
      countries: ['NO', 'SE'],
      sites: [{ name: 'Plant', country: 'NO', city: 'Oslo', kind: null }],
      frameworks: ['iso9001', 'gdpr'],
      certification_targets: [
        {
          framework: 'iso9001',
          target_date: '2027-06-01',
          certification_body: null,
          status: 'planned',
        },
      ],
      ai_act_role: 'deployer',
      description: 'We make food.',
    });
  });

  it('sends blanks as null', () => {
    const form = createProfileForm(fb);
    form.controls.industry.setValue('   ');
    const value = readProfileForm(form);
    expect(value.industry).toBeNull();
    expect(value.size_band).toBeNull();
    expect(value.countries).toEqual([]);
  });
});

describe('terminology form', () => {
  const fb = new FormBuilder();

  it('reads only languages with both forms, trimmed', () => {
    const form = buildTermsForm(fb, ['deviation', 'risk'], {
      deviation: { en: { one: 'nonconformity', other: 'nonconformities' } },
    });
    form.controls['deviation'].controls.nb_one.setValue(' uoverensstemmelse ');
    form.controls['deviation'].controls.nb_other.setValue('uoverensstemmelser');
    expect(readTermsForm(form)).toEqual({
      deviation: {
        en: { one: 'nonconformity', other: 'nonconformities' },
        nb: { one: 'uoverensstemmelse', other: 'uoverensstemmelser' },
      },
    });
  });

  it('flags a language with only one form', () => {
    const form = buildTermsForm(fb, ['risk'], {});
    form.controls['risk'].controls.en_one.setValue('hazard');
    expect(form.controls['risk'].hasError('incomplete')).toBe(true);
    form.controls['risk'].controls.en_other.setValue('hazards');
    expect(form.controls['risk'].valid).toBe(true);
  });
});

describe('filterModules', () => {
  const modules = [
    mod('risk', true, { frameworks: ['iso27001'] }),
    mod('audits', false, { frameworks: ['iso9001'] }),
  ];
  const text = (m: OrgModule) => `${m.key} name`;

  it('filters by status, framework and query', () => {
    const run = (status: 'all' | 'enabled' | 'disabled', framework = '', query = '') =>
      filterModules(modules, { status, framework, query, text }).map((m) => m.key);
    expect(run('all')).toEqual(['risk', 'audits']);
    expect(run('enabled')).toEqual(['risk']);
    expect(run('disabled')).toEqual(['audits']);
    expect(run('all', 'iso9001')).toEqual(['audits']);
    expect(run('all', '', 'RIS')).toEqual(['risk']);
  });
});
