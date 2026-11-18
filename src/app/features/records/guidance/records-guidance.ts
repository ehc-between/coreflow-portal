import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RecordsGuidanceService } from '../../../core/records/records-guidance.service';
import { MarkdownPipe } from '../../../shared/markdown/markdown.pipe';
import { Button } from '../../../shared/ui/button/button';

/*
 * Learning-mode pieces for the record designer, rendering the F6 content
 * format from `assets/guidance/<lang>/records.json`: inline field help and the
 * teaching empty state. The page intro, lessons and "why this matters" use the
 * shared `<app-help-strip>` and `<app-why-it-matters>` (scope `records`).
 */

/** Inline field help (and an example, when the content has one). */
@Component({
  selector: 'app-records-field-help',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (content(); as help) {
      <p class="text-micro leading-snug text-fg-subtle">
        {{ help.help }}
        @if (help.example) {
          <span class="block">{{
            'records.guide.example' | transloco: { example: help.example }
          }}</span>
        }
      </p>
    }
  `,
})
export class RecordsFieldHelp {
  private readonly guidance = inject(RecordsGuidanceService);

  readonly page = input.required<string>();
  readonly field = input.required<string>();

  protected readonly content = computed(
    () => this.guidance.content()?.pages?.[this.page()]?.fields?.[this.field()] ?? null,
  );
}

/** Empty state that teaches: what this list is for, and a call to action. */
@Component({
  selector: 'app-records-teaching-empty',
  imports: [Button, MarkdownPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (content(); as empty) {
      <div class="px-6 py-10 text-center">
        <h3 class="font-display text-section font-bold text-fg">{{ empty.title }}</h3>
        <div
          class="mx-auto mt-1.5 max-w-[520px] text-ui leading-relaxed text-fg-muted"
          [innerHTML]="empty.body | appMarkdown"
        ></div>
        @if (empty.cta && showAction()) {
          <div class="mt-4">
            <app-button (click)="action.emit()">{{ empty.cta }}</app-button>
          </div>
        }
      </div>
    }
  `,
})
export class RecordsTeachingEmpty {
  private readonly guidance = inject(RecordsGuidanceService);

  readonly page = input.required<string>();
  readonly showAction = input(true);
  readonly action = output<void>();

  protected readonly content = computed(
    () => this.guidance.content()?.pages?.[this.page()]?.empty ?? null,
  );
}
