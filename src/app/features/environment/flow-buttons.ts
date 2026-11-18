import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription, catchError, of } from 'rxjs';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { KitApi } from '../../core/kit/kit-api';
import { CreateFlowItem } from '../../core/kit/connections.models';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Button } from '../../shared/ui/button/button';
import { Icon } from '../../shared/ui/icon/icon';

/** i18n key of a flow's short button label (`env_aspect.to_task` -> `…env_aspect_to_task`). */
export function flowButtonKey(flowKey: string): string {
  return `environment.flowButtons.${flowKey.replace(/\./g, '_')}`;
}

/**
 * The next records you can create from this one, as plain buttons in a card
 * ("Ny prosedyre", "Nytt miljømål", "Opprett avvik"). Only flows the backend
 * offers for the record and the user (enabled module, permission) are shown, in
 * the order of `keys`. Each opens the new form prefilled and links it back on save.
 */
@Component({
  selector: 'app-env-flow-buttons',
  imports: [TranslocoPipe, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @for (flow of shown(); track flow.key) {
      <app-button
        variant="secondary"
        size="sm"
        [loading]="flows.starting() === flow.key"
        [disabled]="flows.starting() !== null"
        (click)="start(flow)"
        [attr.data-testid]="'flow-' + flow.key"
      >
        <app-icon name="plus" [size]="13" />
        {{ label(flow.key) | transloco }}
      </app-button>
    }
  `,
})
export class EnvFlowButtons {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  protected readonly flows = inject(CreateFlowService);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();
  /** Flow keys to offer, in display order. */
  readonly keys = input.required<readonly string[]>();

  private readonly available = signal<readonly CreateFlowItem[]>([]);
  protected readonly shown = computed(() => {
    const byKey = new Map(this.available().map((f) => [f.key, f]));
    return this.keys()
      .map((k) => byKey.get(k))
      .filter((f): f is CreateFlowItem => !!f && f.enabled);
  });
  protected readonly label = flowButtonKey;

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const type = this.entityType();
      const id = this.entityId();
      untracked(() => {
        this.request.unsubscribe();
        if (!orgId || !id) {
          this.available.set([]);
          return;
        }
        this.request = this.api
          .createFlows(orgId, type, { entityId: id })
          .pipe(catchError(() => of({ items: [] as readonly CreateFlowItem[] })))
          .subscribe((res) => this.available.set(res.items));
      });
    });
  }

  protected start(flow: CreateFlowItem): void {
    void this.flows.start(flow, this.entityType(), this.entityId());
  }
}
