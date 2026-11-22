import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { hasAnyPermission } from '../../core/auth/permission';
import { GUIDANCE_LEVELS, GuidanceLevel } from '../../core/guidance/guidance.models';
import { GuidanceService } from '../../core/guidance/guidance.service';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { InboxService } from '../../core/notifications/inbox.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { ThemeService } from '../../core/theme/theme.service';
import { AskPanelService } from '../../features/ask/ask-panel.service';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { Icon } from '../../shared/ui/icon/icon';
import { SETTINGS_NAV_ITEM } from '../nav';

/**
 * The avatar / account menu (IA v2 §4.5). Top: who you are and in which company, with
 * "Bytt bedrift" when you belong to more than one. Then, in order: Meg (profile and
 * password, two-step, devices, my notifications), Utseende og språk (theme, language,
 * guidance level), Hjelp og læring (learning centre, Spør CoreFlow, shortcuts),
 * Administrasjon (settings, modules, company setup, all organisations — only with the
 * permissions), and sign out. Closes on outside click and Escape.
 */
@Component({
  selector: 'app-account-menu',
  imports: [RouterLink, TranslocoPipe, Avatar, Icon],
  viewProviders: [provideSharedScope('guidance', 'shell')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative ml-1 block',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    @let user = auth.user();
    @let org = selectedOrg.currentOrg();
    <button
      type="button"
      aria-haspopup="menu"
      data-testid="account-menu-button"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="'auth.menu.label' | transloco"
      [title]="org?.name ?? ''"
      (click)="toggle()"
      class="relative flex rounded-full focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      <app-avatar [name]="auth.displayName()" size="md" />
      @if (inbox.unreadElsewhere() > 0) {
        <span
          data-testid="org-unread-elsewhere"
          aria-hidden="true"
          class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent"
        ></span>
      }
    </button>

    @if (open()) {
      <div
        role="menu"
        [attr.aria-label]="'auth.menu.label' | transloco"
        data-testid="account-menu"
        class="absolute top-full right-0 z-40 mt-2 flex max-h-[calc(100dvh-80px)] w-72 max-w-[calc(100vw-16px)] flex-col overflow-y-auto rounded-card border border-border bg-surface p-1.5 shadow-pop"
      >
        <div class="flex items-center gap-2.5 px-2 pt-1.5 pb-2.5">
          <app-avatar [name]="auth.displayName()" size="sm" />
          <div class="min-w-0 flex-1">
            @if (user?.full_name) {
              <div class="truncate text-ui font-semibold text-fg">{{ user?.full_name }}</div>
            }
            <div class="truncate text-meta text-fg-muted">{{ user?.email }}</div>
            @if (org) {
              <div class="truncate text-meta text-fg-subtle" data-testid="account-menu-org">
                {{ org.name }}
              </div>
            }
          </div>
        </div>

        @if (selectedOrg.orgs().length > 1) {
          <div class="my-1 border-t border-border"></div>
          <div role="group" aria-labelledby="account-org-heading" data-testid="account-menu-orgs">
            <div id="account-org-heading" [class]="heading">
              {{ 'shell.account.switchOrg' | transloco }}
            </div>
            @for (o of selectedOrg.orgs(); track o.id) {
              @let current = o.id === selectedOrg.currentOrgId();
              @let unread = inbox.unreadByOrg().get(o.id) ?? 0;
              <button
                type="button"
                role="menuitemradio"
                [attr.aria-checked]="current"
                [attr.data-testid]="'account-menu-org-' + o.id"
                (click)="selectOrg(o.id)"
                [class]="row"
              >
                <span class="flex w-4 text-accent" aria-hidden="true">
                  @if (current) {
                    <app-icon name="check" [size]="15" />
                  }
                </span>
                <span class="min-w-0 flex-1 truncate">{{ o.name }}</span>
                @if (unread > 0) {
                  <span
                    class="rounded-full bg-accent-soft px-1.5 text-micro leading-[18px] font-semibold text-accent"
                    [attr.aria-label]="'org.unread' | transloco: { count: unread }"
                    >{{ unread > 99 ? '99+' : unread }}</span
                  >
                }
              </button>
            }
          </div>
        }

        <div class="my-1 border-t border-border"></div>
        <div role="group" aria-labelledby="account-me-heading">
          <div id="account-me-heading" [class]="heading">
            {{ 'shell.account.me' | transloco }}
          </div>
          <a role="menuitem" routerLink="/account/password" (click)="close()" [class]="row">
            <span class="flex text-fg-subtle"><app-icon name="lock" [size]="16" /></span>
            {{ 'shell.account.profile' | transloco }}
          </a>
          <a role="menuitem" routerLink="/account/security" (click)="close()" [class]="row">
            <span class="flex text-fg-subtle"><app-icon name="shield" [size]="16" /></span>
            {{ 'auth.menu.security' | transloco }}
          </a>
          <a role="menuitem" routerLink="/account/sessions" (click)="close()" [class]="row">
            <span class="flex text-fg-subtle"><app-icon name="devices" [size]="16" /></span>
            {{ 'auth.menu.sessions' | transloco }}
          </a>
          <a role="menuitem" routerLink="/account/notifications" (click)="close()" [class]="row">
            <span class="flex text-fg-subtle"><app-icon name="bell" [size]="16" /></span>
            {{ 'shell.account.myNotifications' | transloco }}
          </a>
        </div>

        <div class="my-1 border-t border-border"></div>
        <div
          role="group"
          aria-labelledby="account-appearance-heading"
          data-testid="account-menu-display"
        >
          <div id="account-appearance-heading" [class]="heading">
            {{ 'shell.account.appearance' | transloco }}
          </div>
          <button
            type="button"
            role="menuitem"
            data-testid="account-menu-theme"
            (click)="theme.toggle()"
            [class]="row"
          >
            <span class="flex text-fg-subtle"
              ><app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" [size]="16"
            /></span>
            {{
              (theme.theme() === 'dark' ? 'ui.shell.lightTheme' : 'ui.shell.darkTheme') | transloco
            }}
          </button>
          @for (lang of language.available; track lang) {
            <button
              type="button"
              role="menuitemradio"
              [attr.aria-checked]="language.active() === lang"
              [attr.lang]="lang"
              [attr.data-testid]="'account-menu-lang-' + lang"
              (click)="language.use(lang)"
              [class]="row"
            >
              <span class="flex w-4 text-accent" aria-hidden="true">
                @if (language.active() === lang) {
                  <app-icon name="check" [size]="15" />
                }
              </span>
              {{ 'language.' + lang | transloco }}
            </button>
          }
          <div
            data-testid="guidance-level-menu"
            role="group"
            aria-labelledby="guidance-level-heading"
          >
            <div
              id="guidance-level-heading"
              class="px-2 pt-2 pb-0.5 text-meta font-medium text-fg-muted"
            >
              {{ 'guidance.menu.levelLabel' | transloco }}
            </div>
            <button
              type="button"
              role="menuitemradio"
              [attr.aria-checked]="guidance.personalLevel() === null"
              [disabled]="guidance.saving()"
              (click)="setLevel(null)"
              [class]="row"
            >
              <span class="flex w-4 text-accent" aria-hidden="true">
                @if (guidance.personalLevel() === null) {
                  <app-icon name="check" [size]="15" />
                }
              </span>
              {{
                'guidance.menu.useOrgDefault'
                  | transloco
                    : { level: 'guidance.levels.' + guidance.orgDefault() + '.name' | transloco }
              }}
            </button>
            @for (level of levels; track level) {
              <button
                type="button"
                role="menuitemradio"
                [attr.aria-checked]="guidance.personalLevel() === level"
                [disabled]="guidance.saving()"
                (click)="setLevel(level)"
                [class]="row"
              >
                <span class="flex w-4 text-accent" aria-hidden="true">
                  @if (guidance.personalLevel() === level) {
                    <app-icon name="check" [size]="15" />
                  }
                </span>
                {{ 'guidance.levels.' + level + '.name' | transloco }}
              </button>
            }
          </div>
        </div>

        <div class="my-1 border-t border-border"></div>
        <div role="group" aria-labelledby="account-help-heading" data-testid="account-menu-help">
          <div id="account-help-heading" [class]="heading">
            {{ 'shell.account.help' | transloco }}
          </div>
          <a
            role="menuitem"
            routerLink="/account/learning"
            data-testid="account-menu-learning"
            (click)="close()"
            [class]="row"
          >
            <span class="flex text-fg-subtle"><app-icon name="book" [size]="16" /></span>
            {{ 'shell.account.learning' | transloco }}
          </a>
          <button
            type="button"
            role="menuitem"
            data-testid="account-menu-ask"
            (click)="openAsk()"
            [class]="row"
          >
            <span class="flex text-fg-subtle"><app-icon name="spark" [size]="16" /></span>
            {{ 'shell.ask.label' | transloco }}
          </button>
          <div class="flex items-start gap-2.5 px-2 py-2 text-ui text-fg-muted">
            <span class="flex pt-0.5 text-fg-subtle"><app-icon name="help" [size]="16" /></span>
            <span class="min-w-0 flex-1">
              <span class="block font-medium text-fg">{{
                'shell.account.shortcuts' | transloco
              }}</span>
              <span class="block text-meta">{{
                'shell.account.shortcutsHint' | transloco: { search: searchKey, ask: askKey }
              }}</span>
            </span>
          </div>
        </div>

        @if (showAdmin()) {
          <div class="my-1 border-t border-border"></div>
          <div
            role="group"
            aria-labelledby="account-admin-heading"
            data-testid="account-menu-admin"
          >
            <div id="account-admin-heading" [class]="heading">
              {{ 'shell.account.admin' | transloco }}
            </div>
            @if (canSettings()) {
              <a
                role="menuitem"
                routerLink="/settings"
                data-testid="account-menu-settings"
                (click)="close()"
                [class]="row"
              >
                <span class="flex text-fg-subtle"><app-icon name="sliders" [size]="16" /></span>
                {{ 'shell.account.settings' | transloco }}
              </a>
              <a
                role="menuitem"
                routerLink="/settings/modules"
                data-testid="account-menu-modules"
                (click)="close()"
                [class]="row"
              >
                <span class="flex text-fg-subtle"><app-icon name="grid" [size]="16" /></span>
                {{ 'shell.account.modules' | transloco }}
              </a>
            }
            @if (canSetup()) {
              <a
                role="menuitem"
                routerLink="/setup"
                data-testid="account-menu-setup"
                (click)="close()"
                [class]="row"
              >
                <span class="flex text-fg-subtle"><app-icon name="flag" [size]="16" /></span>
                {{ 'shell.account.setup' | transloco }}
              </a>
            }
            @if (auth.isSuperuser()) {
              <a
                role="menuitem"
                routerLink="/admin/organizations"
                data-testid="account-menu-organizations"
                (click)="close()"
                [class]="row"
              >
                <span class="flex text-fg-subtle"><app-icon name="building" [size]="16" /></span>
                {{ 'shell.account.organizations' | transloco }}
              </a>
            }
          </div>
        }

        <div class="my-1 border-t border-border"></div>
        <button type="button" role="menuitem" (click)="signOut()" [class]="row">
          <span class="flex text-fg-subtle"><app-icon name="logout" [size]="16" /></span>
          {{ 'auth.logout' | transloco }}
        </button>
        <button
          type="button"
          role="menuitem"
          [disabled]="signingOutAll()"
          (click)="signOutAll()"
          class="flex items-center gap-2.5 rounded-tile px-2 py-2 text-left text-ui font-medium text-fail hover:bg-fail-soft disabled:opacity-60"
        >
          <span class="flex"><app-icon name="devices" [size]="16" /></span>
          {{ 'auth.menu.logoutAll' | transloco }}
        </button>
      </div>
    }
  `,
})
export class AccountMenu {
  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly language = inject(LanguageService);
  protected readonly guidance = inject(GuidanceService);
  protected readonly selectedOrg = inject(SelectedOrgService);
  protected readonly inbox = inject(InboxService);
  private readonly ask = inject(AskPanelService);
  protected readonly levels = GUIDANCE_LEVELS;
  private readonly notifications = inject(NotificationService);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly heading =
    'px-2 pt-1.5 pb-1 text-micro font-semibold tracking-wide text-fg-subtle uppercase';
  protected readonly row =
    'flex w-full items-center gap-2.5 rounded-tile px-2 py-2 text-left text-ui font-medium text-fg hover:bg-surface-2 disabled:opacity-60';

  private readonly apple = /mac|iphone|ipad/i.test(globalThis.navigator?.platform ?? '');
  protected readonly searchKey = this.apple ? '⌘K' : 'Ctrl+K';
  protected readonly askKey = this.apple ? '⌘J' : 'Ctrl+J';

  private readonly permissions = computed(() => this.selectedOrg.currentOrg()?.permissions ?? []);
  protected readonly canSettings = computed(() =>
    hasAnyPermission(this.permissions(), SETTINGS_NAV_ITEM.permission ?? []),
  );
  protected readonly canSetup = computed(() => this.permissions().includes('org:manage'));
  protected readonly showAdmin = computed(
    () => this.canSettings() || this.canSetup() || this.auth.isSuperuser(),
  );

  protected readonly open = signal(false);
  protected readonly signingOutAll = signal(false);

  protected toggle(): void {
    this.open.update((o) => !o);
    if (this.open()) {
      this.inbox.refreshByOrg();
    }
  }

  protected close(): void {
    this.open.set(false);
  }

  /** Switch the learning-mode level (`null` follows the org default); the menu stays open. */
  protected setLevel(level: GuidanceLevel | null): void {
    this.guidance.setLevel(level);
  }

  protected selectOrg(orgId: string): void {
    this.selectedOrg.setCurrentOrg(orgId);
    this.close();
  }

  protected openAsk(): void {
    this.close();
    this.ask.show();
  }

  protected signOut(): void {
    this.close();
    this.auth.logout();
  }

  protected signOutAll(): void {
    if (this.signingOutAll()) {
      return;
    }
    this.signingOutAll.set(true);
    this.auth.logoutAll().subscribe({
      next: () => {
        this.signingOutAll.set(false);
        this.close();
      },
      error: () => {
        this.signingOutAll.set(false);
        this.notifications.error('auth.menu.logoutAllFailed');
      },
    });
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}
