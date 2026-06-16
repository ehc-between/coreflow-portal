import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  SecurityContext,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { Editor } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
import { AiEditApi, AiEditStream } from '../../../core/ai/ai-edit-api';
import { AiEditMode } from '../../../core/ai/ai-edit.models';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Icon } from '../../../shared/ui/icon/icon';
import { AI_MODE_LABEL_KEYS, AI_QUICK_ACTIONS, TRANSLATE_PRESETS } from './ai-edit';

type AiPhase = 'streaming' | 'review' | 'error' | 'not-configured';

/** State of an in-flight / completed AI edit awaiting accept/reject. */
interface AiSession {
  readonly mode: AiEditMode;
  /** True for "continue writing" (insert at cursor) vs. replace selection. */
  readonly insert: boolean;
  /** Free-text instruction for custom/translate modes (drives the panel header). */
  readonly instruction: string;
  /** HTML of the selection this edit was started from (the "Original"). */
  readonly selectionHtml: string;
  phase: AiPhase;
  /** Accumulated replacement/insertion HTML from the stream. */
  html: string;
}

/**
 * Rich-text document editor built on TipTap (ProseMirror). Mounts a single
 * `Editor` on a `<div>` styled as a paper page (`.cf-doc`), exposes a toolbar
 * (marks, headings, lists, blockquote, code, link, alignment, tables, history),
 * and an embedded AI layer: a selection bubble menu (Improve / Rewrite / Shorten
 * / Expand / Fix / Translate / Ask AI to edit…) and a toolbar "Continue writing"
 * action. AI edits stream via {@link AiEditApi}, then present Accept / Reject.
 *
 * Public surface for later waves:
 *  - input  `content`       — initial HTML to load.
 *  - input  `saving`        — disables Save while a revision is being persisted.
 *  - input  `embedded`      — hides the Save/Cancel bar; host owns submission and
 *                             reads HTML via `contentChange`.
 *  - output `save`          — emits the current HTML when the user saves.
 *  - output `cancelEdit`    — emits when the user discards and leaves the editor.
 *  - output `contentChange` — emits the current HTML on every change (embedded use).
 *
 * Zoneless: `onUpdate` pushes `editor.getHTML()` into the `html` signal and AI
 * stream events land in signals via the callback. Destroys the editor on teardown.
 */
@Component({
  selector: 'app-document-editor',
  imports: [FormsModule, TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './document-editor.css',
  templateUrl: './document-editor.html',
})
export class DocumentEditor implements OnDestroy {
  private readonly aiApi = inject(AiEditApi);
  private readonly selectedOrg = inject(SelectedOrgService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly content = input<string>('');
  readonly saving = input(false);
  /**
   * When true the editor renders as a pure editing surface: its own Save/Cancel
   * bar is hidden and the host owns submission. The current HTML is streamed out
   * via {@link contentChange} on every change. Default behaviour (standalone
   * edit route) is unchanged.
   */
  readonly embedded = input(false);

  readonly save = output<string>();
  readonly cancelEdit = output<void>();
  readonly contentChange = output<string>();

  private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>('host');

  /** Current document HTML; updated on every editor change. */
  protected readonly html = signal('');
  /** Bumped on every editor transaction so toolbar active-state recomputes. */
  protected readonly selectionTick = signal(0);

  protected readonly bubbleVisible = signal(false);
  protected readonly bubbleStyle = signal<Record<string, string>>({});
  protected readonly showTranslate = signal(false);
  protected readonly showCustom = signal(false);
  protected readonly customInstruction = signal('');

  protected readonly ai = signal<AiSession | null>(null);

  protected readonly quickActions = AI_QUICK_ACTIONS;
  protected readonly translatePresets = TRANSLATE_PRESETS;

  protected readonly canSave = computed(() => !this.saving());

  private editor: Editor | null = null;
  private stream: AiEditStream | null = null;

  constructor() {
    effect(() => {
      const host = this.hostRef().nativeElement;
      if (this.editor) {
        return;
      }
      this.editor = new Editor({
        element: host,
        extensions: [
          StarterKit.configure({ link: false, underline: false }),
          Underline,
          Link.configure({ openOnClick: false, autolink: true }),
          TextAlign.configure({ types: ['heading', 'paragraph'] }),
          Placeholder.configure({ placeholder: this.placeholderText }),
          TableKit.configure({ table: { resizable: true } }),
        ],
        content: this.content(),
        editorProps: {
          attributes: {
            class: 'cf-doc cf-doc--wide',
            role: 'textbox',
            'aria-multiline': 'true',
          },
        },
        onUpdate: ({ editor }) => {
          const html = editor.getHTML();
          this.html.set(html);
          this.contentChange.emit(html);
        },
        onSelectionUpdate: () => {
          this.selectionTick.update((n) => n + 1);
          this.refreshBubble();
        },
        onTransaction: () => this.selectionTick.update((n) => n + 1),
      });
      this.html.set(this.editor.getHTML());
    });
  }

  ngOnDestroy(): void {
    this.stream?.cancel();
    this.editor?.destroy();
    this.editor = null;
  }

  private get placeholderText(): string {
    return this.hostRef().nativeElement.dataset['placeholder'] ?? '';
  }

  // --- Toolbar commands -----------------------------------------------------

  protected isActive(
    name: string | Record<string, unknown>,
    attrs?: Record<string, unknown>,
  ): boolean {
    // Read the tick so Angular recomputes after each transaction (zoneless).
    void this.selectionTick();
    if (typeof name === 'string') {
      return this.editor?.isActive(name, attrs) ?? false;
    }
    return this.editor?.isActive(name) ?? false;
  }

  protected toggleBold(): void {
    this.editor?.chain().focus().toggleBold().run();
  }
  protected toggleItalic(): void {
    this.editor?.chain().focus().toggleItalic().run();
  }
  protected toggleUnderline(): void {
    this.editor?.chain().focus().toggleUnderline().run();
  }
  protected toggleStrike(): void {
    this.editor?.chain().focus().toggleStrike().run();
  }
  protected toggleCode(): void {
    this.editor?.chain().focus().toggleCode().run();
  }
  protected toggleHeading(level: 1 | 2 | 3): void {
    this.editor?.chain().focus().toggleHeading({ level }).run();
  }
  protected toggleBulletList(): void {
    this.editor?.chain().focus().toggleBulletList().run();
  }
  protected toggleOrderedList(): void {
    this.editor?.chain().focus().toggleOrderedList().run();
  }
  protected toggleBlockquote(): void {
    this.editor?.chain().focus().toggleBlockquote().run();
  }
  protected setAlign(align: 'left' | 'center' | 'right'): void {
    this.editor?.chain().focus().setTextAlign(align).run();
  }
  protected undo(): void {
    this.editor?.chain().focus().undo().run();
  }
  protected redo(): void {
    this.editor?.chain().focus().redo().run();
  }

  protected toggleLink(): void {
    const editor = this.editor;
    if (!editor) {
      return;
    }
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt(this.linkPrompt)?.trim();
    if (!url) {
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  /** Read from a data attribute so the prompt string stays translated. */
  private get linkPrompt(): string {
    return this.hostRef().nativeElement.dataset['linkPrompt'] ?? '';
  }

  protected insertTable(): void {
    this.editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }
  protected addRowAfter(): void {
    this.editor?.chain().focus().addRowAfter().run();
  }
  protected addColumnAfter(): void {
    this.editor?.chain().focus().addColumnAfter().run();
  }
  protected deleteRow(): void {
    this.editor?.chain().focus().deleteRow().run();
  }
  protected deleteColumn(): void {
    this.editor?.chain().focus().deleteColumn().run();
  }
  protected deleteTable(): void {
    this.editor?.chain().focus().deleteTable().run();
  }

  protected get inTable(): boolean {
    void this.selectionTick();
    return this.editor?.isActive('table') ?? false;
  }

  protected onSave(): void {
    if (!this.editor || this.saving()) {
      return;
    }
    this.save.emit(this.editor.getHTML());
  }

  protected onCancel(): void {
    this.cancelEdit.emit();
  }

  // --- Selection bubble menu ------------------------------------------------

  /** Half the bubble's assumed width / its assumed height, used to clamp its
   *  fixed position inside the editor's visible area before it has measured. */
  private static readonly BUBBLE_HALF_WIDTH = 170;
  private static readonly BUBBLE_HEIGHT = 48;
  private static readonly BUBBLE_GAP = 8;
  private static readonly VIEWPORT_MARGIN = 8;

  /**
   * Position the selection action bar with viewport-fixed coordinates clamped to
   * the editor's visible content area: its horizontal centre never crosses the
   * editor's left/right bounds (so it can't slide under the fixed side nav or off
   * the right edge), and it flips below the selection when there isn't room above
   * the top of the viewport. Recomputed on every selection change.
   */
  private refreshBubble(): void {
    const editor = this.editor;
    if (!editor) {
      return;
    }
    const { from, to, empty } = editor.state.selection;
    if (empty || this.ai()) {
      this.hideBubble();
      return;
    }
    const box = this.hostRef().nativeElement.getBoundingClientRect();
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);

    const halfW = DocumentEditor.BUBBLE_HALF_WIDTH;
    const margin = DocumentEditor.VIEWPORT_MARGIN;
    const minCentre = Math.max(box.left, margin) + halfW;
    const maxCentre = Math.min(box.right, window.innerWidth - margin) - halfW;
    const rawCentre = (start.left + end.left) / 2;
    const left =
      maxCentre < minCentre
        ? (minCentre + maxCentre) / 2
        : Math.min(Math.max(rawCentre, minCentre), maxCentre);

    const selTop = Math.min(start.top, end.top);
    const selBottom = Math.max(start.bottom, end.bottom);
    const gap = DocumentEditor.BUBBLE_GAP;
    const aboveTop = selTop - gap - DocumentEditor.BUBBLE_HEIGHT;
    // Flip below the selection when the bar would clip past the top of the viewport.
    const placeBelow = aboveTop < margin;
    const top = placeBelow ? selBottom + gap : selTop - gap;
    const translateY = placeBelow ? '0' : '-100%';

    this.bubbleStyle.set({
      top: `${top}px`,
      left: `${left}px`,
      transform: `translate(-50%, ${translateY})`,
    });
    this.bubbleVisible.set(true);
  }

  private hideBubble(): void {
    this.bubbleVisible.set(false);
    this.showTranslate.set(false);
    this.showCustom.set(false);
  }

  // --- AI editing -----------------------------------------------------------

  protected runQuickAction(mode: AiEditMode): void {
    this.startAi(mode, '', false);
  }

  protected openTranslate(): void {
    this.showCustom.set(false);
    this.showTranslate.update((v) => !v);
  }

  protected openCustom(): void {
    this.showTranslate.set(false);
    this.showCustom.update((v) => !v);
  }

  protected translateTo(instruction: string): void {
    this.startAi('translate', instruction, false);
  }

  protected submitCustom(): void {
    const instruction = this.customInstruction().trim();
    if (!instruction) {
      return;
    }
    this.customInstruction.set('');
    this.startAi('custom', instruction, false);
  }

  protected continueWriting(): void {
    this.startAi('continue', '', true);
  }

  private startAi(mode: AiEditMode, instruction: string, insert: boolean): void {
    const editor = this.editor;
    const orgId = this.selectedOrg.currentOrgId();
    if (!editor || !orgId || this.ai()) {
      return;
    }

    this.hideBubble();
    const selectionHtml = insert ? '' : this.selectionHtml();
    this.ai.set({ mode, insert, instruction, selectionHtml, phase: 'streaming', html: '' });

    this.stream = this.aiApi.edit(
      {
        org_id: orgId,
        mode,
        instruction,
        selection_html: selectionHtml,
        doc_context_text: editor.getText(),
      },
      (event) => {
        switch (event.type) {
          case 'delta':
            this.ai.update((s) => (s ? { ...s, html: s.html + event.text } : s));
            break;
          case 'done':
            this.ai.update((s) => (s ? { ...s, phase: s.html ? 'review' : 'error' } : s));
            this.stream = null;
            break;
          case 'error':
            this.ai.update((s) => (s ? { ...s, phase: 'error' } : s));
            this.stream = null;
            break;
          case 'not-configured':
            this.ai.update((s) => (s ? { ...s, phase: 'not-configured' } : s));
            this.stream = null;
            break;
        }
      },
    );
  }

  /** Serialize the current selection to an HTML fragment. */
  private selectionHtml(): string {
    const editor = this.editor;
    if (!editor) {
      return '';
    }
    const { from, to } = editor.state.selection;
    const slice = editor.state.doc.slice(from, to);
    const serializer = DOMSerializer.fromSchema(editor.schema);
    const fragment = serializer.serializeFragment(slice.content);
    const div = document.createElement('div');
    div.appendChild(fragment);
    return div.innerHTML;
  }

  protected acceptAi(): void {
    const editor = this.editor;
    const session = this.ai();
    if (!editor || !session || session.phase !== 'review') {
      return;
    }
    // Sanitize before insertion; TipTap then re-parses into its schema, dropping
    // anything not allowed (no script execution path).
    const safe = this.sanitizer.sanitize(SecurityContext.HTML, session.html) ?? '';
    if (session.insert) {
      editor.chain().focus().insertContent(safe).run();
    } else {
      editor.chain().focus().deleteSelection().insertContent(safe).run();
    }
    this.ai.set(null);
  }

  protected rejectAi(): void {
    this.stream?.cancel();
    this.stream = null;
    this.ai.set(null);
    this.editor?.commands.focus();
  }

  protected aiPreview(html: string) {
    return this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
  }

  /** i18n key for the panel header label, or null when the raw instruction (a
   *  custom "Ask AI to edit…" request) should be shown verbatim instead. */
  protected aiActionLabelKey(session: AiSession): string | null {
    return session.mode === 'custom' ? null : AI_MODE_LABEL_KEYS[session.mode];
  }
}
