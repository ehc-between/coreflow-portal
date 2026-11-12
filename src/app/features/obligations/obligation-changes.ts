import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { FieldHelp } from '../../shared/guidance/field-help';
import { LocalDayPipe } from '../../shared/locale/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { FormField } from '../../shared/ui/form-field/form-field';
import { Icon } from '../../shared/ui/icon/icon';
import { ObligationsApi } from './data/obligations-api';
import { Change, ChangeCreate, ChangeUpdate, IMPACTS, Impact } from './data/obligation.models';
import {
  changeStatusKey,
  impactKey,
  impactTone,
  safeUrl,
  todayIso,
} from './data/obligation-display';
import { obligationErrorKey } from './data/obligation-errors';

/** Open notes first (soonest effective date first), then assessed ones, newest first. */
export function sortChanges(items: readonly Change[]): Change[] {
  return [...items].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'open' ? -1 : 1;
    }
    if (a.status === 'open') {
      return (a.effective_on ?? '9999').localeCompare(b.effective_on ?? '9999');
    }
    return b.noted_on.localeCompare(a.noted_on);
  });
}

/**
 * Change monitoring notes: upcoming amendments, new guidance or rulings that may
 * affect the obligation, each with an impact level. A note is open until someone
 * assesses it and records what (if anything) has to change.
 */
@Component({
  selector: 'app-obligation-changes',
  imports: [TranslocoPipe, FieldHelp, LocalDayPipe, Badge, Button, ConfirmDialog, FormField, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cf-ob-changes-h">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cf-ob-changes-h" class="font-display text-[15px] font-bold text-fg">
          {{ 'obligations.changes.title' | transloco }}
        </h2>
        @if (canEdit() && !adding()) {
          <app-button
            variant="secondary"
            size="sm"
            (click)="adding.set(true)"
            data-testid="change-add"
          >
            <app-icon name="plus" [size]="14" />
            {{ 'obligations.changes.add' | transloco }}
          </app-button>
        }
      </div>
      <app-field-help scope="obligations" page="detail" field="changes" />

      @if (adding()) {
        <form
          class="my-3 grid grid-cols-1 gap-3 rounded-tile border border-border p-3 sm:grid-cols-2"
          (submit)="$event.preventDefault(); add()"
          data-testid="change-form"
        >
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'obligations.changes.titleLabel' | transloco"
              inputId="cf-ch-title"
            >
              <input
                id="cf-ch-title"
                type="text"
                maxlength="255"
                required
                [value]="title()"
                (input)="title.set($any($event.target).value)"
                data-testid="change-title"
              />
            </app-form-field>
          </div>
          <div class="sm:col-span-2">
            <app-form-field
              [label]="'obligations.changes.details' | transloco"
              inputId="cf-ch-details"
            >
              <textarea
                id="cf-ch-details"
                rows="3"
                maxlength="20000"
                [value]="details()"
                (input)="details.set($any($event.target).value)"
              ></textarea>
            </app-form-field>
          </div>
          <app-form-field [label]="'obligations.changes.impact' | transloco" inputId="cf-ch-impact">
            <select id="cf-ch-impact" (change)="impact.set($any($event.target).value)">
              @for (i of impacts; track i) {
                <option [value]="i" [selected]="impact() === i">
                  {{ impactKey(i) | transloco }}
                </option>
              }
            </select>
          </app-form-field>
          <app-form-field
            [label]="'obligations.changes.sourceUrl' | transloco"
            inputId="cf-ch-source"
          >
            <input
              id="cf-ch-source"
              type="url"
              maxlength="1000"
              placeholder="https://"
              [value]="sourceUrl()"
              (input)="sourceUrl.set($any($event.target).value)"
            />
          </app-form-field>
          <app-form-field [label]="'obligations.changes.notedOn' | transloco" inputId="cf-ch-noted">
            <input
              id="cf-ch-noted"
              type="date"
              [value]="notedOn()"
              (change)="notedOn.set($any($event.target).value)"
            />
          </app-form-field>
          <app-form-field
            [label]="'obligations.changes.effectiveOn' | transloco"
            inputId="cf-ch-effective"
          >
            <input
              id="cf-ch-effective"
              type="date"
              [value]="effectiveOn()"
              (change)="effectiveOn.set($any($event.target).value)"
            />
          </app-form-field>
          <div class="flex justify-end gap-2 sm:col-span-2">
            <app-button variant="ghost" size="sm" (click)="reset()">
              {{ 'common.cancel' | transloco }}
            </app-button>
            <app-button
              type="submit"
              size="sm"
              [disabled]="!title().trim() || busy()"
              [loading]="busy()"
              data-testid="change-save"
            >
              {{ 'obligations.changes.save' | transloco }}
            </app-button>
          </div>
        </form>
      }

      @switch (state()) {
        @case ('loading') {
          <p class="mt-2 text-[13px] text-fg-muted" role="status">
            {{ 'obligations.common.loading' | transloco }}
          </p>
        }
        @case ('error') {
          <p class="mt-2 text-[13px] text-fail" role="alert">
            {{ 'obligations.common.loadFailed' | transloco }}
          </p>
        }
        @default {
          @if (sorted().length === 0) {
            <p class="mt-2 text-[13px] text-fg-muted">
              {{ 'obligations.changes.none' | transloco }}
            </p>
          } @else {
            <ul class="mt-3 flex flex-col gap-3" data-testid="change-rows">
              @for (c of sorted(); track c.id) {
                <li
                  class="rounded-tile border border-border p-3"
                  [class.opacity-70]="c.status === 'assessed'"
                >
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-[13.5px] font-semibold text-fg">{{ c.title }}</span>
                    <app-badge [tone]="impactTone(c.impact)">{{
                      impactKey(c.impact) | transloco
                    }}</app-badge>
                    <app-badge [tone]="c.status === 'open' ? 'info' : 'neutral'">{{
                      changeStatusKey(c.status) | transloco
                    }}</app-badge>
                    @if (canEdit()) {
                      <span class="ml-auto flex items-center gap-1">
                        @if (c.status === 'open' && assessingId() !== c.id) {
                          <app-button
                            variant="secondary"
                            size="sm"
                            (click)="startAssess(c)"
                            [attr.data-testid]="'change-assess-' + c.id"
                          >
                            {{ 'obligations.changes.assess' | transloco }}
                          </app-button>
                        } @else if (c.status === 'assessed') {
                          <app-button variant="ghost" size="sm" (click)="reopen(c)">
                            {{ 'obligations.changes.reopen' | transloco }}
                          </app-button>
                        }
                        <app-button
                          variant="ghost"
                          size="sm"
                          [attr.aria-label]="'obligations.changes.remove' | transloco"
                          (click)="removing.set(c)"
                        >
                          <app-icon name="trash" [size]="14" />
                        </app-button>
                      </span>
                    }
                  </div>
                  <p class="mt-1 flex flex-wrap gap-x-3 text-[12px] text-fg-subtle">
                    <span>{{
                      'obligations.changes.noted' | transloco: { date: (c.noted_on | localDay) }
                    }}</span>
                    @if (c.effective_on) {
                      <span>{{
                        'obligations.changes.effective'
                          | transloco: { date: (c.effective_on | localDay) }
                      }}</span>
                    }
                    @if (link(c.source_url); as url) {
                      <a
                        [href]="url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="font-semibold text-accent hover:underline"
                      >
                        {{ 'obligations.changes.source' | transloco }}
                      </a>
                    }
                  </p>
                  @if (c.details) {
                    <p class="mt-2 text-[13px] whitespace-pre-line text-fg">{{ c.details }}</p>
                  }
                  @if (c.status === 'assessed') {
                    <p class="mt-2 text-[12.5px] whitespace-pre-line text-fg-muted">
                      <span class="font-semibold text-fg">{{
                        'obligations.changes.assessmentBy'
                          | transloco
                            : {
                                name: c.assessed_by?.name ?? '',
                                date: (c.assessed_at | localDay),
                              }
                      }}</span>
                      @if (c.assessment) {
                        {{ c.assessment }}
                      }
                    </p>
                  }
                  @if (assessingId() === c.id) {
                    <form
                      class="mt-3 flex flex-col gap-2"
                      (submit)="$event.preventDefault(); assess(c)"
                    >
                      <app-form-field
                        [label]="'obligations.changes.assessment' | transloco"
                        [inputId]="'cf-ch-assess-' + c.id"
                      >
                        <textarea
                          [id]="'cf-ch-assess-' + c.id"
                          rows="3"
                          maxlength="20000"
                          [value]="assessment()"
                          (input)="assessment.set($any($event.target).value)"
                        ></textarea>
                      </app-form-field>
                      <div class="flex justify-end gap-2">
                        <app-button variant="ghost" size="sm" (click)="assessingId.set(null)">
                          {{ 'common.cancel' | transloco }}
                        </app-button>
                        <app-button type="submit" size="sm" [loading]="busy()" [disabled]="busy()">
                          {{ 'obligations.changes.markAssessed' | transloco }}
                        </app-button>
                      </div>
                    </form>
                  }
                </li>
              }
            </ul>
          }
        }
      }

      <app-confirm-dialog
        [open]="!!removing()"
        [title]="'obligations.changes.removeTitle' | transloco"
        [message]="
          'obligations.changes.removeMessage' | transloco: { title: removing()?.title ?? '' }
        "
        [confirmLabel]="'obligations.changes.remove' | transloco"
        [cancelLabel]="'common.cancel' | transloco"
        [busy]="busy()"
        (confirmed)="remove()"
        (cancelled)="removing.set(null)"
      />
    </section>
  `,
})
export class ObligationChanges {
  private readonly api = inject(ObligationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);

  readonly obligationId = input.required<string>();
  readonly canEdit = input(false);
  /** Emitted after any change, so the page can refresh the open-notes count. */
  readonly changed = output<void>();

  protected readonly impacts = IMPACTS;
  protected readonly impactKey = impactKey;
  protected readonly impactTone = impactTone;
  protected readonly changeStatusKey = changeStatusKey;
  protected readonly link = safeUrl;

  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly items = signal<readonly Change[]>([]);
  protected readonly sorted = computed(() => sortChanges(this.items()));
  protected readonly adding = signal(false);
  protected readonly busy = signal(false);
  protected readonly removing = signal<Change | null>(null);
  protected readonly assessingId = signal<string | null>(null);
  protected readonly assessment = signal('');

  protected readonly title = signal('');
  protected readonly details = signal('');
  protected readonly impact = signal<Impact>('low');
  protected readonly sourceUrl = signal('');
  protected readonly notedOn = signal(todayIso());
  protected readonly effectiveOn = signal('');

  private request = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.obligationId();
      untracked(() => this.load(orgId, id));
    });
  }

  protected reset(): void {
    this.adding.set(false);
    this.title.set('');
    this.details.set('');
    this.impact.set('low');
    this.sourceUrl.set('');
    this.notedOn.set(todayIso());
    this.effectiveOn.set('');
  }

  protected add(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || !this.title().trim() || this.busy()) {
      return;
    }
    const body: ChangeCreate = {
      title: this.title().trim(),
      details: this.details().trim() || null,
      source_url: this.sourceUrl().trim() || null,
      noted_on: this.notedOn() || null,
      effective_on: this.effectiveOn() || null,
      impact: this.impact(),
    };
    this.busy.set(true);
    this.api.addChange(orgId, this.obligationId(), body).subscribe({
      next: (change) => {
        this.busy.set(false);
        this.reset();
        this.items.set([change, ...this.items()]);
        this.notifications.success('obligations.notices.changeAdded');
        this.changed.emit();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected startAssess(change: Change): void {
    this.assessment.set(change.assessment ?? '');
    this.assessingId.set(change.id);
  }

  protected assess(change: Change): void {
    this.patch(change, { status: 'assessed', assessment: this.assessment().trim() || null });
  }

  protected reopen(change: Change): void {
    this.patch(change, { status: 'open' });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const target = this.removing();
    if (!orgId || !target || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.removeChange(orgId, this.obligationId(), target.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.removing.set(null);
        this.items.set(this.items().filter((c) => c.id !== target.id));
        this.notifications.success('obligations.notices.changeRemoved');
        this.changed.emit();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private patch(change: Change, body: ChangeUpdate): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.updateChange(orgId, this.obligationId(), change.id, body).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.assessingId.set(null);
        this.items.set(this.items().map((c) => (c.id === updated.id ? updated : c)));
        this.notifications.success('obligations.notices.changeUpdated');
        this.changed.emit();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.notifications.error(obligationErrorKey(error));
  }

  private load(orgId: string | null, id: string): void {
    this.request.unsubscribe();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.request = this.api.changes(orgId, id).subscribe({
      next: (items) => {
        this.items.set(items);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }
}
