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
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, Subscription, catchError, forkJoin, map, of } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { StandardsApi } from '../../core/standards/standards-api';
import {
  RequirementOption,
  flattenRequirements,
  localized,
  searchRequirements,
} from '../../core/standards/standards-data';
import { LinkEntityType, RequirementLink } from '../../core/standards/standards.models';
import { Icon } from '../ui/icon/icon';

/** A CAPA action whose links are shown under the deviation (structurally an `Action`). */
export interface LinkedAction {
  readonly id: string;
  readonly description: string;
}

interface LinkGroup {
  readonly key: string;
  /** Action description, or null for the record's own links. */
  readonly label: string | null;
  readonly links: readonly RequirementLink[];
}

/**
 * "Supports requirements" panel for a record (document / deviation): the
 * standard requirements this record is evidence for, with AI suggestions to
 * confirm or reject. With `standards:manage` the user can link the record to a
 * requirement (search across the org's enabled standards) or remove a link.
 * Renders nothing without `standards:read`.
 */
@Component({
  selector: 'app-supports-requirements',
  imports: [FormsModule, RouterLink, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (canRead()) {
      <div>
        <div class="mb-2 flex items-center justify-between gap-2">
          <h2 class="font-display text-[15px] font-bold tracking-[-0.02em] text-fg">
            {{ 'standards.supports.title' | transloco }}
          </h2>
          @if (canManage() && !adding()) {
            <button
              type="button"
              class="inline-flex items-center gap-1 text-[12.5px] font-semibold text-accent hover:underline"
              (click)="startAdd()"
            >
              <app-icon name="plus" [size]="13" />
              {{ 'standards.supports.add' | transloco }}
            </button>
          }
        </div>

        @if (adding()) {
          <div class="mb-2 rounded-tile border border-border bg-surface-2 p-2">
            <div class="flex items-center gap-1.5">
              <input
                type="search"
                class="h-8 min-w-0 flex-1 rounded-[8px] border border-border bg-bg px-2.5 text-[12.5px] text-fg outline-none focus:border-accent"
                [ngModel]="query()"
                (ngModelChange)="query.set($event)"
                [placeholder]="'standards.supports.searchPlaceholder' | transloco"
                [attr.aria-label]="'standards.supports.searchPlaceholder' | transloco"
              />
              <button
                type="button"
                class="flex rounded-[6px] p-1 text-fg-subtle hover:text-fg"
                [attr.aria-label]="'standards.evidence.cancel' | transloco"
                (click)="adding.set(false)"
              >
                <app-icon name="x" [size]="14" />
              </button>
            </div>
            @if (optionsLoading()) {
              <p class="mt-1.5 text-[12px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
            } @else if (options().length === 0) {
              <p class="mt-1.5 text-[12px] text-fg-muted">
                {{ 'standards.supports.noStandards' | transloco }}
              </p>
            } @else if (query().trim()) {
              @if (matches().length === 0) {
                <p class="mt-1.5 text-[12px] text-fg-muted">
                  {{ 'standards.evidence.noResults' | transloco }}
                </p>
              }
              <ul class="mt-1 flex max-h-64 flex-col overflow-y-auto">
                @for (option of matches(); track option.ref) {
                  <li>
                    <button
                      type="button"
                      class="w-full rounded-[6px] px-2 py-1.5 text-left hover:bg-surface"
                      (click)="add(option)"
                    >
                      <span class="block text-[11.5px] text-fg-subtle"
                        >{{ option.standardName }} · {{ option.clauseNumber }}
                        {{ title(option) }}</span
                      >
                      <span class="line-clamp-2 block text-[12.5px] text-fg">{{
                        text(option)
                      }}</span>
                    </button>
                  </li>
                }
              </ul>
            }
          </div>
        }

        @if (loading()) {
          <p class="text-[12.5px] text-fg-muted">{{ 'common.loading' | transloco }}</p>
        } @else if (groups().length === 0) {
          <p class="text-[12.5px] text-fg-muted">{{ 'standards.supports.none' | transloco }}</p>
        } @else {
          @for (group of groups(); track group.key) {
            @if (group.label) {
              <div
                class="mt-2.5 mb-1 truncate text-[11.5px] font-semibold text-fg-subtle"
                [title]="group.label"
                data-testid="action-group"
              >
                {{ 'standards.supports.onAction' | transloco: { action: group.label } }}
              </div>
            }
            <ul class="flex flex-col gap-1.5">
              @for (link of group.links; track link.id) {
                <li
                  class="flex items-center gap-2 rounded-tile border px-2.5 py-1.5"
                  [class]="
                    link.status === 'suggested'
                      ? 'border-accent-border bg-accent-soft/40'
                      : 'border-border bg-surface'
                  "
                >
                  @if (link.status === 'suggested') {
                    <span
                      class="flex flex-none text-accent"
                      [title]="'standards.supports.suggested' | transloco"
                      ><app-icon name="spark" [size]="13"
                    /></span>
                  }
                  <a
                    [routerLink]="['/standards', link.standard_key, 'clauses', link.clause_number]"
                    [queryParams]="{ req: link.requirement_ref }"
                    class="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg hover:text-accent hover:underline"
                    [title]="link.requirement_ref"
                    >{{ standardName(link.standard_key) }} · {{ link.clause_number }}</a
                  >
                  @if (canManage()) {
                    @if (link.status === 'suggested') {
                      <button
                        type="button"
                        class="flex flex-none rounded-[6px] p-1 text-pass hover:bg-surface-2 disabled:opacity-60"
                        [attr.aria-label]="'standards.suggestions.confirm' | transloco"
                        [disabled]="busyId() === link.id"
                        (click)="confirm(link)"
                      >
                        <app-icon name="check" [size]="13" />
                      </button>
                      <button
                        type="button"
                        class="flex flex-none rounded-[6px] p-1 text-fg-subtle hover:bg-surface-2 hover:text-fail disabled:opacity-60"
                        [attr.aria-label]="'standards.suggestions.reject' | transloco"
                        [disabled]="busyId() === link.id"
                        (click)="reject(link)"
                      >
                        <app-icon name="x" [size]="13" />
                      </button>
                    } @else {
                      <button
                        type="button"
                        class="flex flex-none rounded-[6px] p-1 text-fg-subtle hover:bg-surface-2 hover:text-fail disabled:opacity-60"
                        [attr.aria-label]="
                          'standards.supports.remove' | transloco: { ref: link.clause_number }
                        "
                        [disabled]="busyId() === link.id"
                        (click)="remove(link)"
                      >
                        <app-icon name="x" [size]="13" />
                      </button>
                    }
                  }
                </li>
              }
            </ul>
          }
        }

        @if (error()) {
          <p class="mt-2 text-[12px] text-fail" role="alert">
            {{ 'standards.evidence.error' | transloco }}
          </p>
        }
      </div>
    }
  `,
})
export class SupportsRequirements {
  private readonly api = inject(StandardsApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly language = inject(LanguageService);

  readonly entityType = input.required<LinkEntityType>();
  readonly entityId = input.required<string>();
  /**
   * The record's CAPA actions (deviations only): links on each action
   * (entity_type `deviation_action`) are listed grouped under it.
   */
  readonly actions = input<readonly LinkedAction[]>([]);

  protected readonly links = signal<readonly RequirementLink[]>([]);
  private readonly actionLinks = signal<readonly RequirementLink[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly busyId = signal<string | null>(null);

  protected readonly adding = signal(false);
  protected readonly query = signal('');
  protected readonly options = signal<readonly RequirementOption[]>([]);
  protected readonly optionsLoading = signal(false);
  private readonly names = signal<Readonly<Record<string, string>>>({});

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canRead = computed(() => this.permissions().includes('standards:read'));
  protected readonly canManage = computed(() => this.permissions().includes('standards:manage'));

  /** Confirmed links and pending suggestions (rejected ones are hidden). */
  protected readonly visible = computed(() => this.links().filter((l) => l.status !== 'rejected'));

  /** The record's own links, then each action's links under its description. */
  protected readonly groups = computed<readonly LinkGroup[]>(() => {
    const shown = this.actionLinks().filter((l) => l.status !== 'rejected');
    const groups: LinkGroup[] = [{ key: 'self', label: null, links: this.visible() }];
    for (const action of this.actions()) {
      groups.push({
        key: action.id,
        label: action.description,
        links: shown.filter((l) => l.entity_id === action.id),
      });
    }
    return groups.filter((g) => g.links.length > 0);
  });

  /** Stable key of the action ids, so action links reload only when the set changes. */
  private readonly actionIds = computed(() =>
    this.actions()
      .map((a) => a.id)
      .join(','),
  );

  protected readonly matches = computed(() =>
    searchRequirements(
      this.options(),
      this.query(),
      this.language.active(),
      new Set(this.visible().map((l) => l.requirement_ref)),
    ),
  );

  private sub: Subscription | null = null;
  private actionSub: Subscription | null = null;
  private optionsSub: Subscription | null = null;
  private optionsOrgId: string | null = null;

  constructor() {
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const canRead = this.canRead();
      const entityType = this.entityType();
      const entityId = this.entityId();
      untracked(() => this.load(canRead ? orgId : null, entityType, entityId));
    });
    effect(() => {
      const orgId = this.canRead() ? this.selectedOrg.currentOrgId() : null;
      const ids = this.actionIds();
      untracked(() => this.loadActionLinks(orgId, ids ? ids.split(',') : []));
    });
    inject(DestroyRef).onDestroy(() => {
      this.sub?.unsubscribe();
      this.actionSub?.unsubscribe();
      this.optionsSub?.unsubscribe();
    });
  }

  protected text(option: RequirementOption): string {
    return localized(option.text, this.language.active());
  }

  protected title(option: RequirementOption): string {
    return localized(option.clauseTitle, this.language.active());
  }

  protected standardName(key: string): string {
    return this.names()[key] ?? key;
  }

  protected startAdd(): void {
    this.adding.set(true);
    this.query.set('');
    this.loadOptions();
  }

  protected add(option: RequirementOption): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId) {
      return;
    }
    this.error.set(false);
    this.api
      .createLink(orgId, {
        requirement_ref: option.ref,
        entity_type: this.entityType(),
        entity_id: this.entityId(),
      })
      .subscribe({
        next: (link) => {
          this.links.update((list) => [...list.filter((l) => l.id !== link.id), link]);
          this.adding.set(false);
        },
        error: () => this.error.set(true),
      });
  }

  protected confirm(link: RequirementLink): void {
    this.mutate(link, (orgId) => this.api.confirmLink(orgId, link.id));
  }

  protected reject(link: RequirementLink): void {
    this.mutate(link, (orgId) => this.api.rejectLink(orgId, link.id));
  }

  protected remove(link: RequirementLink): void {
    this.mutate(link, (orgId) => this.api.deleteLink(orgId, link.id).pipe(map(() => null)));
  }

  private mutate(
    link: RequirementLink,
    call: (orgId: string) => Observable<RequirementLink | null>,
  ): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || this.busyId()) {
      return;
    }
    this.busyId.set(link.id);
    this.error.set(false);
    call(orgId).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        const apply = (list: readonly RequirementLink[]): readonly RequirementLink[] =>
          updated
            ? list.map((l) => (l.id === updated.id ? updated : l))
            : list.filter((l) => l.id !== link.id);
        this.links.update(apply);
        this.actionLinks.update(apply);
      },
      error: () => {
        this.busyId.set(null);
        this.error.set(true);
      },
    });
  }

  private load(orgId: string | null, entityType: LinkEntityType, entityId: string): void {
    this.sub?.unsubscribe();
    this.links.set([]);
    this.adding.set(false);
    this.error.set(false);
    if (!orgId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.sub = forkJoin({
      links: this.api.listLinks(orgId, { entity_type: entityType, entity_id: entityId }),
      standards: this.api.list(orgId).pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ links, standards }) => {
        this.links.set(links);
        this.names.set(Object.fromEntries(standards.map((s) => [s.key, s.name])));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set(true);
      },
    });
  }

  private loadActionLinks(orgId: string | null, actionIds: readonly string[]): void {
    this.actionSub?.unsubscribe();
    if (!orgId || actionIds.length === 0) {
      this.actionLinks.set([]);
      return;
    }
    this.actionSub = forkJoin(
      actionIds.map((id) =>
        this.api
          .listLinks(orgId, { entity_type: 'deviation_action', entity_id: id })
          .pipe(catchError(() => of([] as RequirementLink[]))),
      ),
    ).subscribe((lists) => this.actionLinks.set(lists.flat()));
  }

  /** Lazily load every requirement of the org's enabled standards (once per org). */
  private loadOptions(): void {
    const orgId = this.selectedOrg.currentOrgId();
    if (!orgId || (this.optionsOrgId === orgId && this.options().length > 0)) {
      return;
    }
    this.optionsSub?.unsubscribe();
    this.optionsOrgId = orgId;
    this.optionsLoading.set(true);
    this.optionsSub = this.api.list(orgId).subscribe({
      next: (standards) => {
        const enabled = standards.filter((s) => s.enabled);
        this.names.set(Object.fromEntries(standards.map((s) => [s.key, s.name])));
        if (enabled.length === 0) {
          this.options.set([]);
          this.optionsLoading.set(false);
          return;
        }
        this.optionsSub = forkJoin(
          enabled.map((s) =>
            this.api.getTree(orgId, s.key).pipe(
              map((tree) => flattenRequirements(tree, s.key, s.name)),
              catchError(() => of([] as RequirementOption[])),
            ),
          ),
        ).subscribe((lists) => {
          this.options.set(lists.flat());
          this.optionsLoading.set(false);
        });
      },
      error: () => {
        this.optionsLoading.set(false);
        this.error.set(true);
      },
    });
  }
}
