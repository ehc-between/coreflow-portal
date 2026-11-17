import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { InboxService } from '../../core/notifications/inbox.service';
import { SelectedOrgService } from '../../core/org/selected-org.service';
import { Avatar } from '../../shared/ui/avatar/avatar';
import { Badge } from '../../shared/ui/badge/badge';
import { Icon } from '../../shared/ui/icon/icon';

/**
 * Sidebar organisation switcher: a trigger showing the current org (avatar +
 * name + chevron) that opens a panel listing every org the user belongs to.
 * Selecting one updates SelectedOrgService. Closes on outside-click and Escape.
 *
 * Each org shows its unread-notification count (`InboxService.unreadByOrg`,
 * refreshed when the panel opens) and the trigger carries a dot when another
 * org has something unread, so a user working in one client sees the others.
 */
@Component({
  selector: 'app-org-switcher',
  imports: [TranslocoPipe, Icon, Avatar, Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    @let current = selectedOrg.currentOrg();
    @let elsewhere = inbox.unreadElsewhere();
    <button
      type="button"
      [attr.aria-haspopup]="'menu'"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="
        elsewhere > 0
          ? ('org.switchUnreadElsewhere' | transloco: { count: elsewhere })
          : ('org.switch' | transloco)
      "
      [disabled]="!current"
      (click)="toggle()"
      class="flex w-full items-center gap-2.5 rounded-tile border border-border bg-bg px-2.5 py-2.5 hover:border-border-strong disabled:cursor-default disabled:hover:border-border"
    >
      @if (current) {
        <app-avatar [name]="current.name" [gradient]="true" size="sm" />
        <span class="flex-1 truncate text-left text-ui font-semibold text-fg">{{
          current.name
        }}</span>
      } @else {
        <app-avatar initials="—" [gradient]="false" size="sm" />
        <span class="flex-1 truncate text-left text-ui font-semibold text-fg-muted">{{
          'org.none' | transloco
        }}</span>
      }
      @if (elsewhere > 0) {
        <span
          data-testid="org-unread-elsewhere"
          aria-hidden="true"
          class="h-2 w-2 flex-none rounded-full bg-accent"
        ></span>
      }
      <span class="flex text-fg-subtle"><app-icon name="chevron" [size]="16" /></span>
    </button>

    @if (open()) {
      <div
        role="menu"
        [attr.aria-label]="'org.current' | transloco"
        class="absolute top-full right-0 left-0 z-10 mt-1.5 flex flex-col gap-0.5 rounded-card border border-border bg-surface p-1.5 shadow-pop"
      >
        @for (org of selectedOrg.orgs(); track org.id) {
          @let active = org.id === selectedOrg.currentOrgId();
          @let unread = inbox.unreadByOrg().get(org.id) ?? 0;
          <button
            type="button"
            role="menuitem"
            (click)="select(org.id)"
            class="flex items-center gap-2.5 rounded-tile px-2 py-2 text-left hover:bg-surface-2"
            [class.bg-accent-soft]="active"
          >
            <app-avatar [name]="org.name" [gradient]="true" size="sm" />
            <span
              class="flex-1 truncate text-ui font-semibold"
              [class]="active ? 'text-accent' : 'text-fg'"
              >{{ org.name }}</span
            >
            @if (unread > 0) {
              <span [attr.data-testid]="'org-unread-' + org.id">
                <app-badge tone="accent">
                  <span aria-hidden="true">{{ unread > 99 ? '99+' : unread }}</span>
                  <span class="sr-only">{{ 'org.unread' | transloco: { count: unread } }}</span>
                </app-badge>
              </span>
            }
            @if (active) {
              <span class="flex text-accent"><app-icon name="check" [size]="16" /></span>
            }
          </button>
        }
      </div>
    }
  `,
})
export class OrgSwitcher {
  protected readonly selectedOrg = inject(SelectedOrgService);
  protected readonly inbox = inject(InboxService);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((o) => !o);
    if (this.open()) {
      this.inbox.refreshByOrg();
    }
  }

  protected close(): void {
    this.open.set(false);
  }

  protected select(orgId: string): void {
    this.selectedOrg.setCurrentOrg(orgId);
    this.close();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}
