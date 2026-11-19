import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Block, Inline, parseBody } from '../../core/chat/chat-body';
import { provideChatScope } from '../../core/chat/chat-scope';
import { RecordCard } from './record-card';

/**
 * Renders a message body from the safe token tree (docs/chat-design.md §4.6)
 * with Angular bindings only — never `[innerHTML]`. Mentions become pills,
 * `#tags` open the chat search filtered on the tag, record links become
 * permission-aware cards (or inline chips inside running text).
 */
@Component({
  selector: 'app-chat-message-body',
  imports: [NgTemplateOutlet, RouterLink, TranslocoPipe, RecordCard],
  viewProviders: [provideChatScope()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 text-ui leading-relaxed text-fg [overflow-wrap:anywhere]' },
  template: `
    <ng-container *ngTemplateOutlet="blocksTpl; context: { $implicit: blocks() }" />

    <ng-template #blocksTpl let-blocks>
      @for (block of asBlocks(blocks); track $index) {
        @switch (block.kind) {
          @case ('paragraph') {
            <p class="my-0.5 whitespace-pre-wrap">
              <ng-container
                *ngTemplateOutlet="inlineTpl; context: { $implicit: inlineOf(block) }"
              />
            </p>
          }
          @case ('records') {
            <div class="my-1.5 flex flex-col gap-1.5">
              @for (ref of recordsOf(block); track ref.entity_id) {
                <app-chat-record-card [ref]="ref" />
              }
            </div>
          }
          @case ('code') {
            <pre
              class="my-1 overflow-x-auto rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-meta"
            ><code>{{ textOf(block) }}</code></pre>
          }
          @case ('quote') {
            <blockquote class="my-1 border-l-[3px] border-border-strong pl-3 text-fg-muted">
              <ng-container
                *ngTemplateOutlet="blocksTpl; context: { $implicit: childBlocks(block) }"
              />
            </blockquote>
          }
          @case ('list') {
            @if (isOrdered(block)) {
              <ol class="my-1 list-decimal pl-6" [attr.start]="startOf(block)">
                @for (item of itemsOf(block); track $index) {
                  <li>
                    <ng-container *ngTemplateOutlet="blocksTpl; context: { $implicit: item }" />
                  </li>
                }
              </ol>
            } @else {
              <ul class="my-1 list-disc pl-6">
                @for (item of itemsOf(block); track $index) {
                  <li>
                    <ng-container *ngTemplateOutlet="blocksTpl; context: { $implicit: item }" />
                  </li>
                }
              </ul>
            }
          }
        }
      }
    </ng-template>

    <ng-template #inlineTpl let-nodes>
      @for (node of asInline(nodes); track $index) {
        @switch (node.kind) {
          @case ('text') {
            <!-- Whitespace-sensitive (pre-wrap): no spaces around the text. -->
            <ng-container>{{ textOf(node) }}</ng-container>
          }
          @case ('br') {
            <br />
          }
          @case ('strong') {
            <strong class="font-semibold"
              ><ng-container
                *ngTemplateOutlet="inlineTpl; context: { $implicit: childrenOf(node) }"
            /></strong>
          }
          @case ('em') {
            <em
              ><ng-container
                *ngTemplateOutlet="inlineTpl; context: { $implicit: childrenOf(node) }"
            /></em>
          }
          @case ('del') {
            <del
              ><ng-container
                *ngTemplateOutlet="inlineTpl; context: { $implicit: childrenOf(node) }"
            /></del>
          }
          @case ('code') {
            <code class="rounded bg-surface-2 px-1 py-px font-mono text-[0.9em]">{{
              textOf(node)
            }}</code>
          }
          @case ('link') {
            <a
              [href]="hrefOf(node)"
              target="_blank"
              rel="noopener noreferrer"
              class="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
              ><ng-container
                *ngTemplateOutlet="inlineTpl; context: { $implicit: childrenOf(node) }"
            /></a>
          }
          @case ('user') {
            <span
              class="rounded px-1 font-semibold"
              [class]="isMe(node) ? 'bg-warn-soft text-warn-ink' : 'bg-accent-soft text-accent'"
              >&#64;{{ labelOf(node) || ('chat.names.unknownUser' | transloco) }}</span
            >
          }
          @case ('team') {
            <span class="rounded bg-accent-soft px-1 font-semibold text-accent"
              >&#64;{{ labelOf(node) || ('chat.names.unknownUser' | transloco) }}</span
            >
          }
          @case ('tag') {
            <a
              [routerLink]="['/chat']"
              [queryParams]="{ tag: tagOf(node) }"
              class="rounded font-medium text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >#{{ tagOf(node) }}</a
            >
          }
          @case ('record') {
            <app-chat-record-card [ref]="refOf(node)" [inline]="true" />
          }
        }
      }
    </ng-template>
  `,
})
export class MessageBody {
  readonly body = input('');
  /** Highlight mentions of this user. */
  readonly meId = input<string | null>(null);

  protected readonly blocks = computed(() => parseBody(this.body()));

  // Narrowing helpers: template contexts are untyped.
  protected asBlocks(value: unknown): readonly Block[] {
    return value as readonly Block[];
  }
  protected asInline(value: unknown): readonly Inline[] {
    return value as readonly Inline[];
  }
  protected inlineOf(block: Block) {
    return (block as Extract<Block, { kind: 'paragraph' }>).inline;
  }
  protected recordsOf(block: Block) {
    return (block as Extract<Block, { kind: 'records' }>).refs;
  }
  protected childBlocks(block: Block) {
    return (block as Extract<Block, { kind: 'quote' }>).blocks;
  }
  protected isOrdered(block: Block): boolean {
    return (block as Extract<Block, { kind: 'list' }>).ordered;
  }
  protected startOf(block: Block): number {
    return (block as Extract<Block, { kind: 'list' }>).start;
  }
  protected itemsOf(block: Block) {
    return (block as Extract<Block, { kind: 'list' }>).items;
  }
  protected textOf(node: Block | Inline): string {
    return (node as { text: string }).text;
  }
  protected childrenOf(node: Inline): readonly Inline[] {
    return (node as { children: readonly Inline[] }).children;
  }
  protected hrefOf(node: Inline): string {
    return (node as Extract<Inline, { kind: 'link' }>).href;
  }
  protected labelOf(node: Inline): string {
    return (node as { id: string; label: string }).label;
  }
  protected isMe(node: Inline): boolean {
    return (node as { id: string; label: string }).id === this.meId();
  }
  protected tagOf(node: Inline): string {
    return (node as Extract<Inline, { kind: 'tag' }>).tag;
  }
  protected refOf(node: Inline) {
    return (node as Extract<Inline, { kind: 'record' }>).ref;
  }
}
