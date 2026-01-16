import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChefHat, Loader, Home, Lightbulb, X, Clock, Flame, Utensils, ArrowRight, Smile, Search, Activity, Zap, BookOpen, Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NeoButton } from '../components/ui/NeoButton';
import toast from 'react-hot-toast';

const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";
const POLLINATIONS_KEY = "YOUR_POLLINATIONS_API_KEY_HERE";

const FOOD_FACTS = [
  "🍯 Honey never spoils! Archaeologists have found edible honey in ancient Egyptian tombs over 3,000 years old.",
  "🍌 Don't toss brown bananas! They are perfect for baking banana bread or freezing for smoothies.",
  "❄️ You can freeze almost anything—including milk, cheese, and cracked eggs—to make them last for months.",
  "🥦 Broccoli stalks have more calcium and Vitamin C than the florets. Chop them up for stir-frys!",
  "📅 'Best Before' is about quality, not safety. Most food is still safe to eat after this date (unlike 'Use By').",
  "🌱 You can regrow vegetables like green onions, lettuce, and celery just by placing their roots in water.",
  "🍞 Stale bread isn't trash! It makes the best French Toast, breadcrumbs, or crunchy croutons.",
  "🥔 Potato skins hold most of the fiber and nutrients. Scrub them clean and leave them on!",
  "☕ Used coffee grounds are rich in nitrogen—sprinkle them in your garden to help plants grow faster.",
  "🌍 Wasting food produces methane, a greenhouse gas 25x more potent than CO2. Saving food saves the planet!"
];

const READY_RECIPES = [
    {
        title: "Masala Khichdi (One Pot)",
        time: "20 mins",
        calories: "320 kcal",
        tags: ["Zero Waste", "Comfort Food"],
        ingredients: ["Rice", "Moong Dal", "Mixed Veggies", "Turmeric", "Ghee"],
        instructions: ["Wash rice and dal.", "Sauté veggies in cooker with ghee and spices.", "Add rice, dal, water.", "Pressure cook for 3 whistles.", "Serve hot with curd."]
    },
    {
        title: "Leftover Roti Noodles",
        time: "10 mins",
        calories: "250 kcal",
        tags: ["Snack", "Reuse"],
        ingredients: ["Stale Roti", "Onion", "Capsicum", "Soy Sauce", "Ketchup"],
        instructions: ["Cut rotis into thin strips.", "Stir fry veggies on high heat.", "Add sauces and mix.", "Toss in roti strips and cook for 2 mins.", "Garnish with coriander."]
    },
    {
        title: "Banana Peel Chutney",
        time: "15 mins",
        calories: "120 kcal",
        tags: ["Zero Waste", "Unique"],
        ingredients: ["Banana Peels", "Green Chilies", "Coconut", "Tamarind", "Salt"],
        instructions: ["Boil banana peels until soft.", "Grind with chilies, coconut, and tamarind.", "Add a tadka of mustard seeds and curry leaves.", "Perfect side for dosa/idli."]
    }
];

const LOADING_JOKES = [
    "👨‍🍳 Chef sabzi kaat raha hai...",
    "🔥 Tawa garam ho raha hai...",
    "🧂 Namak shamak daal rahe hai...",
    "🤔 Soch raha hu kya banau...",
    "🍛 Masala koot raha hu...",
    "🥔 Aloo cheel raha hu...",
    "🥗 Dhaniya dhoond raha hu (mil nahi raha)...",
    "📞 Mummy se recipe confirm kar raha hu..."
];

const RecipeHub = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'diet' | 'ready' | 'facts'>('search');
  const [inputValue, setInputValue] = useState('');
  const [recipes, setRecipes] = useState<any[]>([]); 
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [, setCurrentFact] = useState(0);
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setCurrentFact((p) => (p + 1) % FOOD_FACTS.length), 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let interval: any;
    if (loading) {
        let i = 0;
        interval = setInterval(() => {
            setStatusMsg(LOADING_JOKES[i % LOADING_JOKES.length]);
            i++;
        }, 2000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleSmartCook = async () => {
    if (!inputValue.trim()) {
        toast.error("Arre bhai, kuch likho toh sahi!");
        return;
    }

    const isValidInput = /[a-zA-Z]/.test(inputValue) && inputValue.length > 2;
    
    if (!isValidInput) {
        toast.error("Please enter correct food item 🍎");
        return;
    }

    if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("PASTE_YOUR")) return toast.error("Gemini API Key missing!");

    setLoading(true);
    setRecipes([]); 
    
    try {
      const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
      const modelsData = await modelsResponse.json();
      
      if (modelsData.error) throw new Error(modelsData.error.message);

      const validModel = modelsData.models?.find((m: any) => 
        m.supportedGenerationMethods?.includes("generateContent") && !m.name.includes("vision")
      );

      if (!validModel) throw new Error("No text model found.");

      const modelName = validModel.name.replace("models/", "");

      let promptText = "";
      if (activeTab === 'search') {
        promptText = `Act as an Indian Chef. User has these ingredients: ${inputValue}. 
        Suggest 2 detailed, tasty recipes. 
        Return ONLY valid JSON (no markdown): 
        [ { "title": "Recipe Name", "time": "30 mins", "calories": "400 kcal", "tags": ["Spicy", "Lunch"], "ingredients": ["Item 1", "Item 2"], "instructions": ["Step 1", "Step 2"] } ]`;
      } else {
        promptText = `Act as a Desi Nutritionist. Goal: ${inputValue}. Create 1-day meal plan (3 meals). 
        Return ONLY valid JSON (no markdown): 
        [ { "title": "Meal Name", "time": "15 mins", "calories": "300 kcal", "tags": ["Breakfast"], "ingredients": ["Item 1"], "instructions": ["Step 1"] } ]`;
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        }
      );

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      const text = data.candidates[0].content.parts[0].text;
      const jsonString = text.replace(/```json|```/g, "").trim();
      
      setRecipes(JSON.parse(jsonString));
      toast.success("Lo ji, khana taiyaar! 🥘");

    } catch (error: any) {
      console.error(error);
      if (error.message && error.message.includes("429")) {
        setStatusMsg("❌ Chef is busy (Quota Limit). Wait 1 min.");
        toast.error("Too many requests! Wait a bit.");
      } else {
        setStatusMsg("❌ Chef thoda confused hai. Phir se try karo.");
        toast.error("Error connecting to Chef.");
      }
    } finally {
      setLoading(false);
    }
  };

  const getStableSeed = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  };

  const getPollinationsImage = useCallback((title: string, index: number) => {
    const uniqueTitle = `${title}-${index}`; 
    const seed = getStableSeed(uniqueTitle);
    
    const prompt = `delicious ${title}, indian food, 8k, photorealistic, cinematic lighting`;
    
    let imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true&seed=${seed}&model=dreamshaper&enhance=true`;
    
    if (POLLINATIONS_KEY && !POLLINATIONS_KEY.includes("PASTE_YOUR")) {
        imageUrl += `&token=${POLLINATIONS_KEY}`;
    }

    return imageUrl;
  }, []);

  const handleImageError = (e: any) => {
    e.currentTarget.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=800&auto=format&fit=crop";
  };

  const switchTab = (tab: any) => {
      setActiveTab(tab);
      setRecipes([]);
      setInputValue("");
      setMobileMenuOpen(false); 
  };

  return (
    <div className="min-h-screen bg-[#FFFDF5] font-sans relative overflow-x-hidden text-black flex flex-col">
      
      {/* HEADER */}
      <header className="flex items-center justify-between gap-4 p-4 md:p-6 border-b-2 border-black bg-white relative z-20 shadow-sm">
        <div className="flex items-center gap-4">
            <Link to="/"><NeoButton variant="secondary" className="p-3 rounded-full"><Home size={24} /></NeoButton></Link>
            <div>
                <h1 className="text-2xl md:text-3xl font-black flex items-center gap-2">Recipe <span className="text-[#FFD700]">Hub</span> <ChefHat/></h1>
                <p className="font-bold text-gray-500 text-xs md:text-sm">Apna personal AI Bawarchi</p>
            </div>
        </div>
        <button className="md:hidden p-2 border-2 border-black rounded-lg" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <Menu size={24} />
        </button>
      </header>

      <div className="flex flex-1 relative z-10 max-w-7xl mx-auto w-full">
        
        {/* SIDEBAR (Desktop) */}
        <aside className={`
            fixed md:relative top-[80px] md:top-0 left-0 w-64 h-full md:h-auto bg-white border-r-2 border-black p-6 space-y-4 transition-transform duration-300 z-30
            ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
            <div className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Menu</div>
            
            <button 
                onClick={() => switchTab('search')} 
                className={`w-full text-left p-4 font-black text-lg border-2 border-black rounded-xl transition-all flex items-center gap-3 ${activeTab === 'search' ? 'bg-[#FFD700] shadow-neo translate-x-2' : 'bg-white hover:bg-gray-50 hover:translate-x-1'}`}
            >
                <Search size={20}/> Jugaad Search
            </button>

            <button 
                onClick={() => switchTab('diet')} 
                className={`w-full text-left p-4 font-black text-lg border-2 border-black rounded-xl transition-all flex items-center gap-3 ${activeTab === 'diet' ? 'bg-[#FF6B6B] text-white shadow-neo translate-x-2' : 'bg-white hover:bg-gray-50 hover:translate-x-1'}`}
            >
                <Activity size={20}/> Healthy Banao
            </button>

            <button 
                onClick={() => switchTab('ready')} 
                className={`w-full text-left p-4 font-black text-lg border-2 border-black rounded-xl transition-all flex items-center gap-3 ${activeTab === 'ready' ? 'bg-green-400 shadow-neo translate-x-2' : 'bg-white hover:bg-gray-50 hover:translate-x-1'}`}
            >
                <Zap size={20}/> Ready Recipes
            </button>

            <button 
                onClick={() => switchTab('facts')} 
                className={`w-full text-left p-4 font-black text-lg border-2 border-black rounded-xl transition-all flex items-center gap-3 ${activeTab === 'facts' ? 'bg-blue-300 shadow-neo translate-x-2' : 'bg-white hover:bg-gray-50 hover:translate-x-1'}`}
            >
                <BookOpen size={20}/> Food Facts
            </button>
        </aside>

        <main className="flex-1 p-4 md:p-8 overflow-hidden">
            
            {(activeTab === 'search' || activeTab === 'diet') && (
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-10">
                        <h2 className="text-4xl font-black mb-4">
                            {activeTab === 'search' ? "Fridge mein kya pada hai?" : "Fitness Goal kya hai boss?"}
                        </h2>
                        
                        <div className="bg-white p-2 border-4 border-black rounded-2xl shadow-neo flex flex-col md:flex-row gap-2">
                        <input 
                            type="text" 
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder={activeTab === 'search' ? "e.g. 2 Aloo, 1 Pyaaz, Basi Rice..." : "e.g. Weight Loss, Muscle Gain, High Protein..."}
                            className="flex-1 bg-transparent p-4 font-bold text-lg outline-none placeholder:text-gray-400"
                            onKeyDown={(e) => e.key === 'Enter' && handleSmartCook()}
                        />
                        <NeoButton onClick={handleSmartCook} className="bg-black text-white px-8 py-4 text-lg min-w-[180px] rounded-xl" disabled={loading}>
                            {loading ? <Loader className="animate-spin mx-auto" /> : <>{activeTab === 'search' ? 'Jadoo Dikhao ✨' : 'Plan Banao 📝'}</>}
                        </NeoButton>
                        </div>
                    </div>

                    {loading && (
                        <div className="flex flex-col items-center justify-center py-10">
                            <div className="text-6xl animate-bounce mb-4">👨‍🍳</div>
                            <p className="font-black text-2xl text-dark text-center px-4">{statusMsg}</p>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'ready' && (
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-4xl font-black mb-2 flex items-center gap-2"><Zap className="text-green-600" fill="currentColor"/> Quick & Ready Recipes</h2>
                    <p className="font-bold text-gray-500 mb-8">Minimum Food Waste. Maximum Taste. 15 Mins Only.</p>
                </div>
            )}

            {activeTab === 'facts' && (
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-4xl font-black mb-2 flex items-center gap-2"><Lightbulb className="text-yellow-500" fill="currentColor"/> Did You Know?</h2>
                    <p className="font-bold text-gray-500 mb-8">Interesting facts about food and sustainability.</p>
                    
                    <div className="grid md:grid-cols-2 gap-6">
                        {FOOD_FACTS.map((fact, index) => (
                            <div key={index} className="bg-white border-4 border-black rounded-xl p-6 shadow-neo hover:scale-[1.02] transition-transform">
                                <span className="text-4xl mb-4 block">{fact.split(' ')[0]}</span>
                                <p className="font-bold text-lg text-gray-800 leading-relaxed">{fact.substring(2)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto relative z-10 pb-20">
                {(activeTab === 'ready' ? READY_RECIPES : recipes).map((recipe, index) => (
                    <motion.div 
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        whileHover={{ scale: 1.03, rotate: 1 }}
                        className="bg-white border-4 border-black rounded-3xl overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col cursor-pointer group"
                        onClick={() => setSelectedRecipe(recipe)}
                    >
                    <div className="h-48 overflow-hidden border-b-4 border-black bg-gray-100 relative group">
                        <img 
                        src={getPollinationsImage(recipe.title, index)}
                        alt={recipe.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        onError={handleImageError}
                        />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
                    </div>

                    <div className="p-6 flex flex-col flex-1">
                        <h3 className="text-2xl font-black mb-2 leading-tight">{recipe.title}</h3>
                        <div className="flex gap-2 mb-4 flex-wrap">
                        {recipe.tags?.map((tag: string, i: number) => (
                            <span key={i} className="bg-yellow-100 border-2 border-black px-2 py-1 rounded text-xs font-bold">{tag}</span>
                        ))}
                        </div>
                        <div className="flex justify-between text-gray-600 font-bold mt-auto pt-4 border-t-2 border-dashed border-gray-300">
                        <span className="flex items-center gap-1"><Flame size={16} className="text-orange-500"/> {recipe.calories}</span>
                        <span className="flex items-center gap-1"><Clock size={16} className="text-blue-500"/> {recipe.time}</span>
                        </div>
                        <div className="mt-4 text-right">
                        <span className="text-sm font-black underline decoration-2 decoration-primary flex items-center justify-end gap-1">View Recipe <ArrowRight size={16}/></span>
                        </div>
                    </div>
                    </motion.div>
                ))}
            </div>

            {!loading && recipes.length === 0 && (activeTab === 'search' || activeTab === 'diet') && (
                <div className="flex items-center justify-center h-64 opacity-50">
                    <div className="text-center">
                        <Utensils size={48} className="mx-auto mb-4 text-gray-400"/>
                        <p className="text-xl font-bold text-gray-400">Search to see magic happen...</p>
                    </div>
                </div>
            )}
        </main>
      </div>

      <AnimatePresence>
        {selectedRecipe && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0, rotateX: 20 }}
              animate={{ scale: 1, opacity: 1, rotateX: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-white border-4 border-black rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-neo relative"
            >
              <button onClick={() => setSelectedRecipe(null)} className="absolute top-4 right-4 bg-red-500 hover:bg-red-600 text-white border-2 border-black rounded-full p-2 transition-colors z-50">
                <X size={24} />
              </button>

              <div className="p-0">
                 <div className="h-40 w-full overflow-hidden border-b-4 border-black relative">
                      <img 
                        src={getPollinationsImage(selectedRecipe.title, 0)} 
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        onError={handleImageError}
                      />
                      <div className="absolute bottom-0 left-0 bg-black/60 backdrop-blur-sm p-4 w-full">
                        <h2 className="text-3xl font-black text-white">{selectedRecipe.title}</h2>
                      </div>
                 </div>

                <div className="p-6 md:p-8">
                  <div className="flex gap-4 font-bold text-gray-700 mb-8 bg-gray-100 p-4 rounded-xl border-2 border-black">
                    <span className="flex items-center gap-2"><Clock className="text-blue-600"/> {selectedRecipe.time}</span>
                    <span className="w-px bg-gray-400"></span>
                    <span className="flex items-center gap-2"><Flame className="text-orange-600"/> {selectedRecipe.calories}</span>
                    <span className="w-px bg-gray-400"></span>
                    <span className="flex items-center gap-2"><Smile className="text-green-600"/> Easy</span>
                  </div>

                  <div className="space-y-8">
                    <div>
                      <h3 className="text-2xl font-black flex items-center gap-2 mb-4">
                        <Utensils size={24} className="text-primary"/> Ingredients (Saamagri)
                      </h3>
                      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {selectedRecipe.ingredients?.map((ing: string, i: number) => (
                          <li key={i} className="flex items-center gap-3 font-bold text-gray-700 bg-white border-2 border-black rounded-lg p-2 shadow-sm">
                             <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center border border-black text-xs">{i+1}</div>
                             {ing}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-2xl font-black flex items-center gap-2 mb-4">
                        <ChefHat size={24} className="text-primary"/> Instructions (Vidhi)
                      </h3>
                      <div className="space-y-6">
                        {selectedRecipe.instructions?.map((step: string, i: number) => (
                          <div key={i} className="flex gap-4 group">
                            <div className="flex-shrink-0 flex flex-col items-center">
                                <span className="bg-black text-white font-black h-10 w-10 rounded-xl flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(128,128,128,1)] border-2 border-gray-600">
                                {i + 1}
                                </span>
                                {i !== selectedRecipe.instructions.length - 1 && (
                                    <div className="w-1 h-full bg-gray-300 my-2 rounded-full group-hover:bg-primary transition-colors"></div>
                                )}
                            </div>
                            <p className="font-bold text-lg text-gray-800 pt-1 leading-relaxed">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default RecipeHub;