import { Injector, Signal, computed, inject } from '@angular/core';
import { ChatStore } from '../../core/chat/chat-store';
import { SelectedOrgService } from '../../core/org/selected-org.service';

/**
 * The chat store, created only once the selected org grants `chat:use`.
 * Shell and record-page widgets use this so that pages (and specs) of users
 * without chat never construct the store, load modules or open a socket.
 * Must be called in an injection context.
 */
export function lazyChatStore(): Signal<ChatStore | null> {
  const injector = inject(Injector);
  const selectedOrg = inject(SelectedOrgService);
  let store: ChatStore | null = null;
  return computed(() => {
    if (!selectedOrg.currentOrg()?.permissions.includes('chat:use')) {
      return store;
    }
    store ??= injector.get(ChatStore);
    return store;
  });
}
