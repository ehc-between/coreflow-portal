import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalNumberPipe } from '../../../shared/locale/locale-pipes';
import { Badge } from '../../../shared/ui/badge/badge';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { groupBySection, normaliseQuestion } from '../data/answer-model';
import { questionTypeKey, severityKey } from '../data/inspection-display';
import { Question } from '../data/inspection.models';
import { ClauseRefs } from './clause-refs';

/** A question with its 1-based position in the whole checklist. */
interface NumberedQuestion extends Question {
  readonly n: number;
}

/**
 * Read-only checklist: questions grouped by section and numbered in order, with
 * their answer type, the pass rule ("Ikke godkjent ved Nei", the pass score or the
 * acceptable range), the finding a failed answer raises and the clauses it cites.
 * Partial questions (from the library or the assistant) get the defaults an import
 * would give them, so nothing shows as a raw value.
 */
@Component({
  selector: 'app-question-preview',
  imports: [TranslocoPipe, LocalNumberPipe, Badge, StatusBadge, ClauseRefs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (numbered().length === 0) {
      <p class="text-ui text-fg-muted">{{ 'inspections.builder.noQuestions' | transloco }}</p>
    }
    @for (group of sections(); track $index) {
      <section class="mb-4 last:mb-0">
        @if (group.title || sections().length > 1) {
          <h3 class="mb-2 text-meta font-bold tracking-wide text-fg-subtle uppercase">
            {{ group.title ?? ('inspections.builder.noSection' | transloco) }}
          </h3>
        }
        <ol class="flex flex-col gap-2">
          @for (q of group.items; track q.n) {
            <li
              class="rounded-tile border border-border bg-surface px-3 py-2.5"
              data-testid="preview-question"
            >
              <div class="flex flex-wrap items-start gap-2">
                <span class="font-mono text-meta text-fg-subtle">{{ q.n }}.</span>
                <span class="min-w-0 flex-1 text-ui text-fg">
                  {{ q.text }}
                  @if (q.required) {
                    <span
                      class="text-fail"
                      [attr.title]="'inspections.builder.required' | transloco"
                      >*</span
                    >
                  }
                </span>
                <app-badge tone="neutral">{{ typeKey(q.type) | transloco }}</app-badge>
              </div>
              @if (q.help) {
                <p class="mt-1 pl-6 text-meta text-fg-muted">{{ q.help }}</p>
              }
              <p
                class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-meta text-fg-subtle"
              >
                @switch (q.type) {
                  @case ('yes_no') {
                    <span>{{
                      'inspections.preview.failsOn'
                        | transloco
                          : { answer: ('inspections.answers.' + q.fail_answer | transloco) }
                    }}</span>
                  }
                  @case ('score') {
                    <span>{{
                      'inspections.preview.scale'
                        | transloco: { min: q.scale_min, max: q.scale_max }
                    }}</span>
                    @if (q.pass_score !== null) {
                      <span>{{
                        'inspections.preview.passScore' | transloco: { value: q.pass_score }
                      }}</span>
                    }
                  }
                  @case ('number') {
                    @if (q.min !== null || q.max !== null) {
                      <span>{{
                        'inspections.preview.range'
                          | transloco
                            : {
                                min: q.min === null ? '–' : (q.min | localNumber),
                                max: q.max === null ? '–' : (q.max | localNumber),
                                unit: q.unit ?? '',
                              }
                      }}</span>
                    }
                  }
                }
                @if (q.weight !== 1 && isScored(q)) {
                  <span>{{
                    'inspections.preview.weight' | transloco: { value: (q.weight | localNumber) }
                  }}</span>
                }
                @if (q.finding_on_fail && isScored(q)) {
                  <app-status-badge
                    meaning="severity"
                    [value]="q.finding_severity"
                    labelKey="inspections.preview.finding"
                    [labelParams]="{ severity: (severityKey(q.finding_severity) | transloco) }"
                  />
                }
                <app-clause-refs [refs]="q.clause_refs" />
              </p>
            </li>
          }
        </ol>
      </section>
    }
  `,
})
export class QuestionPreview {
  readonly questions = input<readonly Partial<Question>[]>([]);

  /** Defaults filled in and numbered by position (ids may be missing or repeated). */
  protected readonly numbered = computed<readonly NumberedQuestion[]>(() =>
    this.questions().map((raw, i) => ({ ...normaliseQuestion(raw), n: i + 1 })),
  );
  protected readonly sections = computed(() => groupBySection(this.numbered()));

  protected readonly typeKey = questionTypeKey;
  protected readonly severityKey = severityKey;

  protected isScored(q: Question): boolean {
    return q.type === 'yes_no' || q.type === 'score' || q.type === 'number';
  }
}
