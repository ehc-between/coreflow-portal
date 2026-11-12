import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../../core/ai/page-context';
import { LanguageService } from '../../../core/i18n/language.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { FieldHelp } from '../../../shared/guidance/field-help';
import { TeachingEmpty } from '../../../shared/guidance/teaching-empty';
import { LocalDayPipe } from '../../../shared/locale/locale-pipes';
import { startOfDay, todayDay } from '../../../shared/tasks/task-display';
import { Badge } from '../../../shared/ui/badge/badge';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiTile } from '../../../shared/ui/kpi-tile/kpi-tile';
import { Pager } from '../../../shared/ui/pager/pager';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { SlideOver } from '../../../shared/ui/slide-over/slide-over';
import { AiGovernanceApi } from '../data/ai-governance-api';
import { aiGovernanceErrorKey } from '../data/ai-governance-errors';
import { AiGovernanceStore } from '../data/ai-governance-store';
import {
  LITERACY_SOURCES,
  LiteracyCoverage,
  LiteracyRecord,
  LiteracySource,
} from '../data/ai-governance.models';
import {
  AI_GOVERNANCE_MODULE,
  AI_GOVERNANCE_SCOPE,
  literacySourceKey,
} from '../data/ai-governance-display';
import { AiGovPage } from '../ui/ai-gov-page';
import { AiLessonCard } from '../ui/ai-lesson-card';
import { AiUserSelect } from '../ui/user-select';

const PAGE_SIZE = 25;

interface Draft {
  user_id: string;
  topic: string;
  source: LiteracySource;
  completed: string;
  valid_until: string;
  notes: string;
}

const emptyDraft = (): Draft => ({
  user_id: '',
  topic: '',
  source: 'training',
  completed: todayDay(),
  valid_until: '',
  notes: '',
});

/**
 * `/ai-governance/literacy`: AI literacy (Art. 4) — coverage of the org's
 * members (covered, expired, missing), the records list, and recording a
 * training, briefing or self-study. Courses themselves live in Training.
 */
@Component({
  selector: 'app-ai-literacy-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    FieldHelp,
    TeachingEmpty,
    LocalDayPipe,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    Icon,
    KpiTile,
    Pager,
    ProgressBar,
    SlideOver,
    AiGovPage,
    AiLessonCard,
    AiUserSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ai-gov-page titleKey="aiGovernance.literacy.title" page="literacy">
      <div actions class="flex flex-wrap gap-2">
        <a
          routerLink="/training"
          class="inline-flex h-8 items-center rounded-tile border border-border px-3 text-[13px] font-semibold text-fg hover:bg-surface-2"
        >
          {{ 'aiGovernance.literacy.toTraining' | transloco }}
        </a>
        @if (store.canWrite()) {
          <app-button size="sm" (click)="openForm()" data-testid="literacy-new">
            <app-icon name="plus" [size]="14" />
            {{ 'aiGovernance.literacy.record' | transloco }}
          </app-button>
        }
      </div>

      @if (coverage(); as c) {
        <div class="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <app-kpi-tile
            [label]="'aiGovernance.literacy.coverage' | transloco"
            [value]="c.coverage + '%'"
            [tone]="c.coverage >= 80 ? 'pass' : c.coverage >= 50 ? 'warn' : 'fail'"
          />
          <app-kpi-tile
            [label]="'aiGovernance.literacy.covered' | transloco"
            [value]="c.covered"
            tone="pass"
          />
          <app-kpi-tile
            [label]="'aiGovernance.literacy.expired' | transloco"
            [value]="c.expired"
            [tone]="c.expired ? 'warn' : 'neutral'"
          />
          <app-kpi-tile
            [label]="'aiGovernance.literacy.missing' | transloco"
            [value]="c.missing"
            [tone]="c.missing ? 'fail' : 'neutral'"
          />
        </div>
        <app-card class="mb-5">
          <app-progress-bar
            [value]="c.coverage"
            [label]="
              'aiGovernance.literacy.coverageOf'
                | transloco: { covered: c.covered, total: c.members_total }
            "
          />
          @if (c.missing_users.length || c.expired_users.length) {
            <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              @if (c.missing_users.length) {
                <div>
                  <h2 class="mb-1.5 text-[13px] font-bold text-fg">
                    {{ 'aiGovernance.literacy.missingUsers' | transloco }}
                  </h2>
                  <ul class="flex flex-wrap gap-1.5">
                    @for (u of c.missing_users; track u.id) {
                      <li>
                        @if (store.canWrite()) {
                          <button
                            type="button"
                            class="rounded-full border border-border px-2.5 py-0.5 text-[12.5px] text-fg hover:border-accent hover:text-accent"
                            (click)="openForm(u.id)"
                          >
                            {{ u.name }}
                          </button>
                        } @else {
                          <span
                            class="rounded-full border border-border px-2.5 py-0.5 text-[12.5px] text-fg"
                            >{{ u.name }}</span
                          >
                        }
                      </li>
                    }
                  </ul>
                </div>
              }
              @if (c.expired_users.length) {
                <div>
                  <h2 class="mb-1.5 text-[13px] font-bold text-fg">
                    {{ 'aiGovernance.literacy.expiredUsers' | transloco }}
                  </h2>
                  <ul class="flex flex-wrap gap-1.5">
                    @for (u of c.expired_users; track u.id) {
                      <li
                        class="rounded-full border border-warn/40 bg-warn-soft px-2.5 py-0.5 text-[12.5px] text-fg"
                      >
                        {{ u.name }}
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>
          }
        </app-card>
      }

      <app-card [padded]="false">
        @switch (state()) {
          @case ('loading') {
            <p class="py-10 text-center text-[14px] text-fg-muted">
              {{ 'aiGovernance.common.loading' | transloco }}
            </p>
          }
          @case ('error') {
            <p class="py-10 text-center text-[14px] text-fail" role="alert">
              {{ 'aiGovernance.common.loadFailed' | transloco }}
            </p>
          }
          @default {
            @if (records().length === 0) {
              <app-teaching-empty
                [scope]="scope"
                page="literacy"
                [showAction]="store.canWrite()"
                (action)="openForm()"
              />
            } @else {
              <ul class="divide-y divide-border" data-testid="literacy-list">
                @for (r of records(); track r.id) {
                  <li class="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                    <div class="min-w-0 flex-1">
                      <p class="text-[13.5px] font-semibold text-fg">{{ r.user.name }}</p>
                      <p class="text-[12.5px] text-fg-muted">
                        {{ r.topic }} · {{ sourceKey(r.source) | transloco }} ·
                        {{ r.completed_at | localDay }}
                      </p>
                    </div>
                    <span class="flex items-center gap-2 text-[12.5px] text-fg-muted">
                      @if (r.valid_until) {
                        {{
                          'aiGovernance.literacy.validUntil'
                            | transloco: { date: (r.valid_until | localDay) }
                        }}
                      }
                      <app-badge [tone]="r.valid ? 'pass' : 'warn'">{{
                        (r.valid
                          ? 'aiGovernance.literacy.valid'
                          : 'aiGovernance.literacy.expiredOne'
                        ) | transloco
                      }}</app-badge>
                      @if (store.canWrite()) {
                        <button
                          type="button"
                          class="rounded-[8px] p-1 text-fg-subtle hover:text-fail focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                          [attr.aria-label]="
                            'aiGovernance.literacy.delete'
                              | transloco: { name: r.user.name, topic: r.topic }
                          "
                          (click)="pendingDelete.set(r)"
                        >
                          <app-icon name="trash" [size]="14" />
                        </button>
                      }
                    </span>
                  </li>
                }
              </ul>
              <div class="border-t border-border px-4 py-2.5">
                <app-pager
                  [offset]="offset()"
                  [pageSize]="pageSize"
                  [count]="records().length"
                  [total]="total()"
                  (pageChange)="offset.set($event)"
                />
              </div>
            }
          }
        }
      </app-card>

      <div class="mt-5">
        <app-ai-lesson-card lesson="ai-literacy" />
      </div>
    </app-ai-gov-page>

    <app-slide-over
      [open]="formOpen()"
      [title]="'aiGovernance.literacy.formTitle' | transloco"
      [closeLabel]="'aiGovernance.common.close' | transloco"
      (closed)="formOpen.set(false)"
    >
      <form
        class="flex flex-col gap-4"
        (submit)="$event.preventDefault(); save()"
        novalidate
        data-testid="literacy-form"
      >
        <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted" for="lit-user">
          {{ 'aiGovernance.literacy.person' | transloco }}
        </label>
        <app-ai-user-select
          class="-mt-3"
          selectId="lit-user"
          noneKey="aiGovernance.literacy.pickPerson"
          [required]="true"
          [(value)]="userId"
        />
        <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
          {{ 'aiGovernance.literacy.topic' | transloco }}
          <input
            type="text"
            required
            maxlength="200"
            class="h-9 rounded-tile border border-border bg-bg px-3 text-[13.5px] font-normal text-fg"
            [placeholder]="'aiGovernance.literacy.topicPlaceholder' | transloco"
            [value]="draft().topic"
            (input)="patch({ topic: $any($event.target).value })"
          />
        </label>
        <app-field-help [scope]="scope" page="literacy" field="topic" />
        <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
          {{ 'aiGovernance.literacy.source' | transloco }}
          <select
            class="h-9 rounded-tile border border-border bg-bg px-2 text-[13.5px] font-normal text-fg"
            (change)="patch({ source: $any($event.target).value })"
          >
            @for (s of sources; track s) {
              <option [value]="s" [selected]="draft().source === s">
                {{ sourceKey(s) | transloco }}
              </option>
            }
          </select>
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
          {{ 'aiGovernance.literacy.completedAt' | transloco }}
          <input
            type="date"
            required
            class="h-9 rounded-tile border border-border bg-bg px-3 text-[13.5px] font-normal text-fg"
            [value]="draft().completed"
            (input)="patch({ completed: $any($event.target).value })"
          />
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
          {{ 'aiGovernance.literacy.validUntilLabel' | transloco }}
          <input
            type="date"
            class="h-9 rounded-tile border border-border bg-bg px-3 text-[13.5px] font-normal text-fg"
            [value]="draft().valid_until"
            (input)="patch({ valid_until: $any($event.target).value })"
          />
          <span class="text-[12px] font-normal text-fg-subtle">{{
            'aiGovernance.literacy.validUntilHint' | transloco
          }}</span>
        </label>
        <label class="flex flex-col gap-1 text-[12.5px] font-semibold text-fg-muted">
          {{ 'aiGovernance.literacy.notes' | transloco }}
          <textarea
            rows="3"
            maxlength="4000"
            class="rounded-tile border border-border bg-bg px-3 py-2 text-[13.5px] font-normal text-fg"
            [value]="draft().notes"
            (input)="patch({ notes: $any($event.target).value })"
          ></textarea>
        </label>
        @if (formError()) {
          <p class="text-[12.5px] text-fail" role="alert">{{ formError()! | transloco }}</p>
        }
        <div class="flex justify-end gap-2">
          <app-button variant="secondary" (click)="formOpen.set(false)">{{
            'aiGovernance.common.cancel' | transloco
          }}</app-button>
          <app-button
            type="submit"
            [loading]="saving()"
            [disabled]="!userId() || !draft().topic.trim() || !draft().completed"
          >
            {{ 'aiGovernance.common.save' | transloco }}
          </app-button>
        </div>
      </form>
    </app-slide-over>

    <app-confirm-dialog
      [open]="!!pendingDelete()"
      [title]="'aiGovernance.literacy.deleteTitle' | transloco"
      [message]="
        'aiGovernance.literacy.deleteMessage'
          | transloco: { name: pendingDelete()?.user?.name ?? '' }
      "
      [confirmLabel]="'aiGovernance.common.delete' | transloco"
      [cancelLabel]="'aiGovernance.common.cancel' | transloco"
      [busy]="deleting()"
      (confirmed)="remove()"
      (cancelled)="pendingDelete.set(null)"
    />
  `,
})
export class AiLiteracyPage {
  private readonly api = inject(AiGovernanceApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);
  private readonly notifications = inject(NotificationService);
  protected readonly store = inject(AiGovernanceStore);

  protected readonly scope = AI_GOVERNANCE_SCOPE;
  protected readonly sources = LITERACY_SOURCES;
  protected readonly sourceKey = literacySourceKey;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly coverage = signal<LiteracyCoverage | null>(null);
  protected readonly records = signal<readonly LiteracyRecord[]>([]);
  protected readonly total = signal(0);
  protected readonly offset = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly formOpen = signal(false);
  protected readonly userId = signal('');
  protected readonly draft = signal<Draft>(emptyDraft());
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly pendingDelete = signal<LiteracyRecord | null>(null);
  protected readonly deleting = signal(false);
  private readonly reload = signal(0);

  constructor() {
    providePageContext(() => ({
      module: AI_GOVERNANCE_MODULE,
      view: 'list',
      title: this.language.translate('aiGovernance.literacy.title'),
    }));
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const offset = this.offset();
      this.reload();
      untracked(() => {
        if (!orgId) {
          return;
        }
        this.api.literacyCoverage(orgId).subscribe({
          next: (c) => this.coverage.set(c),
          error: () => this.coverage.set(null),
        });
        this.api.listLiteracy(orgId, { limit: PAGE_SIZE, offset }).subscribe({
          next: (page) => {
            this.records.set(page.items);
            this.total.set(page.total);
            this.state.set('ready');
          },
          error: () => this.state.set('error'),
        });
      });
    });
  }

  protected openForm(userId = ''): void {
    this.draft.set(emptyDraft());
    this.userId.set(userId);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected patch(change: Partial<Draft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const d = this.draft();
    if (!orgId || !this.userId() || !d.topic.trim() || !d.completed || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    this.api
      .addLiteracy(orgId, {
        user_id: this.userId(),
        topic: d.topic.trim(),
        source: d.source,
        completed_at: startOfDay(d.completed),
        valid_until: d.valid_until ? startOfDay(d.valid_until) : null,
        notes: d.notes.trim() || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.notifications.success('aiGovernance.literacy.saved');
          this.reload.update((n) => n + 1);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.formError.set(aiGovernanceErrorKey(err));
        },
      });
  }

  protected remove(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const record = this.pendingDelete();
    if (!orgId || !record) {
      return;
    }
    this.deleting.set(true);
    this.api.deleteLiteracy(orgId, record.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
        this.reload.update((n) => n + 1);
      },
      error: (err: unknown) => {
        this.deleting.set(false);
        this.pendingDelete.set(null);
        this.notifications.error(aiGovernanceErrorKey(err));
      },
    });
  }
}
