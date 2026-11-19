import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatStore } from '../../core/chat/chat-store';
import { provideChatScope } from '../../core/chat/chat-scope';
import { EntityLinkRef } from '../../core/chat/chat.models';
import { EntityTypesService } from '../../core/kit/entity-types.service';
import { internalLink } from '../../core/search/internal-link';
import { Icon } from '../../shared/ui/icon/icon';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';

/**
 * A linked platform record (docs/chat-design.md §2.9, §4.4): type icon, code,
 * title and status, resolved per viewer through `link-previews`. A record
 * the viewer can't read shows only "Ingen tilgang til denne posten" — never
 * its title.
 */
@Component({
  selector: 'app-chat-record-card',
  imports: [TranslocoPipe, Icon, StatusBadge],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "inline() ? 'inline' : 'block max-w-[460px]'" },
  template: `
    @let p = preview();
    @if (inline()) {
      @if (p?.visible && link()) {
        <a
          [href]="p!.url"
          class="inline-flex max-w-full items-baseline gap-1 rounded bg-surface-2 px-1.5 font-medium text-fg hover:text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          (click)="open($event)"
          ><span class="text-micro font-semibold text-fg-subtle uppercase">{{ typeLabel() }}</span>
          @if (p!.code) {
            <span class="font-mono text-meta text-fg-muted">{{ p!.code }}</span>
          }
          <span class="truncate">{{ p!.title }}</span></a
        >
      } @else if (p) {
        <span class="rounded bg-surface-2 px-1.5 text-meta text-fg-subtle italic">{{
          'chat.record.noAccess' | transloco
        }}</span>
      } @else {
        <span class="rounded bg-surface-2 px-1.5 text-meta text-fg-subtle">…</span>
      }
    } @else {
      @if (p?.visible) {
        <a
          [attr.href]="link() ? p!.url : null"
          data-testid="chat-record-card"
          class="flex min-w-0 items-center gap-3 rounded-tile border border-border bg-surface px-3 py-2.5 hover:border-accent-border hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          (click)="open($event)"
        >
          <span
            class="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-accent-soft text-accent"
            aria-hidden="true"
            ><app-icon [name]="icon()" [size]="18"
          /></span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="flex items-center gap-2 text-micro text-fg-subtle">
              <span class="font-semibold tracking-[0.04em] uppercase">{{ typeLabel() }}</span>
              @if (p!.code) {
                <span class="font-mono">{{ p!.code }}</span>
              }
            </span>
            <span class="truncate text-ui font-semibold text-fg">{{ p!.title }}</span>
          </span>
          @if (p!.status) {
            <app-status-badge class="flex-none" [value]="p!.status" />
          }
        </a>
      } @else if (p) {
        <div
          data-testid="chat-record-card-hidden"
          class="flex items-center gap-3 rounded-tile border border-dashed border-border bg-surface-2 px-3 py-2.5 text-meta text-fg-subtle"
        >
          <app-icon name="lock" [size]="16" />
          {{ 'chat.record.noAccess' | transloco }}
        </div>
      } @else {
        <div
          class="h-[58px] animate-pulse rounded-tile border border-border bg-surface-2 motion-reduce:animate-none"
          role="status"
          [attr.aria-label]="'chat.record.loading' | transloco"
        ></div>
      }
    }
  `,
})
export class RecordCard {
  private readonly store = inject(ChatStore);
  private readonly types = inject(EntityTypesService);
  private readonly router = inject(Router);

  readonly ref = input.required<EntityLinkRef>();
  readonly inline = input(false);

  protected readonly preview = computed(() => this.store.linkPreview(this.ref()));
  protected readonly link = computed(() => internalLink(this.preview()?.url));
  protected readonly typeLabel = computed(() => {
    const p = this.preview();
    return this.types.label(this.ref().entity_type, p?.label_key ?? null);
  });

  /** A module icon when the shared set has one, else a document. */
  protected readonly icon = computed(() => {
    const module = this.preview()?.module ?? '';
    const known: Record<string, string> = {
      risk: 'risk',
      deviations: 'alert',
      documents: 'documents',
      audits: 'audit',
      hse: 'hardhat',
      environment: 'leaf',
      privacy: 'shield',
      contracts: 'contract',
      training: 'training',
      objectives: 'target',
      tasks: 'checkcircle',
      standards: 'iso',
    };
    return known[module] ?? 'documents';
  });

  protected open(event: MouseEvent): void {
    const link = this.link();
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
      return;
    }
    event.preventDefault();
    void this.router.navigate([link.path], { queryParams: link.queryParams ?? undefined });
  }
}
