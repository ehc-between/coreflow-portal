import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../../core/i18n/language.service';
import {
  BUILTIN_CATEGORIES,
  CategoryPref,
  EMAIL_MODES,
  EmailMode,
} from '../../../core/notifications/activity.models';
import { activityErrorKey } from '../../../core/notifications/activity-errors';
import { NotificationService } from '../../../core/notifications/notification.service';
import { UserNotificationsApi } from '../../../core/notifications/user-notifications-api';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Alert } from '../../../shared/ui/alert/alert';
import { Card } from '../../../shared/ui/card/card';
import { Switch } from '../../../shared/ui/switch/switch';

/**
 * The signed-in user's per-category choices in the selected organisation:
 * show it in the app or not, and email it immediately, in the daily digest, or
 * not at all. Each change saves the whole list and reverts on failure.
 */
@Component({
  selector: 'app-category-preferences',
  imports: [TranslocoPipe, Card, Switch, Alert],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-card [padded]="false">
      <div class="border-b border-border px-4 py-3.5">
        <h2 id="categories-title" class="text-[14.5px] font-semibold text-fg">
          {{ 'activity.categoriesPage.title' | transloco }}
        </h2>
        <p class="mt-0.5 text-[12.5px] text-fg-muted">
          @if (orgName(); as name) {
            {{ 'activity.categoriesPage.subtitle' | transloco: { org: name } }}
          } @else {
            {{ 'activity.categoriesPage.noOrg' | transloco }}
          }
        </p>
      </div>
      @if (loading()) {
        <p class="px-4 py-6 text-[13px] text-fg-muted" data-testid="categories-loading">
          {{ 'activity.page.loading' | transloco }}
        </p>
      } @else if (loadError()) {
        <div class="p-4">
          <app-alert>{{ 'activity.categoriesPage.loadError' | transloco }}</app-alert>
        </div>
      } @else if (items().length > 0) {
        <ul class="divide-y divide-border" aria-labelledby="categories-title">
          @for (pref of items(); track pref.category) {
            <li
              class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
              data-testid="category-row"
            >
              <div class="min-w-0 flex-1">
                <div [id]="'category-' + pref.category" class="text-[13.5px] font-semibold text-fg">
                  {{ label(pref.category) }}
                </div>
                @if (hint(pref.category); as h) {
                  <div class="text-[12.5px] text-fg-muted">{{ h }}</div>
                }
              </div>
              <div class="w-full sm:w-36">
                <app-switch
                  [checked]="pref.in_app"
                  (checkedChange)="update(pref, { in_app: $event })"
                >
                  {{ 'activity.categoriesPage.inApp' | transloco }}
                </app-switch>
              </div>
              <div class="flex items-center gap-2">
                <label
                  [for]="'email-' + pref.category"
                  class="text-[12.5px] font-medium text-fg-muted"
                  >{{ 'activity.categoriesPage.email' | transloco }}</label
                >
                <select
                  [id]="'email-' + pref.category"
                  data-testid="email-mode"
                  [attr.aria-describedby]="'category-' + pref.category"
                  [disabled]="saving()"
                  (change)="update(pref, { email: $any($event.target).value })"
                  class="h-8 rounded-[9px] border border-border bg-bg px-2 text-[13px] text-fg outline-none focus:border-accent disabled:opacity-60"
                >
                  @for (mode of emailModes; track mode) {
                    <option [value]="mode" [selected]="mode === pref.email">
                      {{ 'activity.emailModes.' + mode | transloco }}
                    </option>
                  }
                </select>
              </div>
            </li>
          }
        </ul>
      }
    </app-card>
  `,
})
export class CategoryPreferences {
  private readonly api = inject(UserNotificationsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly toasts = inject(NotificationService);
  private readonly language = inject(LanguageService);

  protected readonly emailModes = EMAIL_MODES;
  protected readonly items = signal<readonly CategoryPref[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly orgName = signal<string | null>(null);
  private generation = 0;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const org = this.selectedOrg.orgs().find((o) => o.id === orgId);
      untracked(() => {
        this.orgName.set(org?.name ?? null);
        this.load(orgId);
      });
    });
  }

  private load(orgId: string | null): void {
    const generation = ++this.generation;
    this.items.set([]);
    this.loadError.set(false);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.getCategories(orgId).subscribe({
      next: (items) => {
        if (generation !== this.generation) return;
        this.items.set(sortCategories(items));
        this.loading.set(false);
      },
      error: () => {
        if (generation !== this.generation) return;
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  protected label(category: string): string {
    if ((BUILTIN_CATEGORIES as readonly string[]).includes(category)) {
      return this.language.translate(`activity.categories.${category}.label`);
    }
    const key = `modules.names.${category}`;
    const name = this.language.translate(key);
    return name === key ? category : name;
  }

  protected hint(category: string): string | null {
    if (!(BUILTIN_CATEGORIES as readonly string[]).includes(category)) return null;
    return this.language.translate(`activity.categories.${category}.hint`);
  }

  protected update(
    pref: CategoryPref,
    change: Partial<Pick<CategoryPref, 'in_app' | 'email'>>,
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) return;
    if (change.email && !(EMAIL_MODES as readonly string[]).includes(change.email)) return;
    const previous = this.items();
    const next = previous.map((p) =>
      p.category === pref.category
        ? { ...p, ...change, email: (change.email ?? p.email) as EmailMode }
        : p,
    );
    this.items.set(next);
    this.saving.set(true);
    const generation = this.generation;
    this.api.updateCategories(orgId, next).subscribe({
      next: (saved) => {
        this.saving.set(false);
        if (generation !== this.generation) return;
        this.items.set(sortCategories(saved));
        this.toasts.success('activity.categoriesPage.saved');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (generation !== this.generation) return;
        this.items.set(previous);
        this.toasts.error(activityErrorKey(error));
      },
    });
  }
}

/** Built-in categories first, in their canonical order, then module categories by key. */
export function sortCategories(items: readonly CategoryPref[]): CategoryPref[] {
  const order = (c: string): number => {
    const i = (BUILTIN_CATEGORIES as readonly string[]).indexOf(c);
    return i === -1 ? BUILTIN_CATEGORIES.length : i;
  };
  return [...items].sort(
    (a, b) => order(a.category) - order(b.category) || a.category.localeCompare(b.category),
  );
}
