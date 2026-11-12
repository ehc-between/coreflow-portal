import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { LanguageService } from '../i18n/language.service';
import { formatClause, parseClauseRef } from './clause-ref';
import { GuidanceService } from './guidance.service';
import { TutorService } from './tutor.service';

/** Echo translator: `key{json params}`. */
const t = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}${JSON.stringify(params)}` : key;

describe('clause references', () => {
  it('parses known frameworks and keeps unknown references raw', () => {
    expect(parseClauseRef('iso27001:A.6.3')).toEqual({
      ref: 'iso27001:A.6.3',
      framework: 'iso27001',
      clause: 'A.6.3',
    });
    expect(parseClauseRef('eu_ai_act:4').framework).toBe('eu_ai_act');
    expect(parseClauseRef('foo:1')).toEqual({ ref: 'foo:1', framework: null, clause: 'foo:1' });
    expect(parseClauseRef('hs:').framework).toBeNull();
    expect(parseClauseRef('plain').framework).toBeNull();
  });

  it('formats a clause label through the translator', () => {
    expect(formatClause('hs:7.2', t)).toBe(
      'guidance.clause{"framework":"guidance.frameworks.hs","clause":"7.2"}',
    );
    expect(formatClause('custom', t)).toBe('custom');
  });
});

describe('TutorService', () => {
  function setup() {
    const ask = { showWith: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: AskPanelService, useValue: ask },
        { provide: GuidanceService, useValue: { level: signal('beginner') } },
        { provide: LanguageService, useValue: { translate: t } },
      ],
    });
    return { tutor: TestBed.inject(TutorService), ask };
  }

  it('sends a level-adapted topic prompt to the assistant', () => {
    const { tutor, ask } = setup();
    tutor.teach('platform.dashboard', 'Your overview');
    expect(ask.showWith).toHaveBeenCalledWith(
      'guidance.tutor.topicPrompt{"subject":"Your overview","style":"guidance.tutor.style.beginner"}',
    );
    tutor.teach('platform.learning', '  ');
    expect(ask.showWith).toHaveBeenLastCalledWith(
      'guidance.tutor.topicPrompt{"subject":"platform.learning","style":"guidance.tutor.style.beginner"}',
    );
  });

  it('explains a clause', () => {
    const { tutor, ask } = setup();
    tutor.explainClause('hs:7.3');
    const prompt = ask.showWith.mock.calls[0][0] as string;
    expect(prompt.startsWith('guidance.tutor.clausePrompt')).toBe(true);
    expect(prompt).toContain('guidance.frameworks.hs');
    expect(prompt).toContain('guidance.tutor.style.beginner');
  });
});
