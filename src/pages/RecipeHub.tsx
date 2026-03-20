import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChefHat, Loader, Home, Lightbulb, X, Clock, Flame, Utensils, 
  ArrowRight, Activity, 
  Plus, Volume2, VolumeX, Play, Bookmark, BookmarkCheck,
  ChevronRight, ChevronLeft, HelpCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { generateJson, generateText, isGeminiConfigured, type GeminiResponseSchema } from '../lib/aiClient';
import recipeImage1 from '../assets/img21.png';
import recipeImage2 from '../assets/img22.png';

const FOOD_FACTS = [
  "🍯 Honey kabhi kharab nahi hota. 3000 saal purana honey bhi kha sakte ho!",
  "🍓 Strawberries berry nahi hai, par Kela (Banana) ek berry hai! Shocking?",
  "🥕 Pehle Gajar (Carrots) purple color ke hote the, orange nahi.",
  "🍫 Ek zamane mein Chocolate ko 'paisa' (currency) maana jaata tha.",
  "🍎 Apple pani mein float karta hai kyunki wo 25% hawa hai.",
  "🇮🇳 India sabse zyada Milk produce karta hai puri duniya mein!",
  "🥒 Kheera (Cucumber) mein 96% pani hota hai. Garmi mein best!",
  "🌶️ Duniya ki sabse teekhi mirch 'Carolina Reaper' hai. Dhyan se!",
  "🧀 White chocolate asal mein chocolate nahi hoti, isme cocoa solid nahi hota.",
  "🥜 Peanuts nuts nahi hain, wo legumes (phaliyan) hain, jaise matar!",
  "🥑 Avocado ek fruit hai, sabzi nahi. Aur ye single-seeded berry hai.",
  "🍅 Tamatar (Tomato) legally ek vegetable hai, par botanically ek fruit!",
  "🥔 Aloo (Potato) space mein ugaya jane wala sabse pehla food tha (1995).",
  "🍿 Peanut butter se diamond banaya ja sakta hai extreme pressure ke under!",
  "🍋 Nimbu (Lemon) mein strawberry se zyada sugar hoti hai!"
];

const LOADING_JOKES = [
  "👨‍🍳 Chef sabzi kaat raha hai...",
  "🔥 Tawa garam ho raha hai...",
  "🧂 Namak shamak daal rahe hai...",
  "🤔 Soch raha hu kya banau...",
  "🍛 Masala koot raha hu...",
  "🥬 Dhaniya dhoond raha hu (mil nahi raha)...",
  "📞 Mummy se recipe confirm kar raha hu...",
  "🧅 Pyaaz kaat ke ro raha hu...",
  "🧄 Lehsun chheelne mein time lagta hai boss...",
  "🛵 Swiggy wale bhaiya ko raste mein rok raha hu...",
  "🥛 Doodh ubalne ka wait kar raha hu...",
  "🧊 Fridge mein baraf check kar raha hu..."
];

const PANTRY_SUGGESTIONS = [
  "Aloo (Potato)", "Pyaaz (Onion)", "Tamatar (Tomato)", "Paneer", "Rice", 
  "Dal", "Eggs", "Chicken", "Besan", "Atta", "Bread", "Milk", 
  "Cheese", "Butter", "Green Chilies", "Coriander", "Garlic", "Ginger"
];

const RECIPE_SEED_KEY = 'onemeal_recipe_seed';
const RECIPE_DISPLAY_IMAGES = [recipeImage1, recipeImage2];

interface Recipe {
  id?: string;
  title: string;
  time: string;
  calories: string;
  tags: string[];
  ingredients: string[];
  instructions: string[];
  macros?: { protein: string, carbs: string, fat: string };
  isSaved?: boolean;
  image?: string;
}

const RECIPE_MACRO_SCHEMA: GeminiResponseSchema = {
  type: 'OBJECT',
  properties: {
    protein: { type: 'STRING' },
    carbs: { type: 'STRING' },
    fat: { type: 'STRING' },
  },
  required: ['protein', 'carbs', 'fat'],
};

const RECIPE_RESPONSE_SCHEMA: GeminiResponseSchema = {
  type: 'OBJECT',
  properties: {
    recipes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          time: { type: 'STRING' },
          calories: { type: 'STRING' },
          tags: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
          ingredients: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
          instructions: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
          macros: RECIPE_MACRO_SCHEMA,
        },
        required: ['title', 'time', 'calories', 'tags', 'ingredients', 'instructions', 'macros'],
      },
    },
  },
  required: ['recipes'],
};

const NeoButton = ({ children, onClick, className = "", disabled = false, variant = 'primary' }: any) => {
  const base = "font-black transition-all active:translate-y-1 active:shadow-none disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-black text-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-800 rounded-2xl px-6 py-3",
    secondary: "bg-white text-black border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 rounded-2xl px-6 py-3",
    danger: "bg-red-500 text-white border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-red-600 rounded-2xl px-6 py-3",
    accent: "bg-[#FFD700] text-black border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-400 rounded-2xl px-6 py-3"
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant as keyof typeof variants]} ${className}`}>
      {children}
    </button>
  );
};

const Badge = ({ children, color = "bg-yellow-200" }: { children: React.ReactNode, color?: string }) => (
  <span className={`${color} border-2 border-black px-3 py-1 rounded-xl text-sm font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]`}>
    {children}
  </span>
);

const RecipeHub = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'diet' | 'pantry' | 'tips' | 'saved'>('search');
  const [inputValue, setInputValue] = useState('');
  const [recipes, setRecipes] = useState<Recipe[]>([]); 
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [currentFact, setCurrentFact] = useState(0);
  
  // Recipe Modal State
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [servingsMultiplier, setServingsMultiplier] = useState(1);
  const [isCookingMode, setIsCookingMode] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  
  // TTS State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synth = window.speechSynthesis;

  // Saved Recipes & Pantry State
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>([]);
  const [pantry, setPantry] = useState<string[]>([]);
  const [nuskhaResult, setNuskhaResult] = useState<string>("");
  const hasAi = isGeminiConfigured('recipe');

  // --- INITIALIZATION ---
  useEffect(() => {
    const interval = setInterval(() => setCurrentFact((p) => (p + 1) % FOOD_FACTS.length), 6000);
    
    // Load local storage data
    const localSaved = localStorage.getItem('saved_recipes_v2');
    if (localSaved) setSavedRecipes(JSON.parse(localSaved));
    
    const localPantry = localStorage.getItem('my_pantry_v2');
    if (localPantry) setPantry(JSON.parse(localPantry));

    const recipeSeed = localStorage.getItem(RECIPE_SEED_KEY);
    if (recipeSeed) {
      setInputValue(recipeSeed);
      localStorage.removeItem(RECIPE_SEED_KEY);
    }

    return () => clearInterval(interval);
  }, []);

  // --- LOADING ANIMATOR ---
  useEffect(() => {
    let interval: any;
    if (loading) {
        let i = 0;
        setStatusMsg(LOADING_JOKES[0]);
        interval = setInterval(() => {
            i++;
            setStatusMsg(LOADING_JOKES[i % LOADING_JOKES.length]);
        }, 1800);
    }
    return () => clearInterval(interval);
  }, [loading]);

  // --- STORAGE HANDLERS ---
  const handleSaveRecipe = (recipe: Recipe) => {
    const exists = savedRecipes.find(r => r.title === recipe.title);
    if (exists) {
      const updated = savedRecipes.filter(r => r.title !== recipe.title);
      setSavedRecipes(updated);
      localStorage.setItem('saved_recipes_v2', JSON.stringify(updated));
      toast("Recipe removed from saved! 🗑️", { icon: '🗑️' });
    } else {
      const newRecipe = { ...recipe, id: Date.now().toString(), isSaved: true };
      const updated = [...savedRecipes, newRecipe];
      setSavedRecipes(updated);
      localStorage.setItem('saved_recipes_v2', JSON.stringify(updated));
      toast.success("Recipe saved successfully! 💖");
    }
  };

  const addToPantry = (item: string) => {
    if (!item.trim() || pantry.includes(item.trim())) return;
    const newPantry = [...pantry, item.trim()];
    setPantry(newPantry);
    localStorage.setItem('my_pantry_v2', JSON.stringify(newPantry));
    setInputValue('');
  };

  const removeFromPantry = (item: string) => {
    const newPantry = pantry.filter(i => i !== item);
    setPantry(newPantry);
    localStorage.setItem('my_pantry_v2', JSON.stringify(newPantry));
  };

  // --- TTS HANDLER ---
  const toggleSpeech = (text: string) => {
    if (isSpeaking) {
      synth.cancel();
      setIsSpeaking(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'hi-IN'; // Try Hindi accent for Indian recipes
      utterance.onend = () => setIsSpeaking(false);
      synth.speak(utterance);
      setIsSpeaking(true);
    }
  };

  // Stop speech if modal closes
  useEffect(() => {
    if (!selectedRecipe) {
      synth.cancel();
      setIsSpeaking(false);
      setIsCookingMode(false);
      setCurrentStepIndex(0);
      setServingsMultiplier(1);
    }
  }, [selectedRecipe]);

  /*
  // --- CORE AI LOGIC (BULLETPROOF PARSER) ---
  const extractJSON = (rawText: string, fallbackIngredients: string): Recipe[] => {
    console.log("Raw AI Output:", rawText); 
    
    let cleanText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();
    cleanText = cleanText.replace(/,\s*([\]}])/g, '$1'); // Fix trailing commas

    try {
      const startArr = cleanText.indexOf('[');
      const endArr = cleanText.lastIndexOf(']');
      if (startArr !== -1 && endArr !== -1) {
        const parsed = JSON.parse(cleanText.substring(startArr, endArr + 1));
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      
      const startObj = cleanText.indexOf('{');
      const endObj = cleanText.lastIndexOf('}');
      if (startObj !== -1 && endObj !== -1) {
        const parsed = JSON.parse(cleanText.substring(startObj, endObj + 1));
        if (parsed.recipes) return parsed.recipes;
        return [parsed];
      }
    } catch (e) {
      console.warn("AI formatting error. Generating smart fallback.");
    }

    // Emergency Smart Fallback
    const items = fallbackIngredients.split(',').map(i => i.trim());
    return [{
      title: "Desi " + (items[0] || "Special") + " Bowl",
      time: "25 mins",
      calories: "320 kcal",
      tags: ["🔥 Chef's Special", "⏱️ Quick"],
      ingredients: items.length > 0 && items[0] !== "" ? items : ["Mixed Veggies", "Spices", "Oil"],
      instructions: [
        "Chop all ingredients finely.", 
        "Heat oil in a kadhai and add jeera.", 
        "Sauté the ingredients with salt, turmeric, and chili powder.", 
        "Cook on low heat for 15 mins until tender.", 
        "Garnish with fresh coriander and serve hot!"
      ],
      macros: { protein: "12g", carbs: "45g", fat: "10g" }
    }];
  };

  const getWorkingModel = async () => {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
      const data = await res.json();
      if (!res.ok) throw new Error('Could not fetch models');

      const valid = (data.models || []).filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'));
      const preferred = ['models/gemini-1.5-flash-8b', 'models/gemini-1.5-flash', 'models/gemini-1.0-pro', 'models/gemini-pro'];
      const chosen = preferred.find((name) => valid.some((m: any) => m.name === name));

      return chosen ? chosen.replace('models/', '') : 'gemini-1.0-pro';
    } catch (e) {
      return 'gemini-1.0-pro'; 
    }
  };

  const callAI = async (promptText: string, isJson: boolean = true) => {
    const modelName = await getWorkingModel();
    const isModern = modelName.includes('1.5');
    
    const generationConfig: any = { temperature: 0.3, maxOutputTokens: 1200 };
    if (isJson && isModern) {
      generationConfig.response_mime_type = "application/json";
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig 
        })
      }
    );

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.candidates || data.candidates.length === 0) throw new Error("Safety filter blocked output.");
    
    return data.candidates[0].content.parts[0].text;
  };

  */

  const createFallbackRecipes = (fallbackIngredients: string): Recipe[] => {
    const items = fallbackIngredients.split(',').map((item) => item.trim()).filter(Boolean);
    return [{
      title: `Desi ${items[0] || 'Special'} Bowl`,
      time: '25 mins',
      calories: '320 kcal',
      tags: ["Chef's Special", 'Quick'],
      ingredients: items.length > 0 ? items : ['Mixed Veggies', 'Spices', 'Oil'],
      instructions: [
        'Chop all ingredients finely.',
        'Heat oil in a kadhai and add jeera.',
        'Saute the ingredients with salt, turmeric, and chili powder.',
        'Cook on low heat for 15 mins until tender.',
        'Garnish with fresh coriander and serve hot.',
      ],
      macros: { protein: '12g', carbs: '45g', fat: '10g' },
    }];
  };

  const normalizeStringArray = (value: unknown, fallback: string[]) => {
    if (!Array.isArray(value)) return fallback;
    const normalized = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
    return normalized.length ? normalized : fallback;
  };

  const normalizeRecipeItem = (value: unknown, fallbackIngredients: string, index: number): Recipe | null => {
    if (!value || typeof value !== 'object') return null;

    const item = value as Partial<Recipe>;
    const fallbackRecipe = createFallbackRecipes(fallbackIngredients)[0];

    return {
      title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : `Recipe ${index + 1}`,
      time: typeof item.time === 'string' && item.time.trim() ? item.time.trim() : '25 mins',
      calories: typeof item.calories === 'string' && item.calories.trim() ? item.calories.trim() : '320 kcal',
      tags: normalizeStringArray(item.tags, ['Home Style', 'Easy']),
      ingredients: normalizeStringArray(item.ingredients, fallbackRecipe.ingredients),
      instructions: normalizeStringArray(item.instructions, fallbackRecipe.instructions),
      macros: {
        protein: typeof item.macros?.protein === 'string' && item.macros.protein.trim() ? item.macros.protein.trim() : '12g',
        carbs: typeof item.macros?.carbs === 'string' && item.macros.carbs.trim() ? item.macros.carbs.trim() : '45g',
        fat: typeof item.macros?.fat === 'string' && item.macros.fat.trim() ? item.macros.fat.trim() : '10g',
      },
    };
  };

  const normalizeRecipes = (payload: unknown, fallbackIngredients: string): Recipe[] => {
    const rawItems = Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object' && Array.isArray((payload as { recipes?: unknown[] }).recipes)
        ? (payload as { recipes?: unknown[] }).recipes || []
        : payload && typeof payload === 'object'
          ? [payload]
          : [];

    const normalized = rawItems
      .map((item, index) => normalizeRecipeItem(item, fallbackIngredients, index))
      .filter((item): item is Recipe => Boolean(item));

    return normalized.length ? normalized : createFallbackRecipes(fallbackIngredients);
  };

  const getRecipeErrorMessage = (message?: string) => {
    const errorMsg = message?.toLowerCase() || '';
    if (errorMsg.includes('quota') || errorMsg.includes('limit') || errorMsg.includes('exhausted') || errorMsg.includes('429')) {
      return 'Free tier limit hit. Wait a few seconds and try again.';
    }
    if (errorMsg.includes('api key') || errorMsg.includes('permission') || errorMsg.includes('403')) {
      return 'Gemini setup issue. Check VITE_GEMINI_API_KEY_RECIPE_HUB or VITE_GEMINI_API_KEY in .env and restart the app.';
    }
    if (errorMsg.includes('blocked')) {
      return 'Safety filter blocked the response. Try a simpler prompt.';
    }
    if (errorMsg.includes('json') || errorMsg.includes('unexpected')) {
      return 'AI sent a bad recipe format. Please try again.';
    }
    return message || 'Recipe generation failed.';
  };

  const handleGenerate = async () => {
    // Validation
    if (activeTab === 'search' || activeTab === 'diet') {
      if (!inputValue.trim()) return toast.error("Arre bhai, kuch likho toh sahi! ✍️");
    } else if (activeTab === 'pantry') {
      if (pantry.length === 0) return toast.error("Pantry is empty! Add ingredients first. 🛒");
    } else if (activeTab === 'tips') {
      if (!inputValue.trim()) return toast.error("Apni problem batao pehle! 🤔");
    }

    if (!hasAi) {
      return toast.error('Recipe AI needs VITE_GEMINI_API_KEY_RECIPE_HUB or VITE_GEMINI_API_KEY in .env.');
    }

    const fallbackSource = activeTab === 'pantry' ? pantry.join(', ') : inputValue;

    setLoading(true);
    setRecipes([]); 
    setNuskhaResult("");
    
    try {
      let prompt = "";
      
      // BUILD PROMPTS BASED ON TAB
      if (activeTab === 'search') {
        prompt = `You are a master Chef. Generate 2 Indian recipes using: ${inputValue}.
        Return ONLY a JSON array. Include an emoji in each tag. Include estimated macros.
        Format exactly like this example:
        [{"title": "Masala Aloo", "time": "20 mins", "calories": "250 kcal", "tags": ["⏱️ Quick", "🌶️ Spicy"], "ingredients": ["Aloo", "Oil"], "instructions": ["Chop", "Fry"], "macros": {"protein": "5g", "carbs": "30g", "fat": "10g"}}]`;
      } 
      else if (activeTab === 'diet') {
        prompt = `You are a fitness nutritionist. Generate 2 healthy meals for: ${inputValue}.
        Return ONLY a JSON array. Include an emoji in each tag. Include exact macros.
        Format exactly like this example:
        [{"title": "Protein Chilla", "time": "15 mins", "calories": "200 kcal", "tags": ["🥗 Diet", "💪 High Protein"], "ingredients": ["Besan", "Paneer"], "instructions": ["Mix", "Cook"], "macros": {"protein": "15g", "carbs": "20g", "fat": "5g"}}]`;
      }
      else if (activeTab === 'pantry') {
        prompt = `You are a survival chef. I ONLY have these ingredients in my kitchen: ${pantry.join(', ')}.
        Invent 2 creative recipes using ONLY these items (plus basic salt/water/oil).
        Return ONLY a JSON array. 
        Format exactly like this example:
        [{"title": "Pantry Special Bowl", "time": "30 mins", "calories": "350 kcal", "tags": ["🥫 Pantry Cleanout", "💡 Creative"], "ingredients": ["Item 1", "Item 2"], "instructions": ["Step 1", "Step 2"], "macros": {"protein": "10g", "carbs": "40g", "fat": "8g"}}]`;
      }
      else if (activeTab === 'tips') {
        prompt = `Act as an expert Indian Dadi (Grandmother). The user has this kitchen problem: "${inputValue}".
        Give a clever, practical, old-school home remedy or cooking hack to fix it. 
        Write it in a friendly, conversational Hinglish (Hindi + English) tone. Maximum 3 paragraphs. DO NOT output JSON.`;
      }

      if (activeTab === 'search') {
        prompt = [
          'Create 2 Indian recipes using these ingredients or leftovers.',
          `Ingredients: ${inputValue}`,
          'Return JSON only.',
          'Each recipe must include title, time, calories, tags, ingredients, instructions, and macros.',
          'Keep the dishes practical for a home kitchen.',
        ].join('\n');
      } else if (activeTab === 'diet') {
        prompt = [
          'Create 2 healthy Indian meal ideas for this goal or preference.',
          `Need: ${inputValue}`,
          'Return JSON only.',
          'Each recipe must include title, time, calories, tags, ingredients, instructions, and macros.',
          'Prefer balanced, protein-aware meals.',
        ].join('\n');
      } else if (activeTab === 'pantry') {
        prompt = [
          'Create 2 recipes using only the listed pantry items plus basic salt, water, and oil.',
          `Pantry items: ${pantry.join(', ')}`,
          'Return JSON only.',
          'Each recipe must include title, time, calories, tags, ingredients, instructions, and macros.',
          'Do not introduce extra ingredients beyond the pantry list.',
        ].join('\n');
      }

      if (activeTab === 'tips') {
        const reply = await generateText({ prompt, maxOutputTokens: 500, temperature: 0.5, feature: 'recipe' });
        setNuskhaResult(reply);
        toast.success("Dadi ne nuskha bata diya! 👵");
      } else {
        const payload = await generateJson<Recipe[] | { recipes?: Recipe[] } | Recipe>({
          prompt,
          maxOutputTokens: 1400,
          temperature: 0.3,
          schema: RECIPE_RESPONSE_SCHEMA,
          systemInstruction: 'You are a helpful Indian chef. Return valid JSON only as an object with key "recipes". Each recipe must include the requested fields.',
          feature: 'recipe',
        });
        setRecipes(normalizeRecipes(payload, fallbackSource));
        toast.success("Lo ji, khana taiyaar! 🥘");
      }

    } catch (error: any) {
      console.error(error);
      setStatusMsg("❌ Chef is busy. Phir se try karo.");
      if (activeTab === 'tips') {
        setNuskhaResult('');
      } else {
        setRecipes(createFallbackRecipes(fallbackSource));
      }
      toast.error(getRecipeErrorMessage(error?.message));
    } finally {
      setLoading(false);
    }
  };

  const getRecipeImage = useCallback((index: number) => {
    return RECIPE_DISPLAY_IMAGES[index % RECIPE_DISPLAY_IMAGES.length];
  }, []);

  // ==========================================
  // 🎨 RENDERERS (UI Components)
  // ==========================================
  const renderTabs = () => (
    <div className="flex flex-wrap justify-center gap-3 mb-10 w-full max-w-4xl mx-auto">
      {[
        { id: 'search', label: '🥕 Jugaad Search' },
        { id: 'diet', label: '🩺 Diet Plan' },
        { id: 'pantry', label: '🥫 My Pantry' },
        { id: 'tips', label: '👵 Dadi Tips' },
        { id: 'saved', label: `💖 Saved (${savedRecipes.length})` }
      ].map(tab => (
        <button 
          key={tab.id}
          onClick={() => {
            setActiveTab(tab.id as any); 
            setRecipes([]); 
            setNuskhaResult('');
          }} 
          className={`px-5 py-2.5 font-black text-sm md:text-base border-4 border-black rounded-2xl transition-all flex items-center gap-2 
          ${activeTab === tab.id ? 'bg-[#FFD700] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -translate-y-1' : 'bg-white hover:bg-gray-50 hover:-translate-y-0.5'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const renderInputArea = () => {
    if (activeTab === 'saved') return null;
    if (activeTab === 'pantry') return renderPantryArea();

    let title = "Fridge mein kya pada hai?";
    let placeholder = "e.g. 2 Aloo, 1 Pyaaz, Basi Rice...";
    let btnText = "Jadoo Dikhao ✨";

    if (activeTab === 'diet') {
      title = "Fitness Goal kya hai boss?";
      placeholder = "e.g. Weight Loss, 150g Protein...";
      btnText = "Plan Banao 📝";
    } else if (activeTab === 'tips') {
      title = "Kitchen mein kya gadbad hui?";
      placeholder = "e.g. Dal mein namak zyada ho gaya...";
      btnText = "Dadi se Pucho 👵";
    }

    return (
      <div className="max-w-4xl mx-auto text-center mb-12 relative z-10">
        <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight">{title}</h2>
        <div className="bg-white p-2 border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col md:flex-row gap-2 max-w-3xl mx-auto focus-within:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] transition-shadow duration-300">
          <input 
            type="text" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent p-4 md:p-5 font-bold text-xl outline-none placeholder:text-gray-400"
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          />
          <NeoButton onClick={handleGenerate} disabled={loading || !hasAi} className="min-w-[200px]">
            {loading ? <Loader className="animate-spin" /> : btnText}
          </NeoButton>
        </div>
        {!hasAi && (
          <p className="mt-4 text-sm font-black text-red-600">
            Add VITE_GEMINI_API_KEY_RECIPE_HUB or VITE_GEMINI_API_KEY in .env and restart the app to enable Recipe AI.
          </p>
        )}
      </div>
    );
  };

  const renderPantryArea = () => (
    <div className="max-w-4xl mx-auto mb-12 relative z-10 bg-white border-4 border-black rounded-3xl p-6 md:p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
      <h2 className="text-3xl font-black mb-2 flex items-center gap-2"><Utensils/> Virtual Pantry</h2>
      <p className="font-bold text-gray-500 mb-6">Add what you have, we'll tell you what to make!</p>
      
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="flex-1 flex gap-2 border-4 border-black rounded-2xl p-1 bg-gray-50 focus-within:bg-white transition-colors">
          <input 
            type="text" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="e.g. Tomato, Chicken, Maggi..."
            className="flex-1 bg-transparent p-3 font-bold text-lg outline-none"
            onKeyDown={(e) => e.key === 'Enter' && addToPantry(inputValue)}
          />
          <button onClick={() => addToPantry(inputValue)} className="bg-[#FFD700] text-black px-4 font-black border-2 border-black rounded-xl hover:bg-yellow-400 transition-colors">
            <Plus strokeWidth={3}/>
          </button>
        </div>
        <NeoButton onClick={handleGenerate} disabled={loading || pantry.length === 0 || !hasAi} className="w-full md:w-auto">
           {loading ? <Loader className="animate-spin" /> : 'Cook from Pantry 🍳'}
        </NeoButton>
      </div>
      {!hasAi && (
        <p className="mb-4 text-sm font-black text-red-600">
          Add VITE_GEMINI_API_KEY_RECIPE_HUB or VITE_GEMINI_API_KEY in .env and restart the app to enable pantry recipes.
        </p>
      )}

      <div className="mb-4">
        <h4 className="font-black text-sm text-gray-400 uppercase tracking-widest mb-3">Quick Add</h4>
        <div className="flex gap-2 flex-wrap">
          {PANTRY_SUGGESTIONS.map(item => (
             <button key={item} onClick={() => addToPantry(item)} className="text-xs font-black bg-gray-100 hover:bg-gray-200 border-2 border-black px-3 py-1.5 rounded-lg active:scale-95 transition-transform">
               + {item}
             </button>
          ))}
        </div>
      </div>

      <div className="border-t-4 border-black border-dashed pt-6 mt-4">
        <h4 className="font-black text-lg mb-4">Your Items ({pantry.length})</h4>
        {pantry.length === 0 ? (
          <div className="text-center p-8 bg-gray-50 border-4 border-black rounded-2xl border-dashed">
            <span className="text-4xl block mb-2">🕸️</span>
            <p className="font-black text-gray-400">Pantry is looking a bit empty!</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <AnimatePresence>
              {pantry.map(item => (
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                  key={item} 
                  className="bg-green-200 border-4 border-black font-black px-4 py-2 rounded-xl flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  {item}
                  <button onClick={() => removeFromPantry(item)} className="bg-red-500 text-white rounded-full p-1 hover:bg-red-600 border-2 border-black">
                    <X size={14} strokeWidth={3} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );

  const renderRecipeGrid = (listToRender: Recipe[]) => (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10 pb-20">
      <AnimatePresence>
        {listToRender.map((recipe, index) => {
          const isSaved = savedRecipes.some(r => r.title === recipe.title);
          const recipeImage = recipe.image || getRecipeImage(index);
          return (
          <motion.div 
            key={index + recipe.title}
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
            transition={{ delay: index * 0.1, type: "spring", stiffness: 100 }}
            className="bg-white border-4 border-black rounded-[2rem] overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col group relative"
          >
            {/* Save Bookmark Button */}
            <button 
              onClick={(e) => { e.stopPropagation(); handleSaveRecipe(recipe); }}
              className="absolute top-4 left-4 z-20 bg-white border-4 border-black p-2 rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 transition-transform active:scale-90"
            >
              {isSaved ? <BookmarkCheck className="text-green-500 fill-green-500" /> : <Bookmark className="text-gray-400" />}
            </button>

            <div className="h-56 overflow-hidden border-b-4 border-black bg-gray-100 relative cursor-pointer" onClick={() => setSelectedRecipe({ ...recipe, image: recipeImage })}>
              <img 
                src={recipeImage} 
                alt={recipe.title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute top-4 right-4 bg-white border-4 border-black px-3 py-1.5 rounded-full font-black text-sm flex items-center gap-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <Clock size={16} className="text-blue-600"/> {recipe.time || 'Quick'}
              </div>
            </div>

            <div className="p-6 flex flex-col flex-1 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
              <h3 className="text-2xl font-black mb-4 leading-tight cursor-pointer" onClick={() => setSelectedRecipe({ ...recipe, image: recipeImage })}>{recipe.title}</h3>
              
              <div className="flex gap-2 mb-6 flex-wrap">
                {recipe.tags?.slice(0,3).map((tag: string, i: number) => (
                  <Badge key={i} color={i%2===0 ? "bg-yellow-200" : "bg-pink-200"}>{tag}</Badge>
                ))}
              </div>
              
              <div className="flex justify-between items-center mt-auto pt-6 border-t-4 border-black border-dashed">
                <span className="flex items-center gap-2 font-black text-lg bg-orange-100 px-3 py-1 rounded-xl border-2 border-black">
                  <Flame className="text-orange-500 fill-orange-500"/> {recipe.calories || 'N/A'}
                </span>
                <button onClick={() => setSelectedRecipe({ ...recipe, image: recipeImage })} className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center group-hover:bg-[#FFD700] group-hover:text-black border-4 border-black transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <ArrowRight strokeWidth={3} />
                </button>
              </div>
            </div>
          </motion.div>
        )})}
      </AnimatePresence>
    </div>
  );

  const renderRecipeModal = () => {
    if (!selectedRecipe) return null;
    const r = selectedRecipe;
    
    // Scale ingredients
    const parseQty = (item: string) => {
      // Super basic scaling: looks for first number in string and multiplies it
      return item.replace(/(\d+(\.\d+)?)/, (match) => {
         const num = parseFloat(match);
         return (num * servingsMultiplier).toString();
      });
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 bg-black/70 backdrop-blur-md">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 50 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 50 }}
          className="bg-[#FFFDF5] border-4 border-black rounded-[2rem] w-full max-w-4xl max-h-[95vh] overflow-y-auto shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] relative scrollbar-hide flex flex-col"
        >
          {/* Floating Actions */}
          <div className="sticky top-4 right-4 flex justify-end gap-2 z-50 px-4">
             <button 
                onClick={() => setIsCookingMode(!isCookingMode)}
                className={`border-4 border-black rounded-full p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform active:translate-y-1 active:shadow-none ${isCookingMode ? 'bg-blue-400 text-white' : 'bg-white text-black'}`}
                title="Interactive Cooking Mode"
              >
                <Play fill={isCookingMode ? "white" : "transparent"} size={20} />
              </button>
              <button 
                onClick={() => setSelectedRecipe(null)} 
                className="bg-red-500 text-white border-4 border-black rounded-full p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform active:translate-y-1 active:shadow-none"
              >
                <X size={20} strokeWidth={4} />
              </button>
          </div>

          {/* Cooking Mode Overlay inside Modal */}
          {isCookingMode ? (
            <div className="p-8 md:p-12 flex flex-col h-[60vh] justify-center items-center text-center bg-blue-50 rounded-[1.5rem] m-4 border-4 border-black">
              <h3 className="font-black text-gray-400 uppercase tracking-widest mb-4">Step {currentStepIndex + 1} of {r.instructions.length}</h3>
              <p className="text-3xl md:text-5xl font-black leading-tight text-black mb-12">
                {r.instructions[currentStepIndex]}
              </p>
              
              <div className="flex items-center gap-6 mt-auto">
                <NeoButton onClick={() => setCurrentStepIndex(Math.max(0, currentStepIndex - 1))} disabled={currentStepIndex === 0} variant="secondary">
                  <ChevronLeft size={24}/> Prev
                </NeoButton>
                
                <button 
                  onClick={() => toggleSpeech(r.instructions[currentStepIndex])}
                  className={`w-16 h-16 rounded-full border-4 border-black flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none transition-all ${isSpeaking ? 'bg-pink-400 animate-pulse' : 'bg-yellow-400'}`}
                >
                  {isSpeaking ? <Volume2 size={24}/> : <Play size={24} fill="currentColor"/>}
                </button>

                {currentStepIndex < r.instructions.length - 1 ? (
                  <NeoButton onClick={() => setCurrentStepIndex(currentStepIndex + 1)}>
                    Next <ChevronRight size={24}/>
                  </NeoButton>
                ) : (
                  <NeoButton onClick={() => setIsCookingMode(false)} variant="accent">
                    Done! 🎉
                  </NeoButton>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Normal Modal View */}
              <div className="h-64 md:h-80 w-full overflow-hidden border-b-4 border-black relative shrink-0 -mt-16">
                  <img src={r.image || getRecipeImage(0)} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"></div>
                  <div className="absolute bottom-0 left-0 p-6 md:p-8 w-full">
                    <h2 className="text-4xl md:text-5xl font-black text-white leading-tight drop-shadow-lg mb-4">{r.title}</h2>
                    <div className="flex gap-2 flex-wrap">
                      {r.tags?.map((tag: string, i: number) => (
                        <span key={i} className="bg-white text-black border-2 border-black px-3 py-1 rounded-lg text-sm font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">{tag}</span>
                      ))}
                    </div>
                  </div>
              </div>

              <div className="p-6 md:p-8">
                {/* Stats Bar */}
                <div className="flex flex-wrap gap-4 font-black text-lg mb-10 bg-white p-4 md:p-5 rounded-2xl border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] justify-center md:justify-start">
                  <span className="flex items-center gap-2"><Clock className="text-blue-600"/> {r.time}</span>
                  <span className="w-1.5 h-1.5 bg-black rounded-full my-auto hidden sm:block"></span>
                  <span className="flex items-center gap-2"><Flame className="text-orange-600"/> {r.calories || 'N/A'}</span>
                  
                  {/* Servings Scaler */}
                  <span className="w-1.5 h-1.5 bg-black rounded-full my-auto hidden md:block"></span>
                  <div className="flex items-center gap-3 bg-gray-100 px-3 py-1 rounded-xl border-2 border-black ml-auto">
                    <span className="text-sm text-gray-500">Servings:</span>
                    <button onClick={() => setServingsMultiplier(Math.max(1, servingsMultiplier - 1))} className="bg-white border-2 border-black rounded w-8 h-8 flex items-center justify-center hover:bg-gray-200">-</button>
                    <span className="w-4 text-center">{servingsMultiplier}</span>
                    <button onClick={() => setServingsMultiplier(servingsMultiplier + 1)} className="bg-white border-2 border-black rounded w-8 h-8 flex items-center justify-center hover:bg-gray-200">+</button>
                  </div>
                </div>

                {/* Macros Section (If available) */}
                {r.macros && (
                  <div className="mb-10 p-5 bg-purple-100 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <h4 className="font-black flex items-center gap-2 mb-4"><Activity size={20}/> Macros Breakdown</h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                       <div className="bg-white border-2 border-black rounded-xl p-3"><div className="text-sm text-gray-500 font-bold mb-1">Protein</div><div className="font-black text-xl">{r.macros.protein}</div></div>
                       <div className="bg-white border-2 border-black rounded-xl p-3"><div className="text-sm text-gray-500 font-bold mb-1">Carbs</div><div className="font-black text-xl">{r.macros.carbs}</div></div>
                       <div className="bg-white border-2 border-black rounded-xl p-3"><div className="text-sm text-gray-500 font-bold mb-1">Fat</div><div className="font-black text-xl">{r.macros.fat}</div></div>
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-5 gap-10">
                  {/* Ingredients */}
                  <div className="md:col-span-2">
                    <h3 className="text-2xl font-black flex items-center gap-2 mb-6 bg-yellow-200 px-4 py-2 border-4 border-black rounded-xl -rotate-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                      <Utensils size={24} /> Saamagri
                    </h3>
                    <ul className="space-y-3">
                      {r.ingredients?.map((ing: string, i: number) => (
                        <li key={i} className="flex items-center gap-3 font-bold text-lg text-gray-800 bg-white border-2 border-black rounded-xl p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                            <div className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center font-black text-sm shrink-0">{i+1}</div>
                            {parseQty(ing)}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Instructions */}
                  <div className="md:col-span-3">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-2xl font-black items-center gap-2 bg-pink-200 inline-block px-4 py-2 border-4 border-black rounded-xl rotate-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                        <ChefHat size={24} /> Vidhi (Steps)
                      </h3>
                      <button onClick={() => toggleSpeech(r.instructions.join('. '))} className="text-gray-500 hover:text-black flex gap-2 font-bold bg-gray-100 border-2 border-black px-3 py-1.5 rounded-lg">
                        {isSpeaking ? <VolumeX size={20}/> : <Volume2 size={20}/>} {isSpeaking ? 'Stop' : 'Read'}
                      </button>
                    </div>

                    <div className="space-y-6">
                      {r.instructions?.map((step: string, i: number) => (
                        <div key={i} className="flex gap-5 group">
                          <div className="flex-shrink-0 flex flex-col items-center">
                              <span className="bg-white text-black font-black h-12 w-12 rounded-2xl flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] border-4 border-black text-xl group-hover:bg-[#FFD700] transition-colors">
                              {i + 1}
                              </span>
                              {i !== r.instructions.length - 1 && (
                                  <div className="w-2 h-full bg-gray-200 my-3 rounded-full"></div>
                              )}
                          </div>
                          <p className="font-bold text-xl text-gray-800 pt-2 leading-relaxed">{step}</p>
                        </div>
                      ))}
                    </div>
                    
                    {/* Big Cook Button */}
                    <div className="mt-10 border-t-4 border-black border-dashed pt-8 text-center">
                      <NeoButton onClick={() => setIsCookingMode(true)} className="mx-auto text-xl py-4 px-10" variant="accent">
                         Start Interactive Cooking 👨‍🍳
                      </NeoButton>
                    </div>

                  </div>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#FFFDF5] font-sans p-4 md:p-8 relative overflow-x-hidden text-black selection:bg-yellow-300">
      
      {/* Background Decor */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-yellow-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute top-[-10%] left-[-5%] w-96 h-96 bg-pink-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-32 left-20 w-96 h-96 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>
      </div>

      <header className="flex items-center justify-between gap-4 mb-10 relative z-10 max-w-6xl mx-auto">
        <div className="flex items-center gap-4">
            <Link to="/">
              <button className="p-3 bg-white border-4 border-black rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-y-1 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all">
                <Home size={24} />
              </button>
            </Link>
            <div>
                <h1 className="text-3xl md:text-5xl font-black tracking-tight">Recipe <span className="text-[#FFD700] underline decoration-4 decoration-black">Hub</span> 2.0</h1>
                <p className="font-bold text-gray-500 text-sm md:text-lg mt-1">Smart Kitchen & AI Bawarchi</p>
            </div>
        </div>
      </header>

      {renderTabs()}

      {/* Dynamic Content Area */}
      <div className="min-h-[50vh]">
        {renderInputArea()}

        {/* Loading Overlay */}
        <AnimatePresence>
          {loading && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col items-center justify-center py-10 relative z-10">
                <motion.div animate={{ rotate: [-10, 15, -10], y: [0, -15, 0] }} transition={{ repeat: Infinity, duration: 0.8 }} className="text-7xl mb-4 drop-shadow-lg">👨‍🍳</motion.div>
                <p className="font-black text-2xl text-black bg-yellow-300 px-6 py-2 rounded-full border-4 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">{statusMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dadi Tips Result */}
        {!loading && activeTab === 'tips' && nuskhaResult && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-3xl mx-auto relative z-10">
            <div className="bg-[#FFE4B5] border-4 border-black rounded-[2rem] p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
               <h3 className="text-3xl font-black mb-6 flex items-center gap-3"><HelpCircle size={32}/> Dadi's Solution:</h3>
               <div className="text-xl font-bold leading-relaxed whitespace-pre-line space-y-4">
                 {nuskhaResult}
               </div>
            </div>
          </motion.div>
        )}

        {/* Facts Banner (Shows only on search/diet when empty) */}
        {!loading && recipes.length === 0 && (activeTab === 'search' || activeTab === 'diet') && (
          <motion.div key={currentFact} initial={{ opacity: 0, scale: 0.95, rotate: -1 }} animate={{ opacity: 1, scale: 1, rotate: -1 }} className="max-w-xl mx-auto mt-8 bg-[#E6F4F1] border-4 border-black p-8 text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative z-10" style={{ clipPath: "polygon(1% 1%, 99% 0%, 100% 99%, 0% 98%)" }}>
            <div className="absolute -top-4 left-[48%] bg-red-500 w-6 h-12 border-4 border-black rotate-12"></div> 
            <Lightbulb className="mx-auto mb-4 text-orange-500 w-12 h-12" strokeWidth={2.5} />
            <h3 className="font-black text-black uppercase tracking-widest mb-3 text-sm bg-white inline-block px-3 py-1 border-2 border-black rounded-lg">Kya aapko pata hai?</h3>
            <p className="font-black text-2xl leading-snug text-gray-800">"{FOOD_FACTS[currentFact]}"</p>
          </motion.div>
        )}

        {/* Render Generated Recipes */}
        {!loading && recipes.length > 0 && activeTab !== 'saved' && renderRecipeGrid(recipes)}

        {/* Render Saved Recipes */}
        {activeTab === 'saved' && (
          <div className="max-w-6xl mx-auto relative z-10">
             <h2 className="text-4xl font-black mb-8 flex items-center gap-3"><Bookmark size={36} className="text-red-500 fill-red-500"/> My Saved Recipes</h2>
             {savedRecipes.length === 0 ? (
               <div className="text-center p-12 bg-white border-4 border-black rounded-[2rem] border-dashed">
                 <span className="text-6xl block mb-4">💔</span>
                 <p className="text-2xl font-black text-gray-400">No saved recipes yet!</p>
               </div>
             ) : renderRecipeGrid(savedRecipes)}
          </div>
        )}
      </div>

      {renderRecipeModal()}
    </div>
  );
};

export default RecipeHub;
