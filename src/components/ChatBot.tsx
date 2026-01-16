import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot } from 'lucide-react';
import { NeoButton } from './ui/NeoButton';

const API_KEY = "YOUR_GEMINI_API_KEY_HERE";

type Message = {
  id: number;
  text: string;
  sender: 'user' | 'bot';
};

export const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeModel, setActiveModel] = useState("gemini-pro"); 
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, text: "Namaste! 🙏 Main OneMeal AI hu. Kaise madad karu? (Recipes ya Donation?)", sender: 'bot' }
  ]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchModel = async () => {
        if (!API_KEY) {
            console.error("API Key is missing! Check .env file.");
            return;
        }
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
            const data = await res.json();
            
            const validModel = data.models?.find((m: any) => 
                m.supportedGenerationMethods?.includes("generateContent") && 
                !m.name.includes("vision")
            );

            if (validModel) {
                const cleanName = validModel.name.replace("models/", "");
                console.log("✅ Connected to Model:", cleanName);
                setActiveModel(cleanName);
            }
        } catch (e) {
            console.error("Model check failed, using default.");
        }
    };
    fetchModel();
  }, []); 

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, isOpen]);

  const callGeminiAI = async (userText: string) => {
    try {
        const systemPrompt = `You are a helpful assistant for 'OneMeal'. 
        User said: "${userText}". 
        Rules: Keep answers short (max 2 sentences). Use Hinglish + Emojis.`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] })
            }
        );

        const data = await response.json();
        
        if (!response.ok) {
            console.error("Gemini API Error:", data);
            if(data.error?.code === 429) return "Quota khatam! 1 min ruko. ⏳";
            return "Server issue. Try again later! 😅";
        }

        if (data.candidates && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        } else {
            return "Samajh nahi aaya. Phir se bolo? 🤔";
        }

    } catch (error) {
        console.error("AI Error:", error);
        return "Oops! Net check karo? 🥶";
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = { id: Date.now(), text: input, sender: 'user' };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const botReply = await callGeminiAI(userMsg.text);

    const botMsg: Message = { id: Date.now() + 1, text: botReply, sender: 'bot' };
    setMessages(prev => [...prev, botMsg]);
    setIsTyping(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsOpen(true)}
            className="bg-primary text-dark border-4 border-dark p-4 rounded-full shadow-neo flex items-center gap-2"
          >
            <Bot size={32} />
            <span className="font-black hidden md:inline">Ask AI</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="bg-white border-4 border-dark rounded-2xl shadow-neo w-[90vw] md:w-96 h-[500px] flex flex-col overflow-hidden"
          >
            <div className="bg-primary p-4 border-b-4 border-dark flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="bg-white p-1 rounded-full border-2 border-dark">
                  <Bot size={20} />
                </div>
                <h3 className="font-black text-lg">OneMeal AI</h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="hover:bg-red-400 p-1 rounded transition-colors border-2 border-transparent hover:border-dark">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-yellow-50 scroll-smooth">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`
                    max-w-[80%] p-3 rounded-xl border-2 border-dark font-bold text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                    ${msg.sender === 'user' ? 'bg-white text-dark rounded-br-none' : 'bg-white text-dark rounded-bl-none'}
                  `}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-gray-200 border-2 border-dark p-3 rounded-xl rounded-bl-none flex gap-1 items-center">
                    <span className="w-2 h-2 bg-dark rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-dark rounded-full animate-bounce delay-75"></span>
                    <span className="w-2 h-2 bg-dark rounded-full animate-bounce delay-150"></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t-4 border-dark bg-white flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Pucho kuch bhi..."
                className="flex-1 bg-gray-100 border-2 border-dark rounded-xl px-3 font-bold focus:outline-none focus:bg-yellow-50 transition-colors"
              />
              <NeoButton onClick={handleSend} className="px-3">
                <Send size={20} />
              </NeoButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};