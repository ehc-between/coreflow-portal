import { GlossaryEntry } from './guidance.models';
import {
  TermDisplay,
  TextSegment,
  boldRuns,
  displaySegments,
  parseTermTokens,
  stripTermTokens,
  termKeys,
} from './term-tokens';

const GLOSSARY: Record<string, GlossaryEntry> = {
  'risk-appetite': {
    term: 'Risikoappetitt',
    definition: 'Hvor mye risiko virksomheten godtar.',
    beginner: 'grensen for hva dere godtar',
  },
  'audit-programme': {
    term: 'Revisjonsprogram',
    definition: 'Planen for revisjonene.',
    beginner: 'planen for årets kontroller',
  },
  'residual-risk': {
    term: 'Restrisiko',
    definition: 'Risikoen etter tiltak.',
    beginner: 'risiko etter tiltak',
  },
  bia: {
    term: 'Konsekvensanalyse (BIA)',
    definition: 'Hva skjer hvis noe stopper.',
    beginner: 'analyse av hva som skjer hvis noe stopper',
  },
  ict: { term: 'IKT', definition: 'Datasystemer.', beginner: 'IT-systemer og nettverk' },
  plainless: { term: 'Ord', definition: 'Uten enkel form.' },
};

const lookup = (key: string) => GLOSSARY[key] ?? null;

/** The text a beginner (or another level) reads, with terms in ⟦…⟧. */
function read(text: string, beginner = true, seen: string[] = []): string {
  return displaySegments(parseTermTokens(text), beginner, lookup, new Set(seen))
    .map((p) => ('kind' in p ? (p as TextSegment).text : `⟦${(p as TermDisplay).text}⟧`))
    .join('');
}

describe('term tokens (simplify U39)', () => {
  it('splits text into text runs and terms', () => {
    expect(parseTermTokens('Over [[risk-appetite|risikoappetitten]] nå.')).toEqual([
      { kind: 'text', text: 'Over ' },
      { kind: 'term', key: 'risk-appetite', shown: 'risikoappetitten', plain: '', strong: false },
      { kind: 'text', text: ' nå.' },
    ]);
    expect(parseTermTokens('**[[ict|IKT]]** og [[ict]]')).toEqual([
      { kind: 'term', key: 'ict', shown: 'IKT', plain: '', strong: true },
      { kind: 'text', text: ' og ' },
      { kind: 'term', key: 'ict', shown: '', plain: '', strong: false },
    ]);
    expect(parseTermTokens('')).toEqual([]);
  });

  it('strips tokens to the words as written and lists the keys', () => {
    const text = 'Sett [[risk-appetite|risikoappetitten]] og **[[ict|IKT]]**, så [[ict]].';
    expect(stripTermTokens(text)).toBe('Sett risikoappetitten og **IKT**, så ict.');
    expect(termKeys(text)).toEqual(['risk-appetite', 'ict']);
  });

  it('shows the words as written outside beginner mode', () => {
    expect(read('Over [[risk-appetite|risikoappetitten]].', false)).toBe(
      'Over ⟦risikoappetitten⟧.',
    );
  });

  it('puts the plain words first after a preposition and at a sentence start', () => {
    expect(read('Risikoene over [[risk-appetite|risikoappetitten]].')).toBe(
      'Risikoene over ⟦grensen for hva dere godtar (risikoappetitten)⟧.',
    );
    expect(read('[[residual-risk|Restrisikoen]] må godtas.')).toBe(
      '⟦Risiko etter tiltak (restrisikoen)⟧ må godtas.',
    );
    expect(read('Ferdig. [[residual-risk|Restrisiko]] gjenstår.')).toBe(
      'Ferdig. ⟦Risiko etter tiltak (restrisiko)⟧ gjenstår.',
    );
  });

  it('keeps the formal word first after an article or a verb, so the sentence stays whole', () => {
    expect(read('Start med et [[audit-programme|revisjonsprogram]] for året.')).toBe(
      'Start med et ⟦revisjonsprogram (planen for årets kontroller)⟧ for året.',
    );
    expect(read('Sett [[audit-programme|programmet]] opp.')).toBe(
      'Sett ⟦programmet (planen for årets kontroller)⟧ opp.',
    );
    expect(read('Lag en [[bia|konsekvensanalyse (BIA)]].')).toBe(
      'Lag en ⟦konsekvensanalyse (BIA: analyse av hva som skjer hvis noe stopper)⟧.',
    );
  });

  it('explains only the first use, and skips keys explained above', () => {
    expect(read('Over [[ict|IKT]] og [[ict|IKT]].')).toBe(
      'Over ⟦IT-systemer og nettverk (IKT)⟧ og ⟦IKT⟧.',
    );
    expect(read('Over [[ict|IKT]].', true, ['ict'])).toBe('Over ⟦IKT⟧.');
  });

  it('does not expand compounds, spelled-out abbreviations, names, opt-outs or terms without a plain form', () => {
    expect(read('Alle [[ict|IKT]]-tjenester og [[ict|IKT]].')).toBe(
      'Alle ⟦IKT⟧-tjenester og ⟦IT-systemer og nettverk (IKT)⟧.',
    );
    expect(read('Informasjonsteknologi ([[ict|IKT]]).')).toBe('Informasjonsteknologi (⟦IKT⟧).');
    expect(read('Lever det i [[audit-programme|Revisjoner]] først.')).toBe(
      'Lever det i ⟦Revisjoner⟧ først.',
    );
    expect(read('Bruk [[ict|IKT|=]]-listen.')).toBe('Bruk ⟦IKT⟧-listen.');
    expect(read('Et [[plainless|ord]].')).toBe('Et ⟦ord⟧.');
  });

  it('uses a per-use plain form when the token gives one', () => {
    expect(read('Over [[risk-appetite|risikoappetitten|grensen deres]].')).toBe(
      'Over ⟦grensen deres (risikoappetitten)⟧.',
    );
  });

  it('resolves bold that spans a term', () => {
    const parts = displaySegments(
      parseTermTokens('Et **mindre [[ict|IKT]]** problem'),
      false,
      lookup,
    );
    expect(boldRuns(parts)).toEqual([
      { key: null, text: 'Et ', strong: false },
      { key: null, text: 'mindre ', strong: true },
      { key: 'ict', text: 'IKT', strong: true },
      { key: null, text: ' problem', strong: false },
    ]);
  });
});
