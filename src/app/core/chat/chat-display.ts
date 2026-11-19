import { Injectable, inject } from '@angular/core';
import { LanguageService } from '../i18n/language.service';
import { ChatStore } from './chat-store';
import { conversationName } from './chat-format';
import { ConversationCore } from './chat.models';

/**
 * Display names of conversations for the viewer (signal-tracked): DM → the
 * other person, channel → `#name`, group → its name or member names, and an
 * unnamed record discussion → the record's title when the viewer can read
 * it (resolved per viewer, never stored), else a neutral label.
 */
@Injectable({ providedIn: 'root' })
export class ChatDisplay {
  private readonly store = inject(ChatStore);
  private readonly language = inject(LanguageService);

  name(conversation: ConversationCore | null | undefined): string {
    if (!conversation) {
      return '';
    }
    const literal = conversationName(conversation, this.store.meId());
    if (literal) {
      return conversation.kind === 'channel' ? `#${literal}` : literal;
    }
    if (conversation.subject) {
      const preview = this.store.linkPreview(conversation.subject);
      if (preview?.visible && preview.title) {
        return preview.title;
      }
      return this.language.translate('chat.names.recordDiscussion');
    }
    return this.language.translate('chat.names.unnamedGroup');
  }

  /** The other person of a DM (for presence), else null. */
  dmPartner(conversation: ConversationCore | null | undefined): string | null {
    if (!conversation || conversation.kind !== 'dm') {
      return null;
    }
    const me = this.store.meId();
    return (
      conversation.dm_user_ids?.find((id) => id !== me) ??
      conversation.member_preview.find((u) => u.id !== me)?.id ??
      null
    );
  }
}
