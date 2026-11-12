import en from '../../../assets/i18n/en.json';
import nb from '../../../assets/i18n/nb.json';
import scopedEn from '../../../assets/i18n/modules/en.json';
import scopedNb from '../../../assets/i18n/modules/nb.json';
import {
  AI_ACT_ROLES,
  CERTIFICATION_STATUSES,
  FRAMEWORK_KEYS,
  SIZE_BANDS,
} from '../../core/modules/module.models';
import { TERM_KEYS } from '../../core/modules/terminology-transpiler';
import { ROLE_KEYS } from '../../core/org/roles';
import { MODULE_NAV_ITEMS, NAV_ITEMS, NAV_SECTIONS } from '../../layout/nav';
import { SETTINGS_LINKS } from '../org-settings/settings-links/settings-links';
import { GUIDE_CLAUSES, clauseFramework } from './frameworks';
import { FIRST_TASKS, SETUP_STEPS } from './setup/setup-steps';

type Dict = Record<string, unknown>;

/** Every leaf path of a translation object. */
function leaves(value: unknown, prefix = ''): string[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Dict).flatMap(([key, child]) =>
      leaves(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

function get(dict: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node as Dict | undefined)?.[key], dict);
}

/** Global + scoped (under the `modules` alias) translations of one language. */
function merged(global: Dict, scoped: Dict): Dict {
  return { ...global, modules: { ...(global['modules'] as Dict), ...scoped } };
}

const LANGS: Record<string, Dict> = {
  en: merged(en as Dict, scopedEn as Dict),
  nb: merged(nb as Dict, scopedNb as Dict),
};

/** Module keys of every nav item, plus the platform's `tasks` module. */
const MODULE_KEYS = [...MODULE_NAV_ITEMS.map((item) => item.module), 'tasks'];

/** Every entity type of contracts §1.2 plus the platform ones. */
const ENTITY_TYPES = [
  'document',
  'deviation',
  'deviation_action',
  'standard',
  'attachment',
  'organization',
  'org_module',
  'task',
  'context_analysis',
  'interested_party',
  'scope_statement',
  'policy',
  'responsibility',
  'process',
  'risk',
  'risk_treatment',
  'opportunity',
  'risk_matrix',
  'soa_entry',
  'checklist_template',
  'inspection',
  'inspection_finding',
  'audit_programme',
  'audit_plan',
  'audit_finding',
  'management_review',
  'meeting',
  'objective',
  'kpi',
  'employee',
  'position',
  'competence',
  'job_requisition',
  'candidate',
  'job_application',
  'course',
  'training_assignment',
  'training_record',
  'contract',
  'supplier',
  'supplier_evaluation',
  'project',
  'project_milestone',
  'ropa_entry',
  'dpia',
  'data_subject_request',
  'data_breach',
  'processor',
  'transfer_assessment',
  'ai_system',
  'ai_assessment',
  'env_aspect',
  'emergency_plan',
  'env_measurement',
  'compliance_obligation',
  'asset',
  'access_review',
  'change_request',
  'calibration',
  'bia',
  'continuity_plan',
  'continuity_exercise',
  'sja',
  'ppe_item',
  'worker_consultation',
  'customer_feedback',
  'survey',
  'report_definition',
  'audit_pack',
  'document_type',
  'external_document',
  'distribution_campaign',
];

describe('F1 i18n', () => {
  it('keeps the modules scope at full en/nb key parity', () => {
    expect(leaves(scopedNb).sort()).toEqual(leaves(scopedEn).sort());
  });

  it('keeps the global modules / terms / nav / roles blocks at parity', () => {
    for (const block of ['modules', 'terms', 'nav', 'roles']) {
      expect(leaves((nb as Dict)[block]).sort()).toEqual(leaves((en as Dict)[block]).sort());
    }
  });

  it('has no key collisions between the global modules block and the scope', () => {
    const global = Object.keys((en as Dict)['modules'] as Dict);
    const scoped = Object.keys(scopedEn as Dict);
    expect(global.filter((key) => scoped.includes(key))).toEqual([]);
  });

  for (const [lang, dict] of Object.entries(LANGS)) {
    describe(lang, () => {
      const has = (path: string) => {
        const value = get(dict, path);
        expect(typeof value === 'string' && value.length > 0, `${lang}: ${path}`).toBe(true);
      };

      it('labels every nav item and section', () => {
        NAV_SECTIONS.forEach((section) => has(section.labelKey));
        NAV_ITEMS.forEach((item) => has(item.labelKey));
      });

      it('names, describes and explains every module', () => {
        for (const key of MODULE_KEYS) {
          has(`modules.names.${key}`);
          has(`modules.descriptions.${key}`);
          has(`modules.reasons.${key}`);
        }
      });

      it('labels every entity type', () => {
        ENTITY_TYPES.forEach((type) => has(`modules.entities.${type}`));
      });

      it('has default forms for every base term', () => {
        for (const key of TERM_KEYS) {
          has(`terms.${key}.one`);
          has(`terms.${key}.other`);
        }
      });

      it('labels the option lists, roles, steps and links', () => {
        FRAMEWORK_KEYS.forEach((fw) => {
          has(`modules.frameworks.${fw}.name`);
          has(`modules.frameworks.${fw}.short`);
          has(`modules.frameworks.${fw}.description`);
        });
        Object.values(GUIDE_CLAUSES)
          .flat()
          .forEach((ref) => has(`modules.frameworks.${clauseFramework(ref)}.short`));
        SIZE_BANDS.forEach((band) => has(`modules.sizeBands.${band}`));
        AI_ACT_ROLES.forEach((role) => {
          has(`modules.aiActRoles.${role}.name`);
          has(`modules.aiActRoles.${role}.description`);
        });
        CERTIFICATION_STATUSES.forEach((status) => has(`modules.certificationStatus.${status}`));
        ROLE_KEYS.forEach((role) => {
          has(`roles.${role}.name`);
          has(`roles.${role}.description`);
        });
        SETUP_STEPS.forEach((step) => {
          has(`modules.setup.steps.${step}`);
          has(`modules.setup.${step}.title`);
          has(`modules.setup.${step}.body`);
        });
        FIRST_TASKS.forEach((task) => {
          has(`modules.setup.tasks.items.${task.id}.title`);
          has(`modules.setup.tasks.items.${task.id}.description`);
        });
        SETTINGS_LINKS.forEach((link) => {
          has(link.labelKey);
          has(link.hintKey);
        });
      });

      it('has the guidance for every F1 page', () => {
        for (const page of ['modules', 'profile', 'terminology', 'setup']) {
          has(`modules.guide.pages.${page}.intro.title`);
          has(`modules.guide.pages.${page}.intro.body`);
          ['s1', 's2', 's3'].forEach((s) => has(`modules.guide.pages.${page}.intro.steps.${s}`));
          has(`modules.guide.pages.${page}.why.body`);
        }
      });

      it('has the event kind keys the backend registers', () => {
        for (const name of ['profileUpdated', 'terminologyUpdated', 'setupCompleted']) {
          has(`modules.notifications.${name}`);
          has(`modules.timeline.${name}`);
        }
      });

      it('never names a vendor or model', () => {
        const text = JSON.stringify([dict['modules'], dict['terms'], dict['nav']]);
        expect(text).not.toMatch(/claude|anthropic|openai|\bgpt\b|gemini/i);
      });
    });
  }
});
