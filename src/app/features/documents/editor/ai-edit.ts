import { AiEditMode } from '../../../core/ai/ai-edit.models';

/** A quick AI action surfaced in the selection bubble menu. */
export interface AiQuickAction {
  readonly mode: AiEditMode;
  /** i18n key for the button label. */
  readonly labelKey: string;
}

/** The selection bubble-menu actions, in display order. Translate and custom
 *  ("Ask AI to edit…") are handled separately as they need extra input. */
export const AI_QUICK_ACTIONS: readonly AiQuickAction[] = [
  { mode: 'improve', labelKey: 'documents.editor.ai.improve' },
  { mode: 'rewrite', labelKey: 'documents.editor.ai.rewrite' },
  { mode: 'shorten', labelKey: 'documents.editor.ai.shorten' },
  { mode: 'expand', labelKey: 'documents.editor.ai.expand' },
  { mode: 'fix', labelKey: 'documents.editor.ai.fix' },
];

/** i18n label key per AI edit mode, used for the suggestion panel header.
 *  `custom` has no fixed label — the user's instruction is shown verbatim. */
export const AI_MODE_LABEL_KEYS: Record<Exclude<AiEditMode, 'custom'>, string> = {
  improve: 'documents.editor.ai.improve',
  rewrite: 'documents.editor.ai.rewrite',
  shorten: 'documents.editor.ai.shorten',
  expand: 'documents.editor.ai.expand',
  fix: 'documents.editor.ai.fix',
  translate: 'documents.editor.ai.translate',
  continue: 'documents.editor.ai.continue',
};

/** Preset translation targets offered in the Translate prompt. */
export const TRANSLATE_PRESETS: readonly { readonly key: string; readonly instruction: string }[] =
  [
    { key: 'documents.editor.ai.translateEnglish', instruction: 'English' },
    { key: 'documents.editor.ai.translateNorwegian', instruction: 'Norwegian' },
  ];
