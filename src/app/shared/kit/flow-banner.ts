import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { CreateFlowService, FlowContext } from '../../core/kit/create-flow.service';
import { Icon } from '../ui/icon/icon';
import { provideKitScope } from './kit-scope';

/**
 * Strip at the top of a new-record form opened by "create from here" (P4):
 * "Created from AVV-12 Late delivery. It is linked back when you save." or,
 * for `?fromRequirement=`, which requirement the new record will document.
 * "Not from here" drops the flow (the record is then saved unlinked).
 *
 *   readonly flow = inject(CreateFlowService).consume(inject(ActivatedRoute), { targetType: 'risk' });
 *   <app-flow-banner [flow]="flow()" />
 */
@Component({
  selector: 'app-flow-banner',
  imports: [TranslocoPipe, RouterLink, Icon],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      @let f = flow()!;
      <div
        class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tile border border-info/30 bg-info-soft px-3 py-2 text-ui text-info-ink"
        role="status"
        data-testid="flow-banner"
      >
        <app-icon name="link" [size]="15" />
        <span class="min-w-0 flex-1">
          @if (f.source) {
            {{ 'kit.flows.banner' | transloco: { name: sourceName() } }}
          } @else {
            {{ 'kit.flows.bannerRequirement' | transloco: { label: requirementLabel() } }}
          }
        </span>
        @if (f.source?.url; as url) {
          <a [routerLink]="url" class="font-semibold underline-offset-2 hover:underline">{{
            'kit.flows.openSource' | transloco: { name: sourceName() }
          }}</a>
        }
        <button
          type="button"
          class="font-semibold text-info-ink/80 hover:text-info-ink hover:underline"
          (click)="cancel()"
        >
          {{ 'kit.flows.cancel' | transloco }}
        </button>
      </div>
    }
  `,
})
export class FlowBanner {
  private readonly flows = inject(CreateFlowService);
  private readonly language = inject(LanguageService);

  readonly flow = input<FlowContext | null | undefined>(null);
  readonly cancelled = output<void>();

  private readonly dismissed = signal(false);

  protected readonly visible = computed(() => {
    const f = this.flow();
    return !!f && !this.dismissed() && (!!f.source || !!f.requirementRef);
  });

  protected readonly sourceName = computed(() => {
    const s = this.flow()?.source;
    return s ? [s.code, s.title].filter(Boolean).join(' ') : '';
  });

  protected readonly requirementLabel = computed(() => {
    const f = this.flow();
    const req = f?.prefill.requirement;
    if (!req) {
      return f?.requirementRef ?? '';
    }
    const title = this.language.active() === 'nb' && req.title_nb ? req.title_nb : req.title;
    return `${req.number} ${title}`.trim();
  });

  protected cancel(): void {
    this.dismissed.set(true);
    this.flows.cancel();
    this.cancelled.emit();
  }
}
