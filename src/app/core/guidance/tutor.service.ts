import { Injectable, inject } from '@angular/core';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { LanguageService } from '../i18n/language.service';
import { formatClause } from './clause-ref';
import { GuidanceService } from './guidance.service';

/**
 * Opens the assistant as a tutor ("Teach me") for a page, topic or clause, adapted to
 * the user's learning level.
 *
 * Until the assistant's tutor mode is available on main this sends a translated tutor
 * prompt through `AskPanelService.showWith(prompt)` (contracts 3.3). This is the single
 * call site to switch to `AskPanelService.openTutor(topic)` once F5 is merged.
 */
@Injectable({ providedIn: 'root' })
export class TutorService {
  private readonly ask = inject(AskPanelService);
  private readonly guidance = inject(GuidanceService);
  private readonly language = inject(LanguageService);

  /**
   * Teach a topic. `topic` is the stable tutor topic (e.g. `platform.dashboard`);
   * `subject` is the human-readable text the prompt uses (defaults to the topic).
   */
  teach(topic: string, subject?: string | null): void {
    const prompt = this.language.translate('guidance.tutor.topicPrompt', {
      subject: subject?.trim() || topic,
      style: this.style(),
    });
    this.ask.showWith(prompt);
  }

  /** Explain a clause reference (`"iso27001:A.6.3"`) in plain language. */
  explainClause(ref: string): void {
    const clause = formatClause(ref, (key, params) => this.language.translate(key, params));
    const prompt = this.language.translate('guidance.tutor.clausePrompt', {
      clause,
      style: this.style(),
    });
    this.ask.showWith(prompt);
  }

  private style(): string {
    return this.language.translate(`guidance.tutor.style.${this.guidance.level()}`);
  }
}
