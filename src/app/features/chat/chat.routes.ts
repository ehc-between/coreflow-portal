import { Routes, UrlMatchResult, UrlSegment } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * `/chat`, `/chat/browse` and `/chat/:conversationId` share ONE route, so the
 * page (and its list pane) stays mounted while the user moves between
 * conversations. `view` and `conversationId` bind to the page's inputs.
 */
export function chatMatcher(segments: readonly UrlSegment[]): UrlMatchResult | null {
  if (segments.length === 0) {
    return { consumed: [] };
  }
  if (segments.length === 1) {
    const [segment] = segments;
    return segment.path === 'browse'
      ? { consumed: [...segments], posParams: { view: segment } }
      : { consumed: [...segments], posParams: { conversationId: segment } };
  }
  return null;
}

/** Chat routes (docs/chat-design.md §4.3); `m`, `thread` and `tag` are query params. */
const routes: Routes = [
  {
    matcher: (segments) => chatMatcher(segments),
    providers: [provideTranslocoScope('chat')],
    loadComponent: () => import('./chat-page').then((m) => m.ChatPage),
  },
];

export default routes;
