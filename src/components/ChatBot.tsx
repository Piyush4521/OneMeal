import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Send, Bot, Trash2, Copy, Check, ChevronDown, 
  Sparkles, StopCircle, Image as ImageIcon, 
  Mic, MicOff, ChefHat, HeartHandshake, History, Plus
} from 'lucide-react';
import { CHAT_EVENT } from '../lib/chatEvents';
import { generateMultimodalText, getGeminiTextModel, isGeminiConfigured } from '../lib/aiClient';

const STORAGE_KEY = 'onemeal_chat_sessions_v2';
const MAX_INPUT_CHARS = 500;

// ==========================================
// 🧩 TYPES & INTERFACES
// ==========================================
type Sender = 'user' | 'bot';

type Message = {
  id: string;
  text: string;
  sender: Sender;
  imageData?: string | null; 
};

type ChatSession = {
  id: string;
  title: string;
  date: string;
  messages: Message[];
};

type ConnectionState = 'idle' | 'connecting' | 'ready' | 'error';
type PersonaId = 'general' | 'chef' | 'volunteer';

// ==========================================
// 🎭 AI PERSONAS CONFIGURATION
// ==========================================
const PERSONAS = {
  general: {
    id: 'general',
    name: 'OneMeal AI',
    icon: <Bot size={18} />,
    color: 'bg-[#FFD700]',
    prompt: "You are OneMeal AI, a helpful, friendly assistant for a food donation and zero-waste recipe app. Speak in Hinglish (Hindi+English). Keep it concise, helpful, and energetic. Use emojis.",
    greetings: "Namaste! Main OneMeal AI hu. Kaise madad karu aaj?"
  },
  chef: {
    id: 'chef',
    name: 'Bawarchi AI',
    icon: <ChefHat size={18} />,
    color: 'bg-pink-300',
    prompt: "You are an expert Indian Chef. Focus ONLY on recipes, zero-waste cooking, and utilizing leftovers. Speak in Hinglish. Be enthusiastic about food. Use culinary emojis.",
    greetings: "Hello ji! Fridge mein kya bacha hai aaj? Chalo kuch tasty banate hain! 👨‍🍳"
  },
  volunteer: {
    id: 'volunteer',
    name: 'Sahayak AI',
    icon: <HeartHandshake size={18} />,
    color: 'bg-green-300',
    prompt: "You are a social worker expert for OneMeal. Focus ONLY on guiding users on how to donate food, finding NGOs, reducing hunger, and packaging food for donation safely. Speak in empathetic Hinglish.",
    greetings: "Namaste. Kisi zaruratmand ki madad karni hai kya? Main guide karunga. 🤝"
  }
};

const QUICK_ACTIONS = [
  { label: 'Donation Help', text: 'Food donate karne ka process kya hai?' },
  { label: 'Leftover Magic', text: 'Basi chawal se kya banau?' },
  { label: 'Hunger Spots', text: 'Aas paas donation centers kahan hain?' },
  { label: 'Food Safety', text: 'Bacha hua khana kab tak safe rehta hai?' }
];

// ==========================================
// 🛠️ HELPER COMPONENTS
// ==========================================
const renderFormattedText = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|\n)/g);
  return parts.map((part, i) => {
    if (part === '\n') return <br key={i} />;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-black text-black">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i} className="font-bold italic">{part.slice(1, -1)}</em>;
    }
    if (part.trim().startsWith('- ') || part.trim().startsWith('• ')) {
        return <div key={i} className="flex gap-2 my-1"><span className="text-primary mt-0.5">▪</span><span>{part.substring(2)}</span></div>;
    }
    return <span key={i}>{part}</span>;
  });
};

// ==========================================
// 🌟 MAIN CHATBOT COMPONENT
// ==========================================
export const ChatBot = () => {
  const hasApiKey = isGeminiConfigured('chat');

  // UI State
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  // Chat State
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(hasApiKey ? 'idle' : 'error');
  const [activePersona, setActivePersona] = useState<PersonaId>('general');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  
  // Attachments & Features State
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Sessions State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Speech Recognition
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = SpeechRecognition ? new SpeechRecognition() : null;

  // --- INITIALIZATION ---
  useEffect(() => {
    if (!hasApiKey) {
      setErrorBanner('Add VITE_GEMINI_API_KEY_CHAT or VITE_GEMINI_API_KEY in .env and restart the app to enable chat.');
      setConnectionState('error');
    }
  }, [hasApiKey]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ChatSession[];
        if (parsed.length > 0) {
          setSessions(parsed);
          setCurrentSessionId(parsed[0].id);
        } else {
          createNewSession();
        }
      } else {
        createNewSession();
      }
    } catch (e) {
      createNewSession();
    }
  }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }
  }, [sessions]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
    shouldAutoScrollRef.current = true;
    requestAnimationFrame(() => scrollToBottom('auto'));
  }, [isOpen, activePersona, currentSessionId]);

  useEffect(() => {
    if (!isOpen || !shouldAutoScrollRef.current) return;
    scrollToBottom('smooth');
  }, [sessions, isTyping, isOpen]);

  // --- SESSION MANAGEMENT ---
  const createMessageId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const createNewSession = () => {
    const newId = createMessageId();
    const newSession: ChatSession = {
      id: newId,
      title: `Chat ${new Date().toLocaleDateString()}`,
      date: new Date().toISOString(),
      messages: [{ id: createMessageId(), text: PERSONAS[activePersona].greetings, sender: 'bot' }]
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setShowHistory(false);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    if (currentSessionId === id) {
      if (updated.length > 0) setCurrentSessionId(updated[0].id);
      else createNewSession();
    }
  };

  const currentMessages = sessions.find(s => s.id === currentSessionId)?.messages || [];

  const updateCurrentMessages = (newMessages: Message[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        let title = s.title;
        const firstUserMsg = newMessages.find(m => m.sender === 'user');
        if (s.messages.length <= 2 && firstUserMsg) {
          title = firstUserMsg.text.slice(0, 20) + '...';
        }
        return { ...s, title, messages: newMessages };
      }
      return s;
    }));
  };

  useEffect(() => {
    if (!hasApiKey) return setConnectionState('error');
    
    const controller = new AbortController();
    let isActive = true;

    const fetchModel = async () => {
      setConnectionState('connecting');
      try {
        await getGeminiTextModel(controller.signal, 'chat');
        if (isActive) {
          setConnectionState('ready');
        }
      } catch (error) {
        if (isActive) setConnectionState('error');
      }
    };
    fetchModel();
    return () => { isActive = false; controller.abort(); };
  }, [hasApiKey]);

  const getFriendlyAiError = (message?: string) => {
    const errorMsg = message?.toLowerCase() || '';
    if (errorMsg.includes('quota') || errorMsg.includes('limit') || errorMsg.includes('exhausted') || errorMsg.includes('429')) {
      return 'Bhai, Google ke servers ki free limit cross ho gayi! 30 seconds ruko aur phir try karo.';
    }
    if (errorMsg.includes('overloaded') || errorMsg.includes('503')) {
      return 'Google AI thoda busy chal raha hai. Ek minute baad try karna!';
    }
    if (errorMsg.includes('api key') || errorMsg.includes('permission') || errorMsg.includes('403')) {
      return 'Gemini setup issue. Check VITE_GEMINI_API_KEY_CHAT or VITE_GEMINI_API_KEY in .env and restart the app.';
    }
    if (errorMsg.includes('blocked')) {
      return 'Safety filter blocked the response. Try rephrasing the message.';
    }
    return `Oops! Net check karo ya phir thodi der mein try karo?\n\n(Error: ${(message || 'Unknown error').substring(0, 50)})`;
  };

  // --- MULTIMODAL API CALL ---
  const callGeminiAI = useCallback(async (userText: string, base64Image: string | null, signal: AbortSignal) => {
    try {
      const persona = PERSONAS[activePersona];
      return await generateMultimodalText({
        prompt: userText || 'What is in this image?',
        imageDataUrl: base64Image,
        signal,
        temperature: 0.6,
        maxOutputTokens: 800,
        systemInstruction: persona.prompt,
        feature: 'chat',
      });
      /*

      // SAFEY CHECK: If uploading an image, but the key only supports text model (1.0-pro)
      if (base64Image && (modelToUse === 'gemini-1.0-pro' || modelToUse === 'gemini-pro')) {
         return "Bhai, aapki API key images support nahi karti. 🙏 Please photo hata ke sirf text type karo!";
      }

      const persona = PERSONAS[activePersona];
      const parts: any[] = [];
      
      parts.push({ text: `System Instruction: ${persona.prompt}\n\nUser: ${userText}` });

      if (base64Image) {
        const mimeType = base64Image.substring(base64Image.indexOf(":") + 1, base64Image.indexOf(";"));
        const base64Data = base64Image.split(',')[1];
        parts.push({ inlineData: { mimeType, data: base64Data } });
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            contents: [{ parts }],
            generationConfig: { temperature: 0.6, maxOutputTokens: 800 }
          }),
          signal
        }
      );

      const data = await response.json();
      
      if (data.error) {
        const errorMsg = data.error.message.toLowerCase();
        if (errorMsg.includes('quota') || errorMsg.includes('limit') || errorMsg.includes('exhausted') || errorMsg.includes('429')) {
           return 'Bhai, Google ke servers ki free limit cross ho gayi! 30 seconds ruko aur phir try karo. ⏳😅';
        }
        if (errorMsg.includes('overloaded') || errorMsg.includes('503')) {
           return 'Google AI thoda busy chal raha hai. Ek minute baad try karna! 🚦';
        }
        throw new Error(data.error.message);
      }

      if (!data.candidates || data.candidates.length === 0) return 'Safety filter blocked the response. Try again.';

      return data.candidates[0].content.parts[0].text;
      */
    } catch (error: any) {
      if (error?.name === 'AbortError') return null;
      console.error('AI Error:', error);
      return getFriendlyAiError(error?.message);
      /*
      
      const errorMsg = error.message?.toLowerCase() || '';
      if (errorMsg.includes('quota') || errorMsg.includes('limit') || errorMsg.includes('429')) {
          return 'Bhai, Google ke servers ki free limit cross ho gayi! 30 seconds ruko aur phir try karo. ⏳😅';
      }
      if (errorMsg.includes('overloaded') || errorMsg.includes('503')) {
          return 'Google AI thoda busy chal raha hai. Ek minute baad try karna! 🚦';
      }
      
      return `Oops! Net check karo ya phir thodi der mein try karo? 🔌\n\n(Error: ${error.message?.substring(0, 50)})`;
      */
    }
  }, [activePersona]);

  // --- MESSAGE HANDLER ---
  const handleSendText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed && !attachedImage) return;
    if (isTyping) return;

    setErrorBanner(null);

    const userMsg: Message = { 
      id: createMessageId(), 
      text: trimmed || "Uploaded an image", 
      sender: 'user',
      imageData: attachedImage 
    };
    
    const newMessages = [...currentMessages, userMsg];
    updateCurrentMessages(newMessages);
    
    setInput('');
    const imageToProcess = attachedImage;
    setAttachedImage(null); 
    setIsTyping(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const botReply = await callGeminiAI(trimmed || "What is in this image?", imageToProcess, controller.signal);
      if (botReply === null) return;

      const botMsg: Message = { id: createMessageId(), text: botReply, sender: 'bot' };
      updateCurrentMessages([...newMessages, botMsg]);
    } finally {
      setIsTyping(false);
      abortRef.current = null;
    }
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; open?: boolean }>).detail;
      if (!detail) return;
      if (detail.open || detail.text) setIsOpen(true);
      if (detail.text) setTimeout(() => handleSendText(detail.text || ''), 100);
    };
    window.addEventListener(CHAT_EVENT, handler as EventListener);
    return () => window.removeEventListener(CHAT_EVENT, handler as EventListener);
  }, [handleSendText]);

  // --- MEDIA HANDLERS ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 4 * 1024 * 1024) {
      setErrorBanner("Image too large. Keep it under 4MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => setAttachedImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggleVoiceDictation = () => {
    if (!recognition) return setErrorBanner("Voice typing not supported in this browser.");

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      recognition.lang = 'hi-IN';
      recognition.start();
      setIsListening(true);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev + (prev ? ' ' : '') + transcript);
        setIsListening(false);
      };
      recognition.onerror = () => {
        setIsListening(false);
        setErrorBanner("Could not hear you properly.");
      };
      recognition.onend = () => setIsListening(false);
    }
  };

  // --- UTILITIES ---
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceFromBottom <= 48;
    setShowScrollToBottom(!isNearBottom);
    shouldAutoScrollRef.current = isNearBottom;
  };

  const handleCopy = async (text: string, id: string) => {
    if (!navigator.clipboard) return setErrorBanner('Clipboard not supported.');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 1500);
    } catch (e) {
      setErrorBanner('Copy failed.');
    }
  };

  const handlePersonaChange = (pId: PersonaId) => {
    setActivePersona(pId);
    if (currentMessages.length <= 1) {
       updateCurrentMessages([{ id: createMessageId(), text: PERSONAS[pId].greetings, sender: 'bot' }]);
    }
  };

  // --- UI RENDERS ---
  const isSendDisabled = (!input.trim() && !attachedImage) || isTyping || !hasApiKey;
  const statusLabel = !hasApiKey ? 'No API Key' : connectionState === 'ready' ? 'Online' : connectionState === 'connecting' ? 'Connecting' : 'Error';

  return (
    <div className="fixed bottom-6 right-6 z-[9999] font-sans pointer-events-auto">
      
      {/* CLOSED STATE FAB - YELLOW WITH WHITE ICON AS REQUESTED */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
            onClick={() => setIsOpen(true)}
            className="bg-[#FFD700] text-black border-4 border-black p-4 rounded-full shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex items-center gap-3 relative hover:bg-yellow-400 transition-colors"
          >
            <Bot size={32} className="text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,1)]"/>
            <span className="font-black text-lg hidden md:inline text-white drop-shadow-[1px_1px_0px_rgba(0,0,0,1)]">Ask AI</span>
            <span className="absolute -top-2 -right-2 bg-red-500 text-white border-2 border-black rounded-full p-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] animate-bounce">
              <Sparkles size={14} />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* OPEN STATE MODAL */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="bg-[#FFFDF5] border-4 border-black rounded-3xl shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden pointer-events-auto transition-all duration-300 w-[92vw] md:w-[420px] h-[600px] max-h-[85vh] relative"
          >
            
            {/* Header */}
            <div className={`p-4 border-b-4 border-black flex justify-between items-center ${PERSONAS[activePersona].color} transition-colors duration-300`}>
              <div className="flex items-center gap-3">
                <button onClick={() => setShowHistory(!showHistory)} className="bg-white p-2 rounded-full border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 active:scale-95 transition-all">
                  <History size={20} />
                </button>
                <div>
                  <h3 className="font-black text-xl leading-none flex items-center gap-2 text-black">
                    {PERSONAS[activePersona].name}
                  </h3>
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-[10px] font-black uppercase border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] bg-white text-black">
                    <div className={`w-2 h-2 rounded-full ${connectionState === 'ready' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    {statusLabel}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => setIsOpen(false)} className="p-2 bg-red-500 text-white rounded-full border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-red-600">
                  <X size={20} strokeWidth={3}/>
                </button>
              </div>
            </div>

            {/* Persona Tabs */}
            <div className="flex bg-white border-b-4 border-black overflow-x-auto scrollbar-hide shrink-0">
              {(Object.keys(PERSONAS) as PersonaId[]).map((pKey) => {
                const p = PERSONAS[pKey];
                const isActive = activePersona === pKey;
                return (
                  <button 
                    key={pKey} onClick={() => handlePersonaChange(pKey)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 font-black text-sm transition-colors border-r-4 border-black last:border-r-0 whitespace-nowrap
                    ${isActive ? `${p.color} border-b-4 border-b-black shadow-inner text-black` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  >
                    {p.icon} <span className="hidden sm:inline">{p.name}</span>
                  </button>
                )
              })}
            </div>

            {/* Main Chat Body & Sidebar Container */}
            <div className="flex-1 relative flex overflow-hidden bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
              
              {/* History Sidebar */}
              <AnimatePresence>
                {showHistory && (
                  <motion.div 
                    initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: "tween", duration: 0.2 }}
                    className="absolute inset-y-0 left-0 w-64 bg-white border-r-4 border-black z-20 flex flex-col shadow-[4px_0px_0px_0px_rgba(0,0,0,1)]"
                  >
                    <div className="p-4 border-b-4 border-black flex justify-between items-center bg-gray-100 shrink-0">
                       <h3 className="font-black text-lg text-black">Chats</h3>
                       <button onClick={createNewSession} className="p-1 bg-[#FFD700] text-black rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none"><Plus size={18}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                       {sessions.map(s => (
                         <div key={s.id} onClick={() => { setCurrentSessionId(s.id); setShowHistory(false); }} className={`p-3 rounded-xl border-2 border-black cursor-pointer group flex justify-between items-center transition-colors ${currentSessionId === s.id ? 'bg-yellow-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'bg-white hover:bg-gray-50'}`}>
                           <div className="truncate pr-2 font-bold text-sm text-black">{s.title}</div>
                           <button onClick={(e) => deleteSession(s.id, e)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                         </div>
                       ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Message List */}
              <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
                <AnimatePresence initial={false}>
                  {currentMessages.map((msg) => (
                    <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`group max-w-[85%] p-4 rounded-2xl border-4 border-black font-bold text-sm md:text-base shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] 
                        ${msg.sender === 'user' ? 'bg-white text-black rounded-br-none' : `${PERSONAS[activePersona].color} text-black rounded-bl-none`}`}>
                        
                        {msg.imageData && (
                          <div className="mb-3 rounded-xl overflow-hidden border-2 border-black">
                            <img src={msg.imageData} alt="User Upload" className="w-full h-auto max-h-48 object-cover" />
                          </div>
                        )}

                        <div className="whitespace-pre-wrap leading-relaxed">
                           {msg.sender === 'bot' ? renderFormattedText(msg.text) : msg.text}
                        </div>
                        
                        {msg.sender === 'bot' && (
                          <div className="flex gap-2 mt-3 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity border-t-2 border-black/10 pt-2">
                            <button onClick={() => handleCopy(msg.text, msg.id)} className="flex items-center gap-1 text-[10px] uppercase font-black bg-white border-2 border-black px-2 py-1 rounded-lg hover:bg-gray-100 active:scale-95 text-black">
                              {copiedMessageId === msg.id ? <Check size={12} className="text-green-600"/> : <Copy size={12} />} {copiedMessageId === msg.id ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white border-4 border-black p-4 rounded-2xl rounded-bl-none flex gap-2 items-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                      <span className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-3 h-3 bg-black rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} className="h-2" />
              </div>

              {/* Scroll to bottom FAB */}
              <AnimatePresence>
                {showScrollToBottom && (
                  <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} onClick={() => { shouldAutoScrollRef.current = true; scrollToBottom('smooth'); }}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black text-white border-2 border-black rounded-full p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-10 hover:bg-gray-800"
                  >
                    <ChevronDown size={20} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Input Area */}
            <div className="border-t-4 border-black bg-white shrink-0">
              
              {/* Quick Actions (Scrollable) */}
              <div className="px-4 py-3 bg-gray-50 border-b-2 border-black">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide items-center">
                  <Sparkles size={14} className="text-[#FFD700] fill-[#FFD700] shrink-0" />
                  {QUICK_ACTIONS.map((action) => (
                    <button key={action.label} onClick={() => handleSendText(action.text)} disabled={isTyping || !hasApiKey}
                      className="whitespace-nowrap bg-white text-black border-2 border-black px-3 py-1.5 rounded-full text-xs font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:shadow-none hover:bg-yellow-50 transition-all disabled:opacity-50"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error Banner */}
              {errorBanner && (
                <div className="mx-4 mt-3 bg-red-100 border-2 border-black px-4 py-2 rounded-xl text-sm font-bold flex justify-between items-center text-red-800">
                  {errorBanner} <button onClick={()=>setErrorBanner(null)}><X size={16}/></button>
                </div>
              )}

              {/* Image Preview Area */}
              {attachedImage && (
                <div className="mx-4 mt-3 relative inline-block">
                  <img src={attachedImage} className="h-16 w-16 object-cover rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" alt="Attached" />
                  <button onClick={() => setAttachedImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 border-2 border-black hover:bg-red-600"><X size={12}/></button>
                </div>
              )}

              {/* Main Input Box */}
              <div className="p-4 flex gap-2 items-end">
                <div className="flex-1 bg-gray-100 border-4 border-black rounded-2xl focus-within:bg-yellow-50 focus-within:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all flex flex-col p-1">
                  
                  <textarea
                    ref={inputRef as any}
                    value={input}
                    onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_CHARS))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendText(input);
                      }
                    }}
                    placeholder={`Message ${PERSONAS[activePersona].name}...`}
                    className="w-full bg-transparent px-3 py-2 font-bold text-black focus:outline-none resize-none min-h-[44px] max-h-[120px] scrollbar-hide"
                    rows={input.split('\n').length > 1 ? Math.min(input.split('\n').length, 4) : 1}
                  />
                  
                  {/* Tools Row (Inside Input) */}
                  <div className="flex justify-between items-center px-2 pb-1 border-t-2 border-transparent mt-1">
                     <div className="flex gap-2">
                        <button onClick={() => fileInputRef.current?.click()} className="text-gray-500 hover:text-black p-1.5 rounded-lg hover:bg-gray-200 transition-colors tooltip" title="Attach Image">
                           <ImageIcon size={20} />
                           <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload}/>
                        </button>
                        
                        <button onClick={toggleVoiceDictation} className={`p-1.5 rounded-lg transition-colors ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-gray-500 hover:text-black hover:bg-gray-200'}`} title="Voice Typing">
                           {isListening ? <Mic size={20} /> : <MicOff size={20} />}
                        </button>
                     </div>
                     <span className={`text-[10px] font-black ${input.length > MAX_INPUT_CHARS * 0.9 ? 'text-red-500' : 'text-gray-400'}`}>
                        {input.length}/{MAX_INPUT_CHARS}
                     </span>
                  </div>

                </div>

                {/* Send/Stop Button */}
                {!isTyping ? (
                  <button onClick={() => handleSendText(input)} disabled={isSendDisabled}
                    className="bg-black text-white h-[60px] w-[60px] rounded-2xl flex items-center justify-center border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-800 disabled:opacity-50 disabled:shadow-none disabled:translate-y-1 transition-all shrink-0"
                  >
                    <Send size={24} className="ml-1" />
                  </button>
                ) : (
                  <button onClick={() => { abortRef.current?.abort(); setIsTyping(false); }}
                    className="bg-red-500 text-white h-[60px] w-[60px] rounded-2xl flex items-center justify-center border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-red-600 transition-all shrink-0"
                  >
                    <StopCircle size={24} />
                  </button>
                )}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
