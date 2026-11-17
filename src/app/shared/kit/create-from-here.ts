import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { CreateFlowItem } from '../../core/kit/connections.models';
import { CreateFlowService } from '../../core/kit/create-flow.service';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { KitApi } from '../../core/kit/kit-api';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { MenuItem, OverflowMenu } from '../ui/overflow-menu/overflow-menu';
import { flowLabelKey } from './kit-format';
import { provideKitScope } from './kit-scope';

/**
 * "Create from this ⋯" (P4): the natural next records a user can create from
 * this one (deviation → risk, supplier → contract, requirement → the record
 * that documents it, …). The new form opens prefilled, and the new record is
 * linked back here when it is saved. Only flows into enabled modules the user
 * may write to are listed; with none, nothing renders.
 */
@Component({
  selector: 'app-create-from-here',
  imports: [TranslocoPipe, OverflowMenu, MenuItem],
  viewProviders: [provideKitScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex',
    '(pointerdown)': 'placeMenu()',
    '(focusin)': 'placeMenu()',
  },
  template: `
    @if (items().length > 0) {
      <app-overflow-menu labelKey="kit.flows.menu" [align]="align()" data-testid="create-from-here">
        @for (flow of items(); track flow.key) {
          <button
            appMenuItem
            type="button"
            [disabled]="flows.starting() !== null"
            (click)="start(flow)"
            [attr.data-flow]="flow.key"
          >
            {{ label(flow) | transloco: { type: targetLabel(flow) } }}
          </button>
        }
      </app-overflow-menu>
    }
  `,
})
export class CreateFromHere {
  private readonly api = inject(KitApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly entityTypes = inject(EntityTypesService);
  protected readonly flows = inject(CreateFlowService);

  readonly entityType = input.required<string>();
  readonly entityId = input<string | null | undefined>(null);
  /** For `entityType = 'standard_requirement'`: the requirement ref. */
  readonly requirementRef = input<string | null | undefined>(null);

  protected readonly items = signal<readonly CreateFlowItem[]>([]);
  /** Open the menu towards the side with room (left-aligned when the button is on the left). */
  protected readonly align = signal<'start' | 'end'>('end');
  private readonly host = inject(ElementRef<HTMLElement>);
  private sub: Subscription | null = null;

  constructor() {
    this.entityTypes.ensureLoaded();
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const type = this.entityType();
      const id = this.entityId();
      const ref = this.requirementRef();
      untracked(() => this.load(orgId, type, id ?? null, ref ?? null));
    });
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  protected placeMenu(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    const width = this.host.nativeElement.ownerDocument.defaultView?.innerWidth ?? 0;
    this.align.set(width > 0 && rect.left + rect.width / 2 < width / 2 ? 'start' : 'end');
  }

  protected label(flow: CreateFlowItem): string {
    return flowLabelKey(flow.label_key, flow.key);
  }

  protected targetLabel(flow: CreateFlowItem): string {
    return this.entityTypes.label(flow.target_type, flow.target_label_key);
  }

  protected start(flow: CreateFlowItem): void {
    const ref = this.requirementRef();
    void this.flows.start(
      flow,
      this.entityType(),
      ref ? { id: this.entityId() ?? null, ref } : (this.entityId() ?? ''),
    );
  }

  private load(orgId: string | null, type: string, id: string | null, ref: string | null): void {
    this.sub?.unsubscribe();
    this.items.set([]);
    if (!orgId || (!id && !ref)) {
      return;
    }
    // Quietly empty when the server has no flows (or none for this record).
    this.sub = this.api.createFlows(orgId, type, { entityId: id, ref }).subscribe({
      next: (list) =>
        this.items.set((Array.isArray(list?.items) ? list.items : []).filter((f) => f?.enabled)),
      error: () => this.items.set([]),
    });
  }
}
