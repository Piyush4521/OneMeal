import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, RefreshCcw, Trash2, Copy, Check, ChevronDown, Sparkles, StopCircle } from 'lucide-react';
import { NeoButton } from './ui/NeoButton';
import { generateText, getGeminiTextModel, isGeminiConfigured } from '../lib/aiClient';
import { CHAT_EVENT } from '../lib/chatEvents';
const STORAGE_KEY = 'onemeal_chat_messages_v1';
const MAX_INPUT_CHARS = 280;
const QUICK_ACTIONS = [
  { label: 'Donation Help', text: 'Donation kaise karu?' },
  { label: 'Recipe Idea', text: 'Aaj ke liye quick recipe do.' },
  { label: 'Hunger Map', text: 'Nearest donation center kahan hai?' }
];

type Message = {
  id: string | number;
  text: string;
  sender: 'user' | 'bot';
};

type ConnectionState = 'idle' | 'connecting' | 'ready' | 'error';

const defaultMessages: Message[] = [
  { id: 'welcome', text: 'Namaste! Main OneMeal AI hu. Kaise madad karu? (Recipes ya Donation?)', sender: 'bot' }
];

export const ChatBot = () => {
  const hasApiKey = isGeminiConfigured();

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(defaultMessages);
  const [connectionState, setConnectionState] = useState<ConnectionState>(hasApiKey ? 'idle' : 'error');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | number | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch (error) {
      console.error('Failed to load saved messages:', error);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (error) {
      console.error('Failed to save messages:', error);
    }
  }, [messages, isHydrated]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    shouldAutoScrollRef.current = true;
    requestAnimationFrame(() => scrollToBottom('auto'));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!hasApiKey) {
      setConnectionState('error');
      return;
    }

    const controller = new AbortController();
    let isActive = true;

    const fetchModel = async () => {
      setConnectionState('connecting');

      try {
        const modelName = await getGeminiTextModel(controller.signal);
        if (isActive) {
          setActiveModel(modelName);
          setConnectionState('ready');
        }
      } catch (error) {
        if (isActive) {
          console.error('Model check failed.');
          setConnectionState('error');
        }
      }
    };

    fetchModel();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [hasApiKey]);

  useEffect(() => {
    if (!isOpen || !shouldAutoScrollRef.current) return;
    scrollToBottom('smooth');
  }, [messages, isTyping, isOpen]);

  useEffect(() => {
    if (isOpen) {
      const container = scrollContainerRef.current;
      if (container) {
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        const isNearBottom = distanceFromBottom <= 48;
        setShowScrollToBottom(!isNearBottom);
        if (isNearBottom) {
          shouldAutoScrollRef.current = true;
        }
      }
    }
  }, [isOpen, messages]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceFromBottom <= 48;
    setShowScrollToBottom(!isNearBottom);
    shouldAutoScrollRef.current = isNearBottom;
  };

  const callGeminiAI = useCallback(async (userText: string, signal: AbortSignal) => {
    try {
      const systemPrompt = [
        "You are a helpful assistant for 'OneMeal'.",
        'Rules: Keep answers short (max 2 sentences). Use Hinglish.',
        `User said: "${userText}".`
      ].join('\n');

      const reply = await generateText({
        prompt: systemPrompt,
        model: activeModel || undefined,
        signal,
        maxOutputTokens: 140,
      });
      return reply || 'Samajh nahi aaya. Phir se bolo?';
    } catch (error: any) {
      if (error?.name === 'AbortError') return null;
      console.error('AI Error:', error);
      return 'Oops! Net check karo?';
    }
  }, [activeModel]);

  const createMessageId = () =>
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto as Crypto).randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const handleSendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    if (!hasApiKey) {
      setErrorBanner('API key missing. Add VITE_GEMINI_API_KEY in .env to enable chat.');
      return;
    }

    if (trimmed.length > MAX_INPUT_CHARS) {
      setErrorBanner(`Message too long. Max ${MAX_INPUT_CHARS} characters.`);
      return;
    }

    setErrorBanner(null);

    const userMsg: Message = { id: createMessageId(), text: trimmed, sender: 'user' };
    shouldAutoScrollRef.current = true;
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const botReply = await callGeminiAI(trimmed, controller.signal);

      if (botReply === null) return;

      const botMsg: Message = { id: createMessageId(), text: botReply, sender: 'bot' };
      setMessages(prev => [...prev, botMsg]);
    } finally {
      setIsTyping(false);
      abortRef.current = null;
    }
  }, [hasApiKey, isTyping, callGeminiAI]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; open?: boolean }>).detail;
      if (!detail) return;
      if (detail.open || detail.text) setIsOpen(true);
      if (detail.text) {
        setTimeout(() => {
          handleSendText(detail.text || '');
        }, 80);
      }
    };
    window.addEventListener(CHAT_EVENT, handler as EventListener);
    return () => window.removeEventListener(CHAT_EVENT, handler as EventListener);
  }, [handleSendText]);

  const handleSend = async () => {
    await handleSendText(input);
  };

  const handleStop = () => {
    if (!isTyping) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsTyping(false);
  };

  const lastUserText = [...messages].reverse().find((msg) => msg.sender === 'user')?.text ?? null;

  const handleRegenerate = () => {
    if (!lastUserText || isTyping) return;
    handleSendText(lastUserText);
  };

  const handleClear = () => {
    setMessages(defaultMessages);
    setErrorBanner(null);
  };

  const handleCopy = async (text: string, id: string | number) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setErrorBanner('Clipboard not supported in this browser.');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 1500);
    } catch (error) {
      console.error('Copy failed:', error);
      setErrorBanner('Copy failed. Please try again.');
    }
  };

  const remainingChars = MAX_INPUT_CHARS - input.length;
  const isSendDisabled = !input.trim() || isTyping || !hasApiKey;

  const statusLabel = !hasApiKey
    ? 'API Key Missing'
    : connectionState === 'ready'
      ? 'Online'
      : connectionState === 'connecting'
        ? 'Connecting'
        : connectionState === 'error'
          ? 'Issue'
          : 'Idle';

  const statusClass = !hasApiKey || connectionState === 'error'
    ? 'bg-red-200 text-red-900'
    : connectionState === 'ready'
      ? 'bg-green-200 text-green-900'
      : connectionState === 'connecting'
        ? 'bg-yellow-200 text-yellow-900'
        : 'bg-gray-200 text-gray-900';

  return (
    <div className="fixed bottom-6 right-6 z-[9999] font-sans pointer-events-auto">
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setIsOpen(true)}
            className="bg-primary text-dark border-4 border-dark p-4 rounded-full shadow-neo flex items-center gap-2 relative"
            aria-label="Open OneMeal AI Chat"
          >
            <Bot size={32} />
            <span className="font-black hidden md:inline">Ask AI</span>
            <span className="absolute -top-2 -right-2 bg-white border-2 border-dark rounded-full p-1 shadow-neo">
              <Sparkles size={14} />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="bg-gradient-to-br from-white via-yellow-50 to-amber-100 border-4 border-dark rounded-2xl shadow-neo w-[92vw] md:w-[420px] h-[520px] max-h-[80vh] flex flex-col overflow-hidden pointer-events-auto"
          >
            <div className="bg-primary p-4 border-b-4 border-dark flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="bg-white p-1 rounded-full border-2 border-dark">
                  <Bot size={20} />
                </div>
                <div>
                  <h3 className="font-black text-lg leading-none">OneMeal AI</h3>
                  <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-[10px] font-black uppercase border-2 border-dark rounded-full ${statusClass}`}>
                    {statusLabel}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleRegenerate}
                  disabled={!lastUserText || isTyping}
                  title="Regenerate"
                  aria-label="Regenerate response"
                  className="p-1 rounded border-2 border-transparent hover:border-dark hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCcw size={18} />
                </button>
                <button
                  onClick={handleClear}
                  title="Clear chat"
                  aria-label="Clear chat"
                  className="p-1 rounded border-2 border-transparent hover:border-dark hover:bg-white/80"
                >
                  <Trash2 size={18} />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  title="Close"
                  aria-label="Close chat"
                  className="hover:bg-red-400 p-1 rounded transition-colors border-2 border-transparent hover:border-dark"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 relative min-h-0">
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="h-full overflow-y-auto p-4 space-y-4 bg-yellow-50 scroll-smooth overscroll-contain touch-pan-y"
                role="log"
                aria-live="polite"
                aria-busy={isTyping}
              >
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`group max-w-[80%] p-3 rounded-xl border-2 border-dark font-bold text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${msg.sender === 'user' ? 'bg-white text-dark rounded-br-none' : 'bg-white text-dark rounded-bl-none'}`}>
                        <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                        {msg.sender === 'bot' && (
                          <button
                            onClick={() => handleCopy(msg.text, msg.id)}
                            className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase font-black opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                            aria-label="Copy message"
                          >
                            {copiedMessageId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                            {copiedMessageId === msg.id ? 'Copied' : 'Copy'}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-gray-200 border-2 border-dark p-3 rounded-xl rounded-bl-none flex gap-1 items-center">
                      <span className="w-2 h-2 bg-dark rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-dark rounded-full animate-bounce" style={{ animationDelay: '120ms' }}></span>
                      <span className="w-2 h-2 bg-dark rounded-full animate-bounce" style={{ animationDelay: '240ms' }}></span>
                    </div>
                  </div>
                )}

                {!hasApiKey && (
                  <div className="bg-red-100 border-2 border-dark p-3 rounded-xl text-xs font-bold">
                    API key missing. Add <code>VITE_GEMINI_API_KEY</code> in <code>.env</code> to enable chat.
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <AnimatePresence>
                {showScrollToBottom && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    onClick={() => {
                      shouldAutoScrollRef.current = true;
                      scrollToBottom('smooth');
                    }}
                    className="absolute bottom-4 right-4 bg-white border-2 border-dark rounded-full p-2 shadow-neo"
                    aria-label="Scroll to bottom"
                  >
                    <ChevronDown size={16} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            <div className="border-t-4 border-dark bg-white">
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-dark">
                  <Sparkles size={14} />
                  <span>Quick Prompts</span>
                </div>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => handleSendText(action.text)}
                      disabled={isTyping || !hasApiKey}
                      className="whitespace-nowrap bg-yellow-100 border-2 border-dark px-3 py-1 rounded-full text-xs font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>

              {errorBanner && (
                <div className="mx-4 mb-2 bg-red-100 border-2 border-dark px-3 py-2 rounded-xl text-xs font-bold">
                  {errorBanner}
                </div>
              )}

              <div className="px-4 pb-4 flex gap-2 items-center">
                <div className="flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Pucho kuch bhi..."
                    maxLength={MAX_INPUT_CHARS}
                    className="w-full bg-gray-100 border-2 border-dark rounded-xl px-3 py-2 font-bold focus:outline-none focus:bg-yellow-50 transition-colors"
                    aria-label="Type your message"
                  />
                  <div className="mt-1 text-[10px] font-black uppercase text-dark opacity-70 flex justify-between">
                    <span>{isTyping ? 'AI is typing...' : 'Press Enter to send'}</span>
                    <span>{remainingChars}</span>
                  </div>
                </div>

                {!isTyping ? (
                  <NeoButton
                    onClick={handleSend}
                    disabled={isSendDisabled}
                    className="px-3 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
                    aria-label="Send message"
                  >
                    <Send size={20} />
                  </NeoButton>
                ) : (
                  <NeoButton
                    onClick={handleStop}
                    variant="danger"
                    className="px-3"
                    aria-label="Stop generating"
                  >
                    <StopCircle size={20} />
                  </NeoButton>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
