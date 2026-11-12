import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DiffBlock } from '../data/document-control.models';

/** Unchanged runs longer than this are collapsed to their first and last paragraph. */
export const COLLAPSE_AFTER = 3;

/** A row of the rendered diff. */
export type DiffRow =
  | { readonly kind: 'equal'; readonly text: string }
  | { readonly kind: 'skip'; readonly count: number; readonly blockIndex: number }
  | { readonly kind: 'insert'; readonly text: string }
  | { readonly kind: 'delete'; readonly text: string }
  | { readonly kind: 'inline'; readonly block: DiffBlock };

/**
 * Flatten diff blocks into display rows. Long unchanged runs are collapsed unless
 * their block index is in `expanded`; replaced paragraphs with word segments render
 * inline, otherwise as removed + added rows.
 */
export function diffRows(
  blocks: readonly DiffBlock[],
  expanded: ReadonlySet<number> = new Set(),
): DiffRow[] {
  const rows: DiffRow[] = [];
  blocks.forEach((block, index) => {
    switch (block.op) {
      case 'equal': {
        const lines = block.after.length ? block.after : block.before;
        if (lines.length > COLLAPSE_AFTER && !expanded.has(index)) {
          rows.push({ kind: 'equal', text: lines[0] });
          rows.push({ kind: 'skip', count: lines.length - 2, blockIndex: index });
          rows.push({ kind: 'equal', text: lines[lines.length - 1] });
        } else {
          lines.forEach((text) => rows.push({ kind: 'equal', text }));
        }
        break;
      }
      case 'insert':
        block.after.forEach((text) => rows.push({ kind: 'insert', text }));
        break;
      case 'delete':
        block.before.forEach((text) => rows.push({ kind: 'delete', text }));
        break;
      case 'replace':
        if (block.segments?.length) {
          rows.push({ kind: 'inline', block });
        } else {
          block.before.forEach((text) => rows.push({ kind: 'delete', text }));
          block.after.forEach((text) => rows.push({ kind: 'insert', text }));
        }
        break;
    }
  });
  return rows;
}

/** Paragraph-level diff of two revisions, with word-level changes inside a paragraph. */
@Component({
  selector: 'app-documents-diff-view',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="flex flex-col gap-1 text-[13.5px] leading-relaxed" data-testid="diff-rows">
      @for (row of rows(); track $index) {
        @switch (row.kind) {
          @case ('equal') {
            <li class="rounded-[6px] px-3 py-1 text-fg-muted">{{ row.text }}</li>
          }
          @case ('skip') {
            <li>
              <button
                type="button"
                class="w-full rounded-[6px] border border-dashed border-border px-3 py-1 text-left text-[12px] text-fg-subtle hover:text-fg"
                (click)="expand(row.blockIndex)"
              >
                {{ 'documents.control.compare.unchanged' | transloco: { count: row.count } }}
              </button>
            </li>
          }
          @case ('insert') {
            <li class="rounded-[6px] border-l-4 border-pass bg-pass-soft px-3 py-1 text-fg">
              <span class="sr-only">{{ 'documents.control.compare.added' | transloco }}</span>
              <ins class="no-underline">{{ row.text }}</ins>
            </li>
          }
          @case ('delete') {
            <li class="rounded-[6px] border-l-4 border-fail bg-fail-soft px-3 py-1 text-fg-muted">
              <span class="sr-only">{{ 'documents.control.compare.removed' | transloco }}</span>
              <del>{{ row.text }}</del>
            </li>
          }
          @case ('inline') {
            <li class="rounded-[6px] border-l-4 border-warn bg-warn-soft px-3 py-1 text-fg">
              <span class="sr-only">{{ 'documents.control.compare.changed' | transloco }}</span>
              @for (seg of row.block.segments; track $index) {
                @switch (seg.op) {
                  @case ('insert') {
                    <ins
                      class="rounded-[3px] bg-pass/20 px-0.5 font-semibold text-pass no-underline"
                      >{{ seg.text }}</ins
                    >
                  }
                  @case ('delete') {
                    <del class="rounded-[3px] bg-fail/15 px-0.5 text-fail">{{ seg.text }}</del>
                  }
                  @default {
                    <span>{{ seg.text }}</span>
                  }
                }
              }
            </li>
          }
        }
      }
    </ol>
  `,
})
export class DiffView {
  readonly blocks = input.required<readonly DiffBlock[]>();

  private readonly expanded = signal<ReadonlySet<number>>(new Set());

  protected readonly rows = computed(() => diffRows(this.blocks(), this.expanded()));

  protected expand(index: number): void {
    this.expanded.update((s) => new Set([...s, index]));
  }
}
