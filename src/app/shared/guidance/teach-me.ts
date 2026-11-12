import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { AiAvailability } from '../../core/ai/ai-availability';
import { TutorService } from '../../core/guidance/tutor.service';
import { Icon } from '../ui/icon/icon';

/**
 * "Teach me": opens the assistant in tutor mode for `topic` (e.g. `platform.dashboard`,
 * `hs:6.1`), adapted to the user's learning level. `subject` is the readable text the
 * tutor prompt uses; it defaults to the topic. Hidden while AI is not configured.
 */
@Component({
  selector: 'app-teach-me',
  imports: [TranslocoPipe, Icon],
  providers: [provideTranslocoScope('guidance')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (!availability.unavailable()) {
      <button
        type="button"
        data-testid="teach-me"
        class="inline-flex h-8 items-center gap-1.5 rounded-tile border border-accent-border bg-accent-soft px-3 text-[13px] font-semibold text-accent hover:bg-accent hover:text-white focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        (click)="tutor.teach(topic(), subject())"
      >
        <app-icon name="spark" [size]="14" />
        {{ labelKey() | transloco }}
      </button>
    }
  `,
})
export class TeachMe {
  protected readonly tutor = inject(TutorService);
  protected readonly availability = inject(AiAvailability);

  readonly topic = input.required<string>();
  readonly subject = input<string | null>(null);
  readonly labelKey = input('guidance.teachMe.label');
}
