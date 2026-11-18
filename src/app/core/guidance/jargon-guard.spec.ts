import jargon from '../../../testing/jargon-terms.json';
import glossaryEn from '../../../assets/guidance/en/glossary.json';
import glossaryNb from '../../../assets/guidance/nb/glossary.json';
import aiGovernanceNb from '../../../assets/guidance/nb/ai-governance.json';
import assetsNb from '../../../assets/guidance/nb/assets.json';
import auditsNb from '../../../assets/guidance/nb/audits.json';
import contextNb from '../../../assets/guidance/nb/context.json';
import continuityNb from '../../../assets/guidance/nb/continuity.json';
import contractsNb from '../../../assets/guidance/nb/contracts.json';
import deviationsNb from '../../../assets/guidance/nb/deviations.json';
import documentsNb from '../../../assets/guidance/nb/documents.json';
import environmentNb from '../../../assets/guidance/nb/environment.json';
import feedbackNb from '../../../assets/guidance/nb/feedback.json';
import hseNb from '../../../assets/guidance/nb/hse.json';
import inspectionsNb from '../../../assets/guidance/nb/inspections.json';
import kitNb from '../../../assets/guidance/nb/kit.json';
import managementReviewNb from '../../../assets/guidance/nb/management-review.json';
import objectivesNb from '../../../assets/guidance/nb/objectives.json';
import obligationsNb from '../../../assets/guidance/nb/obligations.json';
import peopleNb from '../../../assets/guidance/nb/people.json';
import platformNb from '../../../assets/guidance/nb/platform.json';
import privacyNb from '../../../assets/guidance/nb/privacy.json';
import processesNb from '../../../assets/guidance/nb/processes.json';
import projectsNb from '../../../assets/guidance/nb/projects.json';
import recordsNb from '../../../assets/guidance/nb/records.json';
import recruitmentNb from '../../../assets/guidance/nb/recruitment.json';
import reportsNb from '../../../assets/guidance/nb/reports.json';
import riskNb from '../../../assets/guidance/nb/risk.json';
import searchNb from '../../../assets/guidance/nb/search.json';
import settingsNb from '../../../assets/guidance/nb/settings.json';
import standardsNb from '../../../assets/guidance/nb/standards.json';
import suppliersNb from '../../../assets/guidance/nb/suppliers.json';
import tasksNb from '../../../assets/guidance/nb/tasks.json';
import trainingNb from '../../../assets/guidance/nb/training.json';
import aiGovernanceEn from '../../../assets/guidance/en/ai-governance.json';
import assetsEn from '../../../assets/guidance/en/assets.json';
import auditsEn from '../../../assets/guidance/en/audits.json';
import contextEn from '../../../assets/guidance/en/context.json';
import continuityEn from '../../../assets/guidance/en/continuity.json';
import contractsEn from '../../../assets/guidance/en/contracts.json';
import deviationsEn from '../../../assets/guidance/en/deviations.json';
import documentsEn from '../../../assets/guidance/en/documents.json';
import environmentEn from '../../../assets/guidance/en/environment.json';
import feedbackEn from '../../../assets/guidance/en/feedback.json';
import hseEn from '../../../assets/guidance/en/hse.json';
import inspectionsEn from '../../../assets/guidance/en/inspections.json';
import kitEn from '../../../assets/guidance/en/kit.json';
import managementReviewEn from '../../../assets/guidance/en/management-review.json';
import objectivesEn from '../../../assets/guidance/en/objectives.json';
import obligationsEn from '../../../assets/guidance/en/obligations.json';
import peopleEn from '../../../assets/guidance/en/people.json';
import platformEn from '../../../assets/guidance/en/platform.json';
import privacyEn from '../../../assets/guidance/en/privacy.json';
import processesEn from '../../../assets/guidance/en/processes.json';
import projectsEn from '../../../assets/guidance/en/projects.json';
import recordsEn from '../../../assets/guidance/en/records.json';
import recruitmentEn from '../../../assets/guidance/en/recruitment.json';
import reportsEn from '../../../assets/guidance/en/reports.json';
import riskEn from '../../../assets/guidance/en/risk.json';
import searchEn from '../../../assets/guidance/en/search.json';
import settingsEn from '../../../assets/guidance/en/settings.json';
import standardsEn from '../../../assets/guidance/en/standards.json';
import suppliersEn from '../../../assets/guidance/en/suppliers.json';
import tasksEn from '../../../assets/guidance/en/tasks.json';
import trainingEn from '../../../assets/guidance/en/training.json';
import { parseTermTokens } from './term-tokens';

/*
 * Simplify U39 jargon guard. Every intro (body and steps) in every guidance file, in both
 * languages, may use a listed jargon word (src/testing/jargon-terms.json, from the beginner
 * glossary in simplify/comprehension.md §5) or an abbreviation only inside a term token
 * `[[key|word]]`: <app-guidance-text> renders the token as <app-term> (hover shows the
 * definition) and beginners see the plain words with it. Words inside a capitalised
 * UI label mid-sentence (`**Avvik**`, «Krever handling») are names of screens and buttons
 * and are not checked; abbreviations are always checked.
 */

type Lang = 'nb' | 'en';

/** The part of a guidance file the guard reads. */
interface IntroPage {
  readonly intro?: { readonly body: string; readonly steps?: readonly string[] };
  readonly [other: string]: unknown;
}

interface IntroFile {
  readonly pages?: Readonly<Record<string, IntroPage>>;
}

interface GlossaryFile {
  readonly glossary: Readonly<
    Record<string, { readonly beginner?: string; readonly [other: string]: unknown }>
  >;
}

const FILES: Record<Lang, Record<string, IntroFile>> = {
  nb: {
    'ai-governance': aiGovernanceNb,
    assets: assetsNb,
    audits: auditsNb,
    context: contextNb,
    continuity: continuityNb,
    contracts: contractsNb,
    deviations: deviationsNb,
    documents: documentsNb,
    environment: environmentNb,
    feedback: feedbackNb,
    hse: hseNb,
    inspections: inspectionsNb,
    kit: kitNb,
    'management-review': managementReviewNb,
    objectives: objectivesNb,
    obligations: obligationsNb,
    people: peopleNb,
    platform: platformNb,
    privacy: privacyNb,
    processes: processesNb,
    projects: projectsNb,
    records: recordsNb,
    recruitment: recruitmentNb,
    reports: reportsNb,
    risk: riskNb,
    search: searchNb,
    settings: settingsNb,
    standards: standardsNb,
    suppliers: suppliersNb,
    tasks: tasksNb,
    training: trainingNb,
  },
  en: {
    'ai-governance': aiGovernanceEn,
    assets: assetsEn,
    audits: auditsEn,
    context: contextEn,
    continuity: continuityEn,
    contracts: contractsEn,
    deviations: deviationsEn,
    documents: documentsEn,
    environment: environmentEn,
    feedback: feedbackEn,
    hse: hseEn,
    inspections: inspectionsEn,
    kit: kitEn,
    'management-review': managementReviewEn,
    objectives: objectivesEn,
    obligations: obligationsEn,
    people: peopleEn,
    platform: platformEn,
    privacy: privacyEn,
    processes: processesEn,
    projects: projectsEn,
    records: recordsEn,
    recruitment: recruitmentEn,
    reports: reportsEn,
    risk: riskEn,
    search: searchEn,
    settings: settingsEn,
    standards: standardsEn,
    suppliers: suppliersEn,
    tasks: tasksEn,
    training: trainingEn,
  },
};

const GLOSSARY: Record<Lang, GlossaryFile> = { nb: glossaryNb, en: glossaryEn };

interface JargonTerm {
  readonly key: string;
  readonly nb: readonly string[];
  readonly en: readonly string[];
}

interface Abbreviation {
  readonly key: string;
  readonly forms: readonly string[];
}

const TERMS = jargon.terms as readonly JargonTerm[];
const ABBREVIATIONS = jargon.abbreviations as readonly Abbreviation[];

const WORD_START = String.raw`(?<![\p{L}\p{N}])`;
const WORD_END = String.raw`(?![\p{L}\p{N}])`;

/** Every intro text of a language: "scope:page" and the body or one step. */
function intros(lang: Lang): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const [scope, file] of Object.entries(FILES[lang])) {
    for (const [page, content] of Object.entries(file.pages ?? {})) {
      const intro = content.intro;
      if (!intro) {
        continue;
      }
      out.push({ where: `${scope}:${page}`, text: intro.body });
      (intro.steps ?? []).forEach((step, i) =>
        out.push({ where: `${scope}:${page}#${i + 1}`, text: step }),
      );
    }
  }
  return out;
}

/** The text without its term tokens (each replaced by spaces, so positions stay). */
function withoutTokens(text: string): string {
  return text.replace(/\[\[[^\]]*\]\]/g, (t) => ' '.repeat(t.length));
}

/** The text without capitalised UI labels mid-sentence (`**Avvik**`, `*Mangler*`, «Krever handling»). */
function withoutLabels(text: string): string {
  return text.replace(
    /(\*\*|\*|«)([^*«»]+?)(\*\*|\*|»)/gu,
    (whole, _open, inner: string, _close, offset: number) => {
      const before = text.slice(0, offset).replace(/\s+$/u, '');
      const sentenceStart = before === '' || /[.!?:]$/u.test(before);
      return /^\p{Lu}/u.test(inner) && !sentenceStart ? ' '.repeat(whole.length) : whole;
    },
  );
}

function unwrappedTerms(lang: Lang, text: string): string[] {
  const plain = withoutLabels(withoutTokens(text));
  const found: string[] = [];
  for (const term of TERMS) {
    for (const pattern of term[lang]) {
      for (const m of plain.matchAll(
        new RegExp(WORD_START + '(?:' + pattern + ')' + WORD_END, 'giu'),
      )) {
        found.push(`${m[0]} → [[${term.key}|${m[0]}]]`);
      }
    }
  }
  return found;
}

function unwrappedAbbreviations(text: string): string[] {
  const plain = withoutTokens(text);
  const found: string[] = [];
  for (const abbr of ABBREVIATIONS) {
    for (const form of abbr.forms) {
      for (const m of plain.matchAll(new RegExp(WORD_START + form + WORD_END, 'gu'))) {
        found.push(`${m[0]} → [[${abbr.key}|${m[0]}]]`);
      }
    }
  }
  return [...new Set(found)];
}

describe('jargon guard (simplify U39)', () => {
  for (const lang of ['nb', 'en'] as const) {
    describe(lang, () => {
      it('beginner intros use listed terms only inside a term token', () => {
        const problems = intros(lang).flatMap(({ where, text }) =>
          unwrappedTerms(lang, text).map((p) => `${where}: ${p}`),
        );
        expect(problems).toEqual([]);
      });

      it('beginner intros never use an unexplained abbreviation', () => {
        const problems = intros(lang).flatMap(({ where, text }) =>
          unwrappedAbbreviations(text).map((p) => `${where}: ${p}`),
        );
        expect(problems).toEqual([]);
      });

      it('every term token names a glossary entry with a beginner form', () => {
        const glossary = GLOSSARY[lang].glossary;
        const problems: string[] = [];
        for (const { where, text } of intros(lang)) {
          for (const seg of parseTermTokens(text)) {
            if (seg.kind === 'term' && !glossary[seg.key]?.beginner) {
              problems.push(`${where}: [[${seg.key}]]`);
            }
          }
          if (/\[\[|\]\]/.test(withoutTokens(text))) {
            problems.push(`${where}: malformed token`);
          }
        }
        expect(problems).toEqual([]);
      });

      it('every listed term and abbreviation has a glossary entry with a beginner form', () => {
        const glossary = GLOSSARY[lang].glossary;
        const keys = [...TERMS.map((t) => t.key), ...ABBREVIATIONS.map((a) => a.key)];
        expect(keys.filter((key) => !glossary[key]?.beginner)).toEqual([]);
      });
    });
  }

  it('the glossaries have the same keys in nb and en', () => {
    expect(Object.keys(glossaryNb.glossary).sort()).toEqual(
      Object.keys(glossaryEn.glossary).sort(),
    );
  });
});
