import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { MarkdownPipe } from '../markdown/markdown.pipe';
import { Icon } from '../ui/icon/icon';
import { TeachMe } from './teach-me';

let nextId = 0;

/**
 * Page intro from the guidance file (`pages.<page>.intro`), adapted to the learning
 * level: beginners see it expanded with its steps, standard users get one collapsible
 * line, experts only an info button. Renders nothing when the page has no intro.
 */
@Component({
  selector: 'app-guide-intro',
  imports: [TranslocoPipe, MarkdownPipe, Icon, TeachMe],
  providers: [provideTranslocoScope('guidance')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (intro(); as intro) {
      @if (expert() && !expanded()) {
        <button
          type="button"
          data-testid="guide-intro-toggle"
          class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border text-[13px] font-bold text-fg-muted hover:border-accent-border hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          [attr.aria-label]="'guidance.intro.show' | transloco: { title: intro.title }"
          [attr.aria-expanded]="false"
          [attr.aria-controls]="panelId"
          (click)="expanded.set(true)"
        >
          i
        </button>
      } @else {
        <section
          data-testid="guide-intro"
          class="rounded-card border border-info/30 bg-info-soft"
          [attr.aria-label]="'guidance.intro.label' | transloco"
        >
          <button
            type="button"
            data-testid="guide-intro-toggle"
            class="flex w-full items-center gap-2.5 rounded-card px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            [attr.aria-expanded]="expanded()"
            [attr.aria-controls]="panelId"
            (click)="expanded.set(!expanded())"
          >
            <span
              class="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-info text-[12px] font-bold text-white"
              aria-hidden="true"
              >i</span
            >
            <span class="flex-1 text-[13.5px] font-semibold text-fg">{{ intro.title }}</span>
            <span
              class="flex text-fg-subtle transition-transform motion-reduce:transition-none"
              [class.rotate-90]="expanded()"
              aria-hidden="true"
              ><app-icon name="chevron" [size]="15"
            /></span>
          </button>
          @if (expanded()) {
            <div [id]="panelId" class="px-4 pb-4 pl-[52px]">
              <div
                class="cf-prose text-[13.5px] leading-relaxed text-fg-muted"
                [innerHTML]="intro.body | appMarkdown"
              ></div>
              @if (intro.steps?.length) {
                <ol class="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-[13.5px] text-fg">
                  @for (step of intro.steps; track $index) {
                    <li>{{ step }}</li>
                  }
                </ol>
              }
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <app-teach-me [topic]="scope() + '.' + page()" [subject]="intro.title" />
                @if (!beginner()) {
                  <button
                    type="button"
                    class="h-8 rounded-tile px-3 text-[13px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg"
                    (click)="expanded.set(false)"
                  >
                    {{ 'guidance.intro.hide' | transloco }}
                  </button>
                }
              </div>
            </div>
          }
        </section>
      }
    }
  `,
})
export class GuideIntro {
  private readonly content = inject(GuidanceContentService);
  private readonly guidance = inject(GuidanceService);

  readonly scope = input.required<string>();
  readonly page = input.required<string>();

  protected readonly panelId = `guide-intro-${nextId++}`;
  protected readonly intro = computed(
    () => this.content.readPage(this.scope(), this.page())?.intro ?? null,
  );
  protected readonly beginner = this.guidance.isBeginner;
  protected readonly expert = this.guidance.isExpert;
  /** Open by default for beginners; re-derived when the level changes. */
  protected readonly expanded = linkedSignal(() => this.guidance.isBeginner());
}
