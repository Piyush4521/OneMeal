export const CHAT_EVENT = 'onemeal:chat';

export const openChat = (text?: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAT_EVENT, { detail: { open: true, text } }));
};
