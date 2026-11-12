import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  computed,
  output,
  signal,
} from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { loadSearchScope } from '../../core/search/search-scope';
import { AiAssistApi } from '../../core/ai/ai-assist-api';
import { AiAvailability } from '../../core/ai/ai-availability';
import { AskSource, AssistRequestBody } from '../../core/ai/ai.models';
import { SseStream } from '../../core/ai/sse-client';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Button, ButtonSize, ButtonVariant } from '../ui/button/button';
import { Icon } from '../ui/icon/icon';

/**
 * A module AI button (draft, suggest, summarise, explain), backed by an assist
 * the module registered on the server (`POST v1/orgs/{org}/ai/assist/{assist}`).
 *
 *   <app-ai-assist-button assist="risk.suggest_controls" labelKey="risk.ai.suggest"
 *     [input]="{ title: form.title }" entityType="risk" [entityId]="id()"
 *     (result)="applySuggestions($event)" />
 *
 * - Text assists: `(text)` emits the accumulated text as it streams and once
 *   more when done (so a consumer can show the answer growing).
 * - JSON assists: `(result)` emits the parsed data once.
 * - `(sources)` emits cited sources, `(failed)` fires on an error.
 *
 * Clicking again while running stops the run. Hidden once AI is known to be off
 * (a 503 marks it unavailable for the session). `labelKey` is translated from the
 * consumer's scope (signal-tracked, so it refreshes once that scope loads).
 */
@Component({
  selector: 'app-ai-assist-button',
  imports: [Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!availability.unavailable()) {
      <span class="inline-flex flex-col items-start gap-1">
        <app-button
          [variant]="variant()"
          [size]="size()"
          [disabled]="disabled()"
          [attr.aria-busy]="running()"
          (click)="toggle()"
        >
          <span class="inline-flex text-current" [class.animate-cf-pulse]="running()">
            <app-icon name="spark" [size]="15" />
          </span>
          @if (running()) {
            {{ runningLabel() }}
          } @else {
            {{ label() }}
          }
        </app-button>
        @if (error()) {
          <span class="text-[12px] text-fail" role="alert">{{ failedLabel() }}</span>
        }
      </span>
    }
  `,
})
export class AiAssistButton {
  private readonly api = inject(AiAssistApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  protected readonly availability = inject(AiAvailability);

  /** Assist key, `<module>.<name>` (e.g. `risk.suggest_controls`). */
  readonly assist = input.required<string>();
  /** Assist input (module-defined). */
  readonly input = input<Readonly<Record<string, unknown>>>({});
  /** Label i18n key. */
  readonly labelKey = input('search.assist.defaultLabel');
  /** The record the assist is about (sent together with `entityId`). */
  readonly entityType = input<string | null>(null);
  readonly entityId = input<string | null>(null);
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('sm');
  readonly disabled = input(false);

  /** JSON assists: the parsed result. */
  readonly result = output<unknown>();
  /** Text assists: the accumulated text so far (and the full text when done). */
  readonly text = output<string>();
  /** Sources the assist cited. */
  readonly sources = output<readonly AskSource[]>();
  /** The run failed (the button shows a short inline message). */
  readonly failed = output<void>();

  protected readonly running = signal(false);
  protected readonly error = signal(false);

  private readonly language = inject(LanguageService);
  protected readonly label = computed(() => this.language.translate(this.labelKey()));
  protected readonly runningLabel = computed(() =>
    this.language.translate('search.assist.running'),
  );
  protected readonly failedLabel = computed(() => this.language.translate('search.assist.failed'));

  private stream: SseStream | null = null;

  constructor() {
    loadSearchScope();
    inject(DestroyRef).onDestroy(() => this.stream?.cancel());
  }

  protected toggle(): void {
    if (this.running()) {
      this.stream?.cancel();
      this.stream = null;
      this.running.set(false);
      return;
    }
    this.start();
  }

  private start(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.disabled()) {
      return;
    }
    const entityType = this.entityType();
    const entityId = this.entityId();
    const body: AssistRequestBody =
      entityType && entityId
        ? { input: this.input(), entity_type: entityType, entity_id: entityId }
        : { input: this.input() };

    let accumulated = '';
    this.error.set(false);
    this.running.set(true);
    this.stream = this.api.run(orgId, this.assist(), body, (event) => {
      switch (event.type) {
        case 'delta':
          accumulated += event.text;
          this.text.emit(accumulated);
          break;
        case 'result':
          this.result.emit(event.data);
          break;
        case 'sources':
          this.sources.emit(event.sources);
          break;
        case 'done':
          if (accumulated) {
            this.text.emit(accumulated);
          }
          this.finish();
          break;
        case 'error':
          this.error.set(true);
          this.failed.emit();
          this.finish();
          break;
        case 'not-configured':
          this.availability.markUnavailable();
          this.failed.emit();
          this.finish();
          break;
      }
    });
  }

  private finish(): void {
    this.running.set(false);
    this.stream = null;
  }
}
