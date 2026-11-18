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
import { Observable } from 'rxjs';
import { SearchHit } from '../../../core/kit/kit.models';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Button } from '../../../shared/ui/button/button';
import { FormField } from '../../../shared/ui/form-field/form-field';
import { Icon } from '../../../shared/ui/icon/icon';
import { processErrorKey } from '../data/process-errors';
import { ProcessReferences } from '../data/process-references';
import { InteractionDirection, ProcessDetail } from '../data/process.models';
import { ProcessesApi } from '../data/processes-api';
import { RecordSearch } from '../shared/record-search';

type InteractionKind = 'process' | 'party';

/**
 * Edits who the process receives from and delivers to: other processes
 * (the interaction map) and interested parties from "Kontekst og ledelse"
 * (customers, authorities, suppliers as external start and end points).
 * Lists the current interactions with a remove button; the add form opens
 * behind "Legg til samspill". Emits after every change so the page reloads
 * the process and its turtle.
 */
@Component({
  selector: 'app-interactions-panel',
  imports: [RouterLink, TranslocoPipe, FieldHelp, Button, FormField, Icon, RecordSearch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let p = process();
    <div class="flex items-center gap-1.5">
      <p class="text-ui text-fg-muted">{{ 'processes.interactions.intro' | transloco }}</p>
      <app-field-help scope="processes" page="detail" field="interactions" />
    </div>
    <ul class="mt-3 flex flex-col divide-y divide-border" data-testid="interactions">
      @for (i of p.interactions; track i.id) {
        <li class="flex items-center gap-2 py-2 text-ui">
          <span class="w-[96px] flex-none text-meta font-semibold text-fg-muted">
            {{ 'processes.interactions.direction.' + i.direction | transloco }}
          </span>
          <span class="min-w-0 flex-1">
            <a
              [routerLink]="['/processes', i.process.id]"
              class="font-semibold text-fg hover:text-accent"
            >
              <span class="font-mono text-meta text-fg-muted">{{ i.process.code }}</span>
              {{ i.process.title }}
            </a>
            @if (i.label) {
              <span class="block text-meta text-fg-muted">{{ i.label }}</span>
            }
          </span>
          @if (p.can_edit) {
            <button
              type="button"
              class="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [attr.aria-label]="
                'processes.interactions.remove' | transloco: { code: i.process.code }
              "
              [disabled]="busy()"
              (click)="remove(i.id, 'process')"
            >
              <app-icon name="x" [size]="14" />
            </button>
          }
        </li>
      }
      @for (i of p.party_interactions ?? []; track i.id) {
        <li class="flex items-center gap-2 py-2 text-ui" data-testid="party-interaction">
          <span class="w-[96px] flex-none text-meta font-semibold text-fg-muted">
            {{ 'processes.interactions.direction.' + i.direction | transloco }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="mr-1 text-micro font-semibold tracking-wide text-fg-subtle uppercase">{{
              'processes.interactions.partyTag' | transloco
            }}</span>
            @if (i.party.url) {
              <a [routerLink]="i.party.url" class="font-semibold text-fg hover:text-accent">{{
                i.party.name
              }}</a>
            } @else {
              <span class="font-semibold text-fg">{{ i.party.name }}</span>
            }
            @if (i.label) {
              <span class="block text-meta text-fg-muted">{{ i.label }}</span>
            }
          </span>
          @if (p.can_edit) {
            <button
              type="button"
              class="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              [attr.aria-label]="
                'processes.interactions.removeParty' | transloco: { name: i.party.name }
              "
              [disabled]="busy()"
              (click)="remove(i.id, 'party')"
            >
              <app-icon name="x" [size]="14" />
            </button>
          }
        </li>
      }
      @if (p.interactions.length === 0 && !(p.party_interactions ?? []).length) {
        <li class="py-2 text-ui text-fg-muted">{{ 'processes.interactions.empty' | transloco }}</li>
      }
    </ul>
    <a
      routerLink="/processes/interaction-map"
      class="mt-2 inline-block text-ui font-semibold text-accent hover:underline"
    >
      {{ 'processes.interactions.openMap' | transloco }}
    </a>

    @if (p.can_edit) {
      @if (!adding()) {
        <div class="mt-4">
          <app-button
            variant="secondary"
            size="sm"
            (click)="adding.set(true)"
            data-testid="interaction-open"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'processes.interactions.add' | transloco }}
          </app-button>
        </div>
      } @else {
        <form
          class="mt-4 flex flex-col gap-3 rounded-tile bg-surface-2 p-3"
          (submit)="$event.preventDefault(); add()"
          data-testid="interaction-form"
        >
          <fieldset>
            <legend class="mb-1.5 text-ui font-semibold text-fg-muted">
              {{ 'processes.interactions.kindLabel' | transloco }}
            </legend>
            <div class="flex flex-wrap gap-3 text-ui text-fg">
              @for (k of kinds; track k) {
                <label class="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="cf-int-kind"
                    class="h-4 w-4 accent-[var(--accent)]"
                    [checked]="kind() === k"
                    (change)="setKind(k)"
                  />
                  {{ 'processes.interactions.kind.' + k | transloco }}
                </label>
              }
            </div>
          </fieldset>
          <app-form-field
            [label]="'processes.interactions.directionLabel' | transloco"
            inputId="cf-int-direction"
          >
            <select
              id="cf-int-direction"
              [value]="direction()"
              (change)="direction.set($any($event.target).value)"
            >
              <option value="incoming" [selected]="direction() === 'incoming'">
                {{ 'processes.interactions.direction.incoming' | transloco }}
              </option>
              <option value="outgoing" [selected]="direction() === 'outgoing'">
                {{ 'processes.interactions.direction.outgoing' | transloco }}
              </option>
            </select>
          </app-form-field>
          @if (kind() === 'process') {
            <app-form-field
              [label]="'processes.interactions.target' | transloco"
              inputId="cf-int-target"
            >
              <select
                id="cf-int-target"
                [value]="target()"
                (change)="target.set($any($event.target).value)"
                data-testid="interaction-target"
              >
                <option value="">{{ 'processes.interactions.chooseTarget' | transloco }}</option>
                @for (o of targets(); track o.id) {
                  <option [value]="o.id">{{ o.code }} · {{ o.title }}</option>
                }
              </select>
            </app-form-field>
          } @else if (party(); as chosen) {
            <div>
              <p class="mb-1.5 text-ui font-semibold text-fg-muted">
                {{ 'processes.interactions.party' | transloco }}
              </p>
              <div
                class="flex items-center gap-2 rounded-tile border border-border bg-surface px-3 py-2"
              >
                <span class="min-w-0 flex-1 truncate text-ui text-fg">{{ chosen.title }}</span>
                <button
                  type="button"
                  class="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle hover:text-fail"
                  [attr.aria-label]="'processes.picker.clear' | transloco: { title: chosen.title }"
                  (click)="party.set(null)"
                >
                  <app-icon name="x" [size]="14" />
                </button>
              </div>
            </div>
          } @else {
            <app-process-record-search
              [types]="partyTypes"
              labelKey="processes.interactions.party"
              placeholderKey="processes.interactions.partyPlaceholder"
              [exclude]="linkedParties()"
              (picked)="party.set($event)"
            />
            <p class="text-meta text-fg-subtle">
              {{ 'processes.interactions.partyHint' | transloco }}
              <a
                routerLink="/context/interested-parties"
                class="font-semibold text-accent hover:underline"
                >{{ 'processes.interactions.partyRegister' | transloco }}</a
              >
            </p>
          }
          <app-form-field
            [label]="'processes.interactions.label' | transloco"
            inputId="cf-int-label"
          >
            <input
              id="cf-int-label"
              maxlength="255"
              [placeholder]="'processes.interactions.labelPlaceholder' | transloco"
              [value]="label()"
              (input)="label.set($any($event.target).value)"
            />
          </app-form-field>
          <div class="flex flex-wrap justify-end gap-2">
            <app-button variant="secondary" size="sm" (click)="reset()">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button
              type="submit"
              size="sm"
              [disabled]="!canSubmit() || busy()"
              data-testid="interaction-add"
            >
              {{ 'processes.interactions.save' | transloco }}
            </app-button>
          </div>
        </form>
      }
    }
  `,
})
export class InteractionsPanel {
  private readonly api = inject(ProcessesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly references = inject(ProcessReferences);

  readonly process = input.required<ProcessDetail>();
  readonly changed = output<void>();

  protected readonly kinds: readonly InteractionKind[] = ['process', 'party'];
  protected readonly partyTypes = ['interested_party'];
  protected readonly busy = signal(false);
  protected readonly adding = signal(false);
  protected readonly kind = signal<InteractionKind>('process');
  protected readonly target = signal('');
  protected readonly party = signal<SearchHit | null>(null);
  protected readonly direction = signal<InteractionDirection>('incoming');
  protected readonly label = signal('');

  protected readonly targets = computed(() => {
    const id = this.process().id;
    return this.references.processes().filter((p) => p.id !== id);
  });
  protected readonly linkedParties = computed(() =>
    (this.process().party_interactions ?? []).map((i) => i.party.id),
  );
  protected readonly canSubmit = computed(() =>
    this.kind() === 'process' ? !!this.target() : !!this.party(),
  );

  constructor() {
    this.references.ensureProcesses();
  }

  protected setKind(kind: InteractionKind): void {
    this.kind.set(kind);
    this.target.set('');
    this.party.set(null);
  }

  protected reset(): void {
    this.adding.set(false);
    this.target.set('');
    this.party.set(null);
    this.label.set('');
  }

  protected add(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.canSubmit() || this.busy()) {
      return;
    }
    const id = this.process().id;
    const label = this.label().trim() || null;
    const direction = this.direction();
    const party = this.party();
    const call: Observable<unknown> =
      this.kind() === 'party' && party
        ? this.api.addPartyInteraction(orgId, id, { party_id: party.entity_id, direction, label })
        : this.api.addInteraction(orgId, id, {
            target_process_id: this.target(),
            direction,
            label,
          });
    this.busy.set(true);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.reset();
        this.notifications.success('processes.notices.interactionAdded');
        this.changed.emit();
      },
      error: (error) => this.fail(error),
    });
  }

  protected remove(interactionId: string, kind: InteractionKind): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    const id = this.process().id;
    this.busy.set(true);
    const call =
      kind === 'party'
        ? this.api.removePartyInteraction(orgId, id, interactionId)
        : this.api.removeInteraction(orgId, id, interactionId);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.notifications.success('processes.notices.interactionRemoved');
        this.changed.emit();
      },
      error: (error) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.notifications.error(processErrorKey(error));
  }
}
