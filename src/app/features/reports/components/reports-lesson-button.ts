import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GuidanceContentService } from '../../../core/guidance/guidance-content.service';
import { LessonView } from '../../../shared/guidance/lesson';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';

/**
 * A micro-lesson from `assets/guidance/<lang>/reports.json`, opened in a side
 * panel from a small button (hidden while the guidance file has no such lesson).
 * Progress is recorded by the platform `<app-lesson>`.
 */
@Component({
  selector: 'app-reports-lesson-button',
  imports: [TranslocoPipe, Button, Icon, SlideOver, LessonView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (title(); as lessonTitle) {
      <app-button variant="ghost" size="sm" (click)="open.set(true)" data-testid="lesson-button">
        <app-icon name="training" [size]="15" />
        {{ 'reports.lesson.open' | transloco }}
      </app-button>
      <app-slide-over
        [open]="open()"
        [title]="lessonTitle"
        [closeLabel]="'reports.lesson.close' | transloco"
        [width]="580"
        (closed)="open.set(false)"
      >
        @if (open()) {
          <app-lesson scope="reports" [lesson]="lesson()" />
        }
      </app-slide-over>
    }
  `,
})
export class ReportsLessonButton {
  private readonly content = inject(GuidanceContentService);

  readonly lesson = input.required<string>();

  protected readonly open = signal(false);
  protected readonly title = computed(
    () => this.content.readLesson('reports', this.lesson())?.title ?? null,
  );
}
