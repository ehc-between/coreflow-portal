import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LessonView } from '../../../shared/guidance/lesson';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';

/** Opens one of the module's micro-lessons (guidance `lessons.<lesson>`) in a side panel. */
@Component({
  selector: 'app-recruitment-lesson-button',
  imports: [TranslocoPipe, Button, Icon, SlideOver, LessonView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <app-button variant="ghost" size="sm" (click)="open.set(true)">
      <app-icon name="training" [size]="15" />
      {{ labelKey() | transloco }}
    </app-button>
    <app-slide-over
      [open]="open()"
      [title]="labelKey() | transloco"
      [closeLabel]="'recruitment.common.close' | transloco"
      [width]="560"
      (closed)="open.set(false)"
    >
      @if (open()) {
        <app-lesson scope="recruitment" [lesson]="lesson()" />
      }
    </app-slide-over>
  `,
})
export class RecruitmentLessonButton {
  readonly lesson = input.required<string>();
  readonly labelKey = input('recruitment.guide.lesson');
  protected readonly open = signal(false);
}
