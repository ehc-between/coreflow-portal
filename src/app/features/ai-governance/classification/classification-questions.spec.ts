import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { provideFakeGuidance } from '../../../core/guidance/guidance.testing';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { AskPanelService } from '../../ask/ask-panel.service';
import { AiGovernanceCatalog, ClassificationAnswers } from '../data/ai-governance.models';
import { emptyAnswers } from '../data/ai-governance-display';
import { AiClassificationQuestions } from './classification-questions';

const CATALOG = {
  roles: ['provider', 'deployer'],
  prohibited_practices: [{ key: 'social_scoring', ref: 'Art. 5(1)(c)' }],
  annex_iii_areas: [{ key: 'employment', ref: 'Annex III(4)' }],
  transparency_triggers: [{ key: 'interacts_with_people', ref: 'Art. 50(1)' }],
} as unknown as AiGovernanceCatalog;

@Component({
  imports: [AiClassificationQuestions],
  template: `<app-ai-classification-questions [(answers)]="answers" [catalog]="catalog" />`,
})
class Host {
  readonly answers = signal<ClassificationAnswers>(emptyAnswers());
  readonly catalog = CATALOG;
}

function setup() {
  TestBed.configureTestingModule({
    imports: [Host, TranslocoTestingModule.forRoot({ langs: { en: {} } })],
    providers: [
      provideZonelessChangeDetection(),
      ...provideFakeGuidance().providers,
      { provide: AskPanelService, useValue: { askAbout: vi.fn() } },
      { provide: SelectedOrgService, useValue: { currentOrgId: () => 'org-1' } },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const goTo = (step: string) => {
    el.querySelector<HTMLButtonElement>(`[data-testid="wizard-step-${step}"]`)!.click();
    fixture.detectChanges();
  };
  return { fixture, el, goTo, host: fixture.componentInstance };
}

describe('AiClassificationQuestions', () => {
  it('starts on the role step with the default role selected', () => {
    const { el } = setup();
    const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios.length).toBe(2);
    expect(radios[1].checked).toBe(true); // deployer (default role)
  });

  it('edits the answers two-way, step by step', () => {
    const { el, fixture, goTo, host } = setup();
    el.querySelector<HTMLButtonElement>('[data-testid="wizard-next"]')!.click();
    fixture.detectChanges();
    const prohibited = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    prohibited.click();
    fixture.detectChanges();
    expect(host.answers().prohibited_practices).toEqual(['social_scoring']);

    goTo('highRisk');
    const boxes = () => el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(boxes().length).toBe(2); // Annex I + one Annex III area
    boxes()[1].click();
    fixture.detectChanges();
    expect(host.answers().annex_iii_areas).toEqual(['employment']);
    // The Art. 6(3) exception and profiling questions appear once an area is ticked.
    expect(boxes().length).toBe(4);
    boxes()[2].click();
    fixture.detectChanges();
    expect(host.answers().art6_3_exception).toBe(true);
    // Unticking the last area clears the exception.
    boxes()[1].click();
    fixture.detectChanges();
    expect(host.answers().annex_iii_areas).toEqual([]);
    expect(host.answers().art6_3_exception).toBe(false);

    goTo('gpai');
    boxes()[0].click();
    fixture.detectChanges();
    boxes()[1].click();
    fixture.detectChanges();
    expect(host.answers().gpai_systemic_risk).toBe(true);
    boxes()[0].click();
    fixture.detectChanges();
    expect(host.answers().gpai).toBe(false);
    expect(host.answers().gpai_systemic_risk).toBe(false);
  });
});
