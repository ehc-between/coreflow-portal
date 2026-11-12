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
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { Icon } from '../../../shared/ui/icon/icon';
import { processErrorKey } from '../data/process-errors';
import { ProcessReferences } from '../data/process-references';
import { InteractionDirection, ProcessDetail } from '../data/process.models';
import { ProcessesApi } from '../data/processes-api';

/**
 * Interactions of a process with other processes: what it receives from upstream
 * processes (incoming) and provides to downstream ones (outgoing), each with a
 * label for what flows. Editors add (target, direction, label) and remove them.
 * Emits after every change so the page can reload the process and its turtle.
 */
@Component({
  selector: 'app-interactions-panel',
  imports: [RouterLink, TranslocoPipe, FieldHelp, Button, Card, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = process();
    <app-card>
      <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-[15px] font-bold text-fg">
          {{ 'processes.interactions.title' | transloco }}
        </h2>
        <a routerLink="/processes/interaction-map" class="text-[12.5px] font-semibold text-accent">
          {{ 'processes.interactions.openMap' | transloco }}
        </a>
      </div>
      <app-field-help scope="processes" page="detail" field="interactions" />
      <ul class="mt-2 flex flex-col divide-y divide-border" data-testid="interactions">
        @for (i of p.interactions; track i.id) {
          <li class="flex items-center gap-2 py-2 text-[13px]">
            <span
              class="w-[110px] flex-none text-[12px] font-semibold"
              [class.text-info]="i.direction === 'incoming'"
              [class.text-pass]="i.direction === 'outgoing'"
            >
              {{ 'processes.interactions.direction.' + i.direction | transloco }}
            </span>
            <span class="min-w-0 flex-1">
              <a
                [routerLink]="['/processes', i.process.id]"
                class="font-semibold text-fg hover:text-accent"
              >
                {{ i.process.code }} · {{ i.process.title }}
              </a>
              @if (i.label) {
                <span class="block text-[12.5px] text-fg-muted">{{ i.label }}</span>
              }
            </span>
            @if (p.can_edit) {
              <button
                type="button"
                class="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] text-fg-subtle hover:text-fail"
                [attr.aria-label]="
                  'processes.interactions.remove' | transloco: { code: i.process.code }
                "
                [disabled]="busy()"
                (click)="remove(i.id)"
              >
                <app-icon name="x" [size]="14" />
              </button>
            }
          </li>
        } @empty {
          <li class="py-2 text-[13px] text-fg-muted">
            {{ 'processes.interactions.empty' | transloco }}
          </li>
        }
      </ul>

      @if (p.can_edit) {
        <form
          class="mt-3 grid grid-cols-1 gap-2 rounded-[10px] bg-surface-2 p-3 md:grid-cols-[1fr_150px]"
          (submit)="$event.preventDefault(); add()"
        >
          <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
            {{ 'processes.interactions.target' | transloco }}
            <select
              class="cf-int"
              [value]="target()"
              (change)="target.set($any($event.target).value)"
              data-testid="interaction-target"
            >
              <option value="">{{ 'processes.interactions.chooseTarget' | transloco }}</option>
              @for (o of targets(); track o.id) {
                <option [value]="o.id">{{ o.code }} · {{ o.title }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
            {{ 'processes.interactions.directionLabel' | transloco }}
            <select
              class="cf-int"
              [value]="direction()"
              (change)="direction.set($any($event.target).value)"
            >
              <option value="outgoing">
                {{ 'processes.interactions.direction.outgoing' | transloco }}
              </option>
              <option value="incoming">
                {{ 'processes.interactions.direction.incoming' | transloco }}
              </option>
            </select>
          </label>
          <label
            class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted md:col-span-2"
          >
            {{ 'processes.interactions.label' | transloco }}
            <input
              class="cf-int"
              maxlength="255"
              [placeholder]="'processes.interactions.labelPlaceholder' | transloco"
              [value]="label()"
              (input)="label.set($any($event.target).value)"
            />
          </label>
          <div class="md:col-span-2">
            <app-button
              type="submit"
              size="sm"
              variant="secondary"
              [disabled]="!target() || busy()"
              data-testid="interaction-add"
            >
              <app-icon name="plus" [size]="14" />
              {{ 'processes.interactions.add' | transloco }}
            </app-button>
          </div>
        </form>
      }
    </app-card>
  `,
  styles: [
    `
      .cf-int {
        height: 36px;
        border-radius: 9px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        font-size: 13px;
        font-weight: 400;
        padding: 0 10px;
        outline: none;
      }
      .cf-int:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
    `,
  ],
})
export class InteractionsPanel {
  private readonly api = inject(ProcessesApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly references = inject(ProcessReferences);

  readonly process = input.required<ProcessDetail>();
  readonly changed = output<void>();

  protected readonly busy = signal(false);
  protected readonly target = signal('');
  protected readonly direction = signal<InteractionDirection>('outgoing');
  protected readonly label = signal('');

  protected readonly targets = computed(() => {
    const id = this.process().id;
    return this.references.processes().filter((p) => p.id !== id);
  });

  constructor() {
    this.references.ensureProcesses();
  }

  protected add(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const target = this.target();
    if (!orgId || !target || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api
      .addInteraction(orgId, this.process().id, {
        target_process_id: target,
        direction: this.direction(),
        label: this.label().trim() || null,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.target.set('');
          this.label.set('');
          this.notifications.success('processes.notices.interactionAdded');
          this.changed.emit();
        },
        error: (error) => this.fail(error),
      });
  }

  protected remove(interactionId: string): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.removeInteraction(orgId, this.process().id, interactionId).subscribe({
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
