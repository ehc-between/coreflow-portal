import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { KitApi } from '../../../core/kit/kit-api';
import { kitErrorKey } from '../../../core/kit/kit-errors';
import { SearchHit } from '../../../core/kit/kit.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { provideKitScope } from '../../../shared/kit/kit-scope';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { LEG_TYPES, PROCESS_ENTITY_TYPE, TurtleLeg } from '../data/process.models';
import { RecordSearch } from '../shared/record-search';

/**
 * "Koble" for one turtle leg: search the record types that belong to the leg
 * (risks and opportunities, suppliers and contracts, assets, positions and
 * courses, procedures and policies, KPIs …) and link the one picked to the
 * process (`relates_to` entity link). The record then shows in the leg, in the
 * connections panel and on the other record's page.
 */
@Component({
  selector: 'app-process-link-records',
  imports: [TranslocoPipe, SlideOver, RecordSearch],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-slide-over
      [open]="leg() !== null"
      [title]="
        'processes.linkLeg.title'
          | transloco: { leg: ('processes.turtle.' + (leg() ?? 'risks') | transloco) }
      "
      [subtitle]="'processes.linkLeg.subtitle.' + (leg() ?? 'risks') | transloco"
      [closeLabel]="'processes.actions.close' | transloco"
      [width]="520"
      (closed)="closed.emit()"
    >
      @if (leg(); as current) {
        <app-process-record-search
          [types]="types()"
          labelKey="processes.linkLeg.search"
          [exclude]="exclude()"
          (picked)="link($event)"
        />
        @if (busy()) {
          <p class="mt-3 text-ui text-fg-muted" role="status">{{ 'common.loading' | transloco }}</p>
        }
      }
    </app-slide-over>
  `,
})
export class LinkRecords {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  /** The leg being linked; null closes the panel. */
  readonly leg = input<TurtleLeg | null>(null);
  readonly processId = input.required<string>();
  /** Record ids already linked to the leg. */
  readonly exclude = input<readonly string[]>([]);
  readonly linked = output<void>();
  readonly closed = output<void>();

  protected readonly busy = signal(false);
  protected readonly types = computed(() => {
    const leg = this.leg();
    return leg ? LEG_TYPES[leg] : [];
  });

  protected link(hit: SearchHit): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .createLink(orgId, {
        source_type: PROCESS_ENTITY_TYPE,
        source_id: this.processId(),
        target_type: hit.entity_type,
        target_id: hit.entity_id,
        link_type: 'relates_to',
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.notifications.success('processes.notices.linked', {
            title: hit.code ? `${hit.code} ${hit.title}` : hit.title,
          });
          this.linked.emit();
        },
        error: (error) => {
          this.busy.set(false);
          this.notifications.error(kitErrorKey(error));
        },
      });
  }
}
