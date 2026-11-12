import {
  FRAMEWORK_KEYS,
  clauseKindKey,
  entityTypeLabelKey,
  groupMappings,
  mergeFrameworks,
  metaChips,
  openSuggestions,
  readinessParts,
  sharePct,
  suggestionText,
  suggestionTitle,
} from './frameworks-data';
import {
  ClauseMappingItem,
  EvidenceSuggestion,
  FrameworkReadiness,
  FrameworkSummary,
  StandardSummary,
} from './standards.models';

function standard(over: Partial<StandardSummary> = {}): StandardSummary {
  return {
    key: 'iso9001-2026',
    name: 'ISO 9001',
    edition: '2026',
    enabled: true,
    org_standard_id: null,
    has_licensed_text: false,
    completeness: {
      applicable: 10,
      covered: 5,
      partial: 0,
      not_started: 5,
      not_applicable: 0,
      pct: 50,
    },
    ...over,
  };
}

function framework(over: Partial<FrameworkSummary> = {}): FrameworkSummary {
  return {
    framework: 'iso9001',
    standard_key: 'iso9001-2026',
    name: 'ISO 9001',
    kind: 'standard',
    enabled: true,
    in_profile: false,
    readiness: 40,
    ...over,
  };
}

function readiness(over: Partial<FrameworkReadiness> = {}): FrameworkReadiness {
  return {
    framework: 'iso9001',
    standard_key: 'iso9001-2026',
    applicable: 10,
    covered: 5,
    partial: 2,
    fresh: 3,
    score: 52,
    ...over,
  };
}

function mapping(over: Partial<ClauseMappingItem> = {}): ClauseMappingItem {
  return {
    relation: 'related',
    standard_key: 'gdpr-2016',
    framework: 'gdpr',
    number: '32',
    title: { en: 'Security of processing', nb: 'Sikkerhet ved behandlingen' },
    note: null,
    source: 'curated',
    ...over,
  };
}

function suggestion(over: Partial<EvidenceSuggestion> = {}): EvidenceSuggestion {
  return {
    ref: 'iso9001-2026:7.5.1.r1',
    standard_key: 'iso9001-2026',
    number: '7.5.1',
    title: 'General',
    title_nb: 'Generelt',
    text: { en: 'Keep documented information', nb: 'Ha dokumentert informasjon' },
    link_status: null,
    ...over,
  };
}

describe('frameworks-data', () => {
  it('lists the framework keys in the backend order', () => {
    expect(FRAMEWORK_KEYS).toEqual([
      'iso9001',
      'iso27001',
      'iso14001',
      'iso42001',
      'iso45001',
      'gdpr',
      'eu_ai_act',
      'nis2',
    ]);
  });

  describe('mergeFrameworks', () => {
    it('merges frameworks, standards and readiness in framework order', () => {
      const views = mergeFrameworks(
        [
          framework({
            framework: 'gdpr',
            standard_key: 'gdpr-2016',
            name: 'GDPR',
            kind: 'regulation',
            enabled: false,
            in_profile: true,
            readiness: null,
          }),
          framework(),
        ],
        [standard(), standard({ key: 'gdpr-2016', name: 'GDPR (EU) 2016/679', enabled: false })],
        [readiness()],
      );
      expect(views.map((v) => v.standardKey)).toEqual(['iso9001-2026', 'gdpr-2016']);
      // The readiness breakdown wins over the summary score.
      expect(views[0]).toMatchObject({ readiness: 52, enabled: true, kind: 'standard' });
      expect(views[0].breakdown?.fresh).toBe(3);
      // Not enabled: no score; the standards name is preferred; profile flag kept.
      expect(views[1]).toMatchObject({
        name: 'GDPR (EU) 2016/679',
        kind: 'regulation',
        enabled: false,
        inProfile: true,
        readiness: null,
        breakdown: null,
      });
    });

    it('trusts the standards list for enablement (it is reloaded after a toggle)', () => {
      const [view] = mergeFrameworks(
        [framework({ enabled: true })],
        [standard({ enabled: false })],
        [],
      );
      expect(view.enabled).toBe(false);
      expect(view.readiness).toBeNull();
    });

    it('falls back to the standards alone when the frameworks call failed', () => {
      const views = mergeFrameworks(
        null,
        [
          standard({ key: 'nis2-2022', name: 'NIS2', framework: 'nis2', kind: 'regulation' }),
          standard({ key: 'custom', name: 'Custom', framework: null }),
          standard({ key: 'iso27001-2022', name: 'ISO 27001', framework: 'iso27001' }),
        ],
        [],
      );
      expect(views.map((v) => v.standardKey)).toEqual(['iso27001-2022', 'nis2-2022', 'custom']);
      expect(views[1].kind).toBe('regulation');
      expect(views[2].kind).toBe('standard');
      expect(views.every((v) => v.readiness === null && !v.inProfile)).toBe(true);
    });
  });

  it('splits readiness into fresh, older, partial and missing', () => {
    expect(readinessParts(readiness())).toEqual({ fresh: 3, stale: 2, partial: 2, missing: 3 });
    // Defensive against inconsistent counts.
    expect(readinessParts(readiness({ covered: 2, fresh: 5, partial: 0, applicable: 1 }))).toEqual({
      fresh: 2,
      stale: 0,
      partial: 0,
      missing: 0,
    });
  });

  it('computes shares without dividing by zero', () => {
    expect(sharePct(1, 3)).toBe(33);
    expect(sharePct(0, 0)).toBe(0);
  });

  it('groups mappings by relation, equivalent first', () => {
    const groups = groupMappings([
      mapping({ relation: 'supports', number: '30' }),
      mapping({
        relation: 'equivalent',
        source: 'hs',
        standard_key: 'iso27001-2022',
        number: '6.1',
      }),
      mapping({ relation: 'related' }),
    ]);
    expect(groups.map((g) => g.relation)).toEqual(['equivalent', 'related', 'supports']);
    expect(groups[0].items[0].number).toBe('6.1');
  });

  it('maps clause kinds to badge keys', () => {
    expect(clauseKindKey('clause')).toBeNull();
    expect(clauseKindKey('annex_control')).toBe('standards.clause.control');
    expect(clauseKindKey('article')).toBe('standards.kinds.article');
    expect(clauseKindKey('recital')).toBe('standards.kinds.recital');
    expect(clauseKindKey('annex')).toBe('standards.kinds.annex');
  });

  it('turns AI Act meta into role and risk-class chips', () => {
    expect(metaChips(null)).toEqual({ roles: [], riskClasses: [] });
    const chips = metaChips({ roles: ['provider'], risk_classes: ['high'] });
    expect(chips.roles).toEqual([{ value: 'provider', key: 'standards.aiAct.roles.provider' }]);
    expect(chips.riskClasses).toEqual([{ value: 'high', key: 'standards.aiAct.riskClasses.high' }]);
  });

  it('labels built-in record kinds locally and module kinds via the platform labels', () => {
    expect(entityTypeLabelKey('document')).toBe('standards.entity.document');
    expect(entityTypeLabelKey('deviation_action')).toBe('standards.entity.deviation_action');
    expect(entityTypeLabelKey('risk')).toBe('modules.entities.risk');
  });

  it('localises suggestions with fallbacks', () => {
    expect(suggestionTitle(suggestion(), 'nb')).toBe('Generelt');
    expect(suggestionTitle(suggestion({ title_nb: null }), 'nb')).toBe('General');
    expect(suggestionTitle(suggestion(), 'en')).toBe('General');
    expect(suggestionText(suggestion({ text: { en: 'Only English' } }), 'nb')).toBe('Only English');
  });

  it('offers only suggestions that are not linked yet', () => {
    const open = openSuggestions(
      [
        suggestion({ ref: 'a' }),
        suggestion({ ref: 'b', link_status: 'rejected' }),
        suggestion({ ref: 'c', link_status: 'suggested' }),
        suggestion({ ref: 'd' }),
      ],
      new Set(['d']),
    );
    expect(open.map((s) => s.ref)).toEqual(['a']);
  });
});
