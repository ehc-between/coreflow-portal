import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Badge } from '../../../shared/ui/badge/badge';
import { groupBySection } from '../data/answer-model';
import { questionTypeKey, severityKey, severityTone } from '../data/inspection-display';
import { Question } from '../data/inspection.models';

/**
 * Read-only checklist: questions grouped by section, numbered, with their type, the
 * pass rule (fail answer, pass score or acceptable range) and the finding severity
 * a failed answer raises.
 */
@Component({
  selector: 'app-question-preview',
  imports: [TranslocoPipe, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (questions().length === 0) {
      <p class="text-[13px] text-fg-muted">{{ 'inspections.builder.noQuestions' | transloco }}</p>
    }
    @for (group of sections(); track $index) {
      <section class="mb-4 last:mb-0">
        <h3 class="mb-2 text-[12.5px] font-bold tracking-wide text-fg-subtle uppercase">
          {{ group.title ?? ('inspections.builder.noSection' | transloco) }}
        </h3>
        <ol class="flex flex-col gap-2">
          @for (q of group.items; track q.id) {
            <li class="rounded-[10px] border border-border bg-surface px-3 py-2.5">
              <div class="flex flex-wrap items-start gap-2">
                <span class="font-mono text-[12px] text-fg-subtle">{{ number(q) }}.</span>
                <span class="min-w-0 flex-1 text-[13.5px] text-fg">
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
                <p class="mt-1 pl-6 text-[12.5px] text-fg-muted">{{ q.help }}</p>
              }
              <p
                class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-[12px] text-fg-subtle"
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
                          | transloco: { min: q.min ?? '—', max: q.max ?? '—', unit: q.unit ?? '' }
                      }}</span>
                    }
                  }
                }
                @if (q.weight !== 1 && isScored(q)) {
                  <span>{{ 'inspections.preview.weight' | transloco: { value: q.weight } }}</span>
                }
                @if (q.finding_on_fail && isScored(q)) {
                  <app-badge [tone]="severityTone(q.finding_severity)">
                    {{ 'inspections.preview.finding' | transloco }}:
                    {{ severityKey(q.finding_severity) | transloco }}
                  </app-badge>
                }
                @for (ref of q.clause_refs; track ref) {
                  <span class="font-mono">{{ ref }}</span>
                }
              </p>
            </li>
          }
        </ol>
      </section>
    }
  `,
})
export class QuestionPreview {
  readonly questions = input<readonly Question[]>([]);

  protected readonly sections = computed(() => groupBySection(this.questions()));
  private readonly index = computed(
    () => new Map(this.questions().map((q, i) => [q.id, i + 1] as const)),
  );

  protected readonly typeKey = questionTypeKey;
  protected readonly severityKey = severityKey;
  protected readonly severityTone = severityTone;

  protected number(q: Question): number {
    return this.index().get(q.id) ?? 0;
  }

  protected isScored(q: Question): boolean {
    return q.type === 'yes_no' || q.type === 'score' || q.type === 'number';
  }
}
