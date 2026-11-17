import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { providePageContext } from '../../core/ai/page-context';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { HelpStrip } from '../../shared/ui/help-strip/help-strip';
import { Icon } from '../../shared/ui/icon/icon';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { PeopleApi } from './data/people-api';
import { hasPerm } from './data/people-display';
import { peopleErrorKey } from './data/people-errors';
import {
  ACTION_KEYS,
  ActionKey,
  CHECKLIST_KINDS,
  ChecklistItemIn,
  ChecklistKind,
  ChecklistTemplates,
  ITEM_CATEGORIES,
  ItemCategory,
  PERM_MANAGE,
  PeopleLang,
  TemplateItem,
} from './data/people.models';
import { PEOPLE_ROOT } from './ui/people-nav';

/** One editable template row. System rows (ticked by CoreFlow) are kept as they are. */
export interface TemplateRow {
  readonly key: number;
  readonly text: string;
  readonly category: ItemCategory;
  readonly required: boolean;
  readonly action_key: ActionKey | '';
  readonly system: boolean;
}

let nextKey = 0;

export function rowsFrom(items: readonly TemplateItem[]): TemplateRow[] {
  return items.map((i) => ({
    key: ++nextKey,
    text: i.text,
    category: i.category,
    required: i.required,
    action_key: i.action_key ?? '',
    system: !!i.system_key,
  }));
}

/** The PUT body: the editable rows with text, in order (system rows are re-added by the backend). */
export function toTemplateItems(rows: readonly TemplateRow[]): ChecklistItemIn[] {
  return rows
    .filter((r) => !r.system && r.text.trim())
    .map((r) => ({
      text: r.text.trim(),
      category: r.category,
      required: r.required,
      action_key: r.action_key || null,
    }));
}

/**
 * People settings (`/people/settings`): the organisation's own default checklists
 * for joiners and leavers, in Norwegian and English. Each item has a category, can
 * be required, and can record a fact on the person when ticked (e.g. "Taushetserklæring
 * signert" sets the date on the person). "Tilbakestill" goes back to CoreFlow's
 * built-in template. Changing needs `people:manage`; everyone can read.
 */
@Component({
  selector: 'app-people-settings',
  imports: [
    TranslocoPipe,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    ErrorState,
    HelpStrip,
    Icon,
    LoadingState,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[960px] px-4 pt-6 pb-24 sm:px-8 sm:pt-7 sm:pb-12">
      <app-page-header
        titleKey="people.settings.title"
        descriptionKey="people.settings.subtitle"
        [breadcrumbs]="[
          { labelKey: 'people.settings.hub', link: '/settings' },
          root,
          { labelKey: 'people.settings.title' },
        ]"
      />
      <app-help-strip scope="people" page="settings" lesson="joiners-and-leavers" />

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <div
          class="inline-flex rounded-tile border border-border bg-bg p-0.5"
          role="group"
          [attr.aria-label]="'people.settings.kindLabel' | transloco"
        >
          @for (k of kinds; track k) {
            <button
              type="button"
              class="h-9 rounded-lg px-3 text-ui font-semibold"
              [class]="kind() === k ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:text-fg'"
              [attr.aria-pressed]="kind() === k"
              (click)="switchKind(k)"
              [attr.data-testid]="'template-kind-' + k"
            >
              {{ 'people.checklistKinds.' + k | transloco }}
            </button>
          }
        </div>
        <label class="sr-only" for="cf-tpl-lang">{{
          'people.settings.language' | transloco
        }}</label>
        <select
          id="cf-tpl-lang"
          class="h-10 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
          (change)="setLang($any($event.target).value)"
          data-testid="template-lang"
        >
          @for (l of langs; track l) {
            <option [value]="l" [selected]="lang() === l">
              {{ 'people.settings.languages.' + l | transloco }}
            </option>
          }
        </select>
        @if (templates()?.custom?.[kind()]) {
          <app-badge tone="info">{{ 'people.settings.custom' | transloco }}</app-badge>
        } @else if (templates()) {
          <app-badge tone="neutral">{{ 'people.settings.builtIn' | transloco }}</app-badge>
        }
      </div>

      <app-card>
        @switch (state()) {
          @case ('loading') {
            <app-loading-state [rows]="6" />
          }
          @case ('error') {
            <app-error-state (retry)="load()" />
          }
          @default {
            <p class="mb-3 text-meta text-fg-muted">
              {{ 'people.settings.kindHint.' + kind() | transloco }}
            </p>
            <ol class="flex flex-col gap-2" data-testid="template-rows">
              @for (
                row of rows();
                track row.key;
                let i = $index;
                let first = $first;
                let last = $last
              ) {
                <li
                  class="flex flex-col gap-2 rounded-tile border border-border p-3 sm:flex-row sm:items-start"
                >
                  <span class="w-6 flex-none pt-2 font-mono text-meta text-fg-subtle">{{
                    i + 1
                  }}</span>
                  <div class="flex min-w-0 flex-1 flex-col gap-2">
                    <label class="sr-only" [for]="'cf-tpl-text-' + row.key">{{
                      'people.settings.itemText' | transloco: { n: i + 1 }
                    }}</label>
                    <input
                      [id]="'cf-tpl-text-' + row.key"
                      type="text"
                      maxlength="500"
                      class="h-10 rounded-tile border border-border bg-bg px-3 text-ui text-fg outline-none focus:border-accent disabled:opacity-70"
                      [disabled]="!canManage() || row.system"
                      [value]="row.text"
                      (input)="patch(row.key, { text: $any($event.target).value })"
                    />
                    <div class="flex flex-wrap items-center gap-2">
                      <label class="sr-only" [for]="'cf-tpl-cat-' + row.key">{{
                        'people.fields.category' | transloco
                      }}</label>
                      <select
                        [id]="'cf-tpl-cat-' + row.key"
                        class="h-9 rounded-tile border border-border bg-bg px-2 text-ui text-fg"
                        [disabled]="!canManage() || row.system"
                        (change)="patch(row.key, { category: $any($event.target).value })"
                      >
                        @for (c of categories; track c) {
                          <option [value]="c" [selected]="row.category === c">
                            {{ 'people.itemCategories.' + c | transloco }}
                          </option>
                        }
                      </select>
                      <label class="sr-only" [for]="'cf-tpl-action-' + row.key">{{
                        'people.settings.actionLabel' | transloco
                      }}</label>
                      <select
                        [id]="'cf-tpl-action-' + row.key"
                        class="h-9 max-w-full rounded-tile border border-border bg-bg px-2 text-ui text-fg"
                        [disabled]="!canManage() || row.system"
                        (change)="patch(row.key, { action_key: $any($event.target).value })"
                      >
                        <option value="" [selected]="!row.action_key">
                          {{ 'people.settings.noAction' | transloco }}
                        </option>
                        @for (a of actions; track a) {
                          <option [value]="a" [selected]="row.action_key === a">
                            {{ 'people.settings.actions.' + a | transloco }}
                          </option>
                        }
                      </select>
                      <label class="flex items-center gap-2 text-ui text-fg">
                        <input
                          type="checkbox"
                          class="h-4 w-4 accent-[var(--accent)]"
                          [disabled]="!canManage() || row.system"
                          [checked]="row.required"
                          (change)="patch(row.key, { required: $any($event.target).checked })"
                        />
                        {{ 'people.checklists.required' | transloco }}
                      </label>
                      @if (row.system) {
                        <span class="text-meta text-fg-muted">{{
                          'people.settings.systemItem' | transloco
                        }}</span>
                      }
                    </div>
                  </div>
                  @if (canManage() && !row.system) {
                    <div class="flex flex-none gap-1">
                      <button
                        type="button"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 disabled:opacity-40"
                        [disabled]="first"
                        [attr.aria-label]="'people.settings.moveUp' | transloco: { n: i + 1 }"
                        (click)="move(i, -1)"
                      >
                        <span aria-hidden="true">↑</span>
                      </button>
                      <button
                        type="button"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-muted hover:bg-surface-2 disabled:opacity-40"
                        [disabled]="last"
                        [attr.aria-label]="'people.settings.moveDown' | transloco: { n: i + 1 }"
                        (click)="move(i, 1)"
                      >
                        <span aria-hidden="true">↓</span>
                      </button>
                      <button
                        type="button"
                        class="inline-flex h-8 w-8 items-center justify-center rounded-tile text-fg-muted hover:bg-fail-soft hover:text-fail"
                        [attr.aria-label]="'people.settings.removeItem' | transloco: { n: i + 1 }"
                        (click)="removeRow(row.key)"
                      >
                        <app-icon name="trash" [size]="14" />
                      </button>
                    </div>
                  }
                </li>
              }
            </ol>
            @if (canManage()) {
              <div class="mt-3">
                <app-button variant="secondary" (click)="addRow()" data-testid="template-add">
                  <app-icon name="plus" [size]="14" />
                  {{ 'people.checklists.addItem' | transloco }}
                </app-button>
              </div>
            } @else {
              <p class="mt-3 text-meta text-fg-muted">
                {{ 'people.settings.readOnly' | transloco }}
              </p>
            }
          }
        }
      </app-card>

      @if (canManage() && state() === 'ready') {
        <div
          class="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
        >
          @if (templates()?.custom?.[kind()]) {
            <app-button variant="ghost" (click)="resetting.set(true)" data-testid="template-reset">
              {{ 'people.settings.reset' | transloco }}
            </app-button>
          }
          <app-button
            (click)="save()"
            [loading]="busy()"
            [disabled]="busy() || !dirty() || !hasItems()"
            data-testid="template-save"
          >
            {{ 'people.settings.save' | transloco }}
          </app-button>
        </div>
      }
    </div>

    <app-confirm-dialog
      [open]="resetting()"
      [title]="'people.settings.resetTitle' | transloco"
      [message]="'people.settings.resetMessage' | transloco"
      [confirmLabel]="'people.settings.reset' | transloco"
      [cancelLabel]="'common.cancel' | transloco"
      [busy]="busy()"
      (confirmed)="reset()"
      (cancelled)="resetting.set(false)"
    />
  `,
})
export class PeopleSettings {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly notifications = inject(NotificationService);
  private readonly language = inject(LanguageService);

  protected readonly root = PEOPLE_ROOT;
  protected readonly kinds = CHECKLIST_KINDS;
  protected readonly categories = ITEM_CATEGORIES;
  protected readonly actions = ACTION_KEYS;
  protected readonly langs: readonly PeopleLang[] = ['nb', 'en'];

  protected readonly kind = signal<ChecklistKind>('onboarding');
  protected readonly lang = signal<PeopleLang>(this.language.active() === 'en' ? 'en' : 'nb');
  protected readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  protected readonly templates = signal<ChecklistTemplates | null>(null);
  protected readonly rows = signal<readonly TemplateRow[]>([]);
  protected readonly dirty = signal(false);
  protected readonly busy = signal(false);
  protected readonly resetting = signal(false);

  protected readonly canManage = computed(() =>
    hasPerm(this.selectedOrg.currentOrg()?.permissions, PERM_MANAGE),
  );
  protected readonly hasItems = computed(() => toTemplateItems(this.rows()).length > 0);

  constructor() {
    providePageContext(() => ({
      module: 'people',
      entityType: 'people_checklist',
      view: 'settings',
      title: this.language.translate('people.settings.title'),
    }));
    effect(() => {
      this.selectedOrg.currentOrgId();
      this.lang();
      untracked(() => this.load());
    });
  }

  protected switchKind(kind: ChecklistKind): void {
    this.kind.set(kind);
    this.showRows();
  }

  protected setLang(value: string): void {
    this.lang.set(value === 'en' ? 'en' : 'nb');
  }

  protected patch(key: number, patch: Partial<TemplateRow>): void {
    this.rows.update((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    this.dirty.set(true);
  }

  protected addRow(): void {
    this.rows.update((rows) => [
      ...rows,
      {
        key: ++nextKey,
        text: '',
        category: 'other',
        required: true,
        action_key: '',
        system: false,
      },
    ]);
    this.dirty.set(true);
  }

  protected removeRow(key: number): void {
    this.rows.update((rows) => rows.filter((r) => r.key !== key));
    this.dirty.set(true);
  }

  protected move(index: number, by: -1 | 1): void {
    this.rows.update((rows) => {
      const next = [...rows];
      const target = index + by;
      if (target < 0 || target >= next.length) {
        return rows;
      }
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    this.dirty.set(true);
  }

  protected save(): void {
    const orgId = this.selectedOrg.currentOrgId();
    const items = toTemplateItems(this.rows());
    if (!orgId || !items.length || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.saveChecklistTemplate(orgId, this.kind(), this.lang(), items).subscribe({
      next: (templates) => {
        this.busy.set(false);
        this.notifications.success('people.notices.templateSaved');
        this.apply(templates);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }

  protected reset(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.resetChecklistTemplate(orgId, this.kind()).subscribe({
      next: () => {
        this.busy.set(false);
        this.resetting.set(false);
        this.notifications.success('people.notices.templateReset');
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.resetting.set(false);
        this.notifications.error(peopleErrorKey(error));
      },
    });
  }

  protected load(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.state.set('loading');
    this.api.checklistTemplatesFor(orgId, this.lang()).subscribe({
      next: (templates) => this.apply(templates),
      error: () => this.state.set('error'),
    });
  }

  private apply(templates: ChecklistTemplates): void {
    this.templates.set(templates);
    this.state.set('ready');
    this.showRows();
  }

  private showRows(): void {
    const t = this.templates();
    this.rows.set(t ? rowsFrom(t[this.kind()]) : []);
    this.dirty.set(false);
  }
}
