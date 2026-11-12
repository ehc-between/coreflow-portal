import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceContentService } from '../../../core/guidance/guidance-content.service';
import { GuideIntro } from '../../../shared/guidance/guide-intro';
import { LessonView } from '../../../shared/guidance/lesson';
import { TourButton } from '../../../shared/guidance/tour-button';
import { WhyItMatters } from '../../../shared/guidance/why-it-matters';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';

/** Guidance scope of the documents module (`src/assets/guidance/<lang>/documents.json`). */
export const DOCUMENTS_GUIDE_SCOPE = 'documents';

/**
 * The learning-mode block of a document-management page: the page intro, the
 * "why this matters" note with clause chips, a micro-lesson launcher (opens the
 * lesson in a side panel, which records progress) and the page tour button.
 */
@Component({
  selector: 'app-documents-page-guide',
  imports: [TranslocoPipe, GuideIntro, WhyItMatters, LessonView, TourButton, Icon, SlideOver],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3' },
  template: `
    <app-guide-intro [scope]="scope" [page]="page()" />
    <div class="flex flex-wrap items-center gap-2">
      <app-why-it-matters [scope]="scope" [page]="page()" />
      @if (lessonTitle(); as title) {
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[12.5px] font-semibold text-fg-muted hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          (click)="lessonOpen.set(true)"
          data-testid="documents-lesson-button"
        >
          <app-icon name="training" [size]="14" />
          {{ 'documents.control.guide.lessonButton' | transloco: { title } }}
        </button>
      }
      @if (tour(); as tourKey) {
        <app-tour-button [scope]="scope" [tour]="tourKey" />
      }
    </div>

    @if (lesson(); as lessonKey) {
      <app-slide-over
        [open]="lessonOpen()"
        [title]="lessonTitle() ?? ''"
        [closeLabel]="'documents.control.common.close' | transloco"
        [width]="580"
        (closed)="lessonOpen.set(false)"
      >
        @if (lessonOpen()) {
          <app-lesson [scope]="scope" [lesson]="lessonKey" />
        }
      </app-slide-over>
    }
  `,
})
export class DocumentsPageGuide {
  private readonly content = inject(GuidanceContentService);

  protected readonly scope = DOCUMENTS_GUIDE_SCOPE;

  readonly page = input.required<string>();
  readonly lesson = input<string | null>(null);
  readonly tour = input<string | null>(null);

  protected readonly lessonOpen = signal(false);

  protected readonly lessonTitle = computed(() => {
    const key = this.lesson();
    return key ? (this.content.readLesson(DOCUMENTS_GUIDE_SCOPE, key)?.title ?? null) : null;
  });
}
