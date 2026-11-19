import { provideSharedScope } from '../i18n/shared-scope';

/** Transloco scope of chat (`src/assets/i18n/chat/<lang>.json`, keys `chat.*`). */
export const CHAT_SCOPE = 'chat';

/** Every chat component provides it in `viewProviders` (merged with the host's scope). */
export const provideChatScope = () => provideSharedScope(CHAT_SCOPE);
