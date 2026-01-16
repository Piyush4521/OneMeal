import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, MapPin, Package, Phone, Award, LocateFixed, CheckCircle, LockKeyhole, AlertCircle, Camera, Sparkles, XCircle, Leaf, Beef, Menu, History, Gift, MessageSquare, Info } from 'lucide-react';
import { NeoButton } from '../components/ui/NeoButton';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, doc, updateDoc, onSnapshot } from 'firebase/firestore'; 
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import GoogleTranslate from '../components/GoogleTranslate'; 
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const API_KEY = "YOUR_GEMINI_API_KEY_HERE"; 

const DonorDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'donate' | 'history' | 'guide' | 'suggestions'>('donate');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [donations, setDonations] = useState<any[]>([]); 
  const [foodItem, setFoodItem] = useState('');
  const [quantity, setQuantity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [foodType, setFoodType] = useState<'veg' | 'non-veg'>('veg'); 
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [aiVerifying, setAiVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false); 
  const [suggestionText, setSuggestionText] = useState("");

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
        collection(db, "donations"), 
        where("donorId", "==", auth.currentUser.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const historyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // @ts-ignore
        historyData.sort((a, b) => b.createdAt - a.createdAt);
        setDonations(historyData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        });
    }
  }, []);

  const goToHome = () => navigate('/');

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
        toast.error("Geolocation is not supported");
        return;
    }
    const toastId = toast.loading("Getting your location...");
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            setLocation({ lat: latitude, lng: longitude });
            setAddress(`GPS Pinned: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
            toast.dismiss(toastId);
            toast.success("Location Pinned! 📍");
        },
        (_error) => {
            toast.dismiss(toastId);
            toast.error("Could not fetch location.");
        }
    );
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
        setIsVerified(false); 
    }
  };

  const verifyFoodWithAI = async () => {
      if (!imageFile) {
          toast.error("Please take a photo first!");
          return;
      }

      setAiVerifying(true);
      const toastId = toast.loading("AI is checking your food... 🤖");

      try {
          const base64Data = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
              reader.readAsDataURL(imageFile);
          });

          const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
          const modelsData = await modelsResponse.json();
          if (modelsData.error) throw new Error(modelsData.error.message);

          const validModel = modelsData.models?.find((m: any) => 
            m.name.includes("flash") && m.supportedGenerationMethods?.includes("generateContent")
          );

          if (!validModel) throw new Error("No suitable AI model found.");
          const modelName = validModel.name.replace("models/", "");

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: "Look at this image. Is this real, edible cooked food or raw ingredients suitable for donation? If it is food, return ONLY the word 'YES'. If it is a person, object, blur, or inappropriate, return 'NO'." },
                        {
                            inline_data: {
                                mime_type: imageFile.type,
                                data: base64Data
                            }
                        }
                    ]
                }]
              })
            }
          );

          const data = await response.json();
          if (data.error) throw new Error(data.error.message);

          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.toUpperCase() || "";

          toast.dismiss(toastId);

          if (text.includes("YES")) {
              setIsVerified(true);
              toast.success("AI Verified: Looks delicious! ✅");
          } else {
              setIsVerified(false);
              toast.error("AI Rejected: Doesn't look like clear food. ❌");
              setImageFile(null);
              setImagePreview(null);
          }

      } catch (error: any) {
          console.error("AI Error:", error);
          toast.dismiss(toastId);
          toast.error("AI Error: " + (error.message || "Connection failed"));
      } finally {
          setAiVerifying(false);
      }
  };

  const handleDonate = async (e: React.FormEvent) => {
    e.preventDefault(); 
    if (!isVerified) {
        toast.error("Please Verify Food with AI first! 📸");
        return;
    }

    if (!foodItem || !quantity || !address || !phone) {
      toast.error("Fill all fields");
      return;
    }

    setLoading(true);

    try {
      await addDoc(collection(db, "donations"), {
        foodItem,
        quantity,
        address, 
        location, 
        phone,
        foodType, 
        donorName: auth.currentUser?.displayName || "Anonymous",
        donorId: auth.currentUser?.uid,
        status: "available",
        verified: true,
        createdAt: serverTimestamp()
      });

      toast.success("Donation Listed Successfully! 🍲");
      
      setFoodItem(''); setQuantity(''); setAddress(''); setPhone(''); setLocation(null);
      setImageFile(null); setImagePreview(null); setIsVerified(false); setFoodType('veg');

    } catch (error) {
      console.error(error);
      toast.error("Failed to donate.");
    } finally {
      setLoading(false);
    }
  };

  const submitSuggestion = async () => {
      if(!suggestionText.trim()) return toast.error("Please write something...");
      try {
          await addDoc(collection(db, "suggestions"), {
              message: suggestionText,
              userId: auth.currentUser?.uid,
              userName: auth.currentUser?.displayName || "Anonymous",
              createdAt: serverTimestamp(),
              title: "Donor Suggestion"
          });
          toast.success("Thanks! Your suggestion sent to Admin 📨");
          setSuggestionText("");
      } catch(e) { toast.error("Failed to send"); }
  };

  const VerifyCard = ({ item }: { item: any }) => {
    const [otpInput, setOtpInput] = useState("");
    const [verifying, setVerifying] = useState(false);
    
    const handleVerify = async () => {
        setVerifying(true);
        if(otpInput === item.otp) {
            try {
                const docRef = doc(db, "donations", item.id);
                await updateDoc(docRef, { status: "completed" });
                toast.success("Pickup Verified! +10 Karma Points");
            } catch(e) { toast.error("Error updating status"); }
        } else {
            toast.error("Wrong OTP!");
        }
        setVerifying(false);
    };

    return (
        <div className="mt-2 bg-yellow-100 p-3 rounded-lg border-2 border-yellow-400">
            <p className="text-xs font-bold text-yellow-800 mb-2">NGO is here! Enter OTP:</p>
            <div className="flex gap-2">
                <input type="text" maxLength={4} placeholder="0000" className="w-24 p-2 rounded border-2 border-dark font-black text-center tracking-widest text-lg" value={otpInput} onChange={(e) => setOtpInput(e.target.value)} />
                <NeoButton onClick={handleVerify} disabled={verifying} className="text-xs px-3 py-1 bg-green-500 hover:bg-green-600 text-white border-green-700">{verifying ? "..." : "Verify"}</NeoButton>
            </div>
        </div>
    )
  }

  function LocationMarker() {
    const [position, setPosition] = useState<L.LatLng | null>(null);
    const map = useMap();
    useEffect(() => {
        if (location) {
            map.flyTo([location.lat, location.lng], 15);
            setPosition(new L.LatLng(location.lat, location.lng));
        }
    }, [location, map]);
    useMapEvents({
      click(e) {
        setPosition(e.latlng);
        setLocation({ lat: e.latlng.lat, lng: e.latlng.lng });
        setAddress(`Map Pin: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`);
      },
    });
    return position === null ? null : <Marker position={position}><Popup>Selected Location</Popup></Marker>;
  }

  const completedCount = donations.filter(d => d.status === 'completed').length;
  const reportedCount = donations.filter(d => d.status === 'reported').length;
  const karmaPoints = (completedCount * 10) - (reportedCount * 50);

  return (
    <div className="min-h-screen bg-[#F0F2F5] font-sans flex flex-col">
      
      {/* Header */}
      <header className="bg-white border-b-2 border-dark p-4 sticky top-0 z-50 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
             <NeoButton onClick={goToHome} variant="secondary" className="p-2 rounded-full hidden md:flex"><Send size={20} className="rotate-180"/></NeoButton>
             <h1 className="text-xl md:text-2xl font-black">Donor<span className="text-blue-600">Dashboard</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
            <GoogleTranslate />
            <div className={`hidden md:flex items-center gap-2 px-3 py-1 rounded-full border-2 border-dark font-bold ${karmaPoints >= 0 ? 'bg-yellow-100' : 'bg-red-100'}`}>
                <Award size={18} className={karmaPoints >= 0 ? "text-yellow-600" : "text-red-600"}/> 
                <span>{karmaPoints} Karma</span>
            </div>
            <button className="md:hidden p-2 border-2 border-dark rounded-lg bg-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                <Menu size={24}/>
            </button>
        </div>
      </header>

      <div className="flex flex-1 relative max-w-7xl mx-auto w-full">
        
        {/* Sidebar */}
        <aside className={`
            fixed md:relative top-[70px] md:top-0 left-0 w-64 h-[calc(100vh-70px)] md:h-auto bg-white border-r-2 border-dark p-4 space-y-3 transition-transform duration-300 z-40 overflow-y-auto
            ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
             <div className="md:hidden mb-4 p-4 bg-yellow-50 rounded-xl border-2 border-yellow-200 text-center">
                 <div className="font-black text-xl">{karmaPoints}</div>
                 <div className="text-xs font-bold text-gray-500 uppercase">Karma Points</div>
             </div>

             <button onClick={() => {setActiveTab('donate'); setMobileMenuOpen(false);}} className={`w-full text-left p-4 font-bold border-2 border-dark rounded-xl flex items-center gap-3 transition-all ${activeTab === 'donate' ? 'bg-primary shadow-neo translate-x-1' : 'bg-white hover:bg-gray-50'}`}>
                <Gift size={20}/> Donate Krdo
             </button>

             <button onClick={() => {setActiveTab('history'); setMobileMenuOpen(false);}} className={`w-full text-left p-4 font-bold border-2 border-dark rounded-xl flex items-center gap-3 transition-all ${activeTab === 'history' ? 'bg-blue-300 shadow-neo translate-x-1' : 'bg-white hover:bg-gray-50'}`}>
                <History size={20}/> Tracking & History
             </button>

             <button onClick={() => {setActiveTab('guide'); setMobileMenuOpen(false);}} className={`w-full text-left p-4 font-bold border-2 border-dark rounded-xl flex items-center gap-3 transition-all ${activeTab === 'guide' ? 'bg-green-300 shadow-neo translate-x-1' : 'bg-white hover:bg-gray-50'}`}>
                <Info size={20}/> Packing Guide
             </button>

             <button onClick={() => {setActiveTab('suggestions'); setMobileMenuOpen(false);}} className={`w-full text-left p-4 font-bold border-2 border-dark rounded-xl flex items-center gap-3 transition-all ${activeTab === 'suggestions' ? 'bg-purple-300 shadow-neo translate-x-1' : 'bg-white hover:bg-gray-50'}`}>
                <MessageSquare size={20}/> Suggestions Box
             </button>
        </aside>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto h-[calc(100vh-80px)]">
            
            {activeTab === 'donate' && (
                <div className="grid lg:grid-cols-2 gap-8">
                    <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="bg-white border-4 border-dark rounded-3xl p-6 md:p-8 shadow-neo h-fit">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-black">🍲 Donate Food</h2>
                            <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold border border-green-800 animate-pulse">Live</div>
                        </div>
                        
                        <form onSubmit={handleDonate} className="space-y-5">
                            <div className="flex gap-4 p-1 bg-gray-100 rounded-xl border-2 border-dark">
                                <button 
                                    type="button" 
                                    onClick={() => setFoodType('veg')}
                                    className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${foodType === 'veg' ? 'bg-green-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}
                                >
                                    <Leaf size={18}/> Veg
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => setFoodType('non-veg')}
                                    className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${foodType === 'non-veg' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}
                                >
                                    <Beef size={18}/> Non-Veg
                                </button>
                            </div>

                            <div className="p-4 border-2 border-dashed border-dark rounded-xl bg-gray-50 text-center relative overflow-hidden">
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    capture="environment"
                                    onChange={handleImageSelect}
                                    className="hidden" 
                                    id="food-camera"
                                />
                                
                                {!imagePreview ? (
                                    <label htmlFor="food-camera" className="cursor-pointer flex flex-col items-center gap-2 py-4">
                                        <div className="bg-white p-3 rounded-full border-2 border-dark shadow-sm hover:scale-110 transition-transform">
                                            <Camera size={32} className="text-dark" />
                                        </div>
                                        <span className="font-bold text-gray-600">Take Photo (Required)</span>
                                    </label>
                                ) : (
                                    <div className="relative">
                                        <img src={imagePreview} alt="Preview" className="w-full h-48 object-cover rounded-lg border-2 border-dark" />
                                        <button 
                                            type="button"
                                            onClick={() => { setImageFile(null); setImagePreview(null); setIsVerified(false); }}
                                            className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full border border-dark z-10 hover:scale-110"
                                        >
                                            <XCircle size={20} />
                                        </button>
                                        {!isVerified ? (
                                            <NeoButton 
                                                type="button" 
                                                onClick={verifyFoodWithAI} 
                                                disabled={aiVerifying}
                                                className="mt-3 w-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center gap-2"
                                            >
                                                {aiVerifying ? <Sparkles className="animate-spin" /> : <Sparkles />} 
                                                {aiVerifying ? "AI Checking..." : "Verify with AI"}
                                            </NeoButton>
                                        ) : (
                                            <div className="mt-2 bg-green-100 text-green-800 font-bold py-2 rounded border border-green-500 flex items-center justify-center gap-2">
                                                <CheckCircle size={18} /> Food Verified!
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="font-bold block mb-1 text-sm">Food Item</label>
                                    <div className="flex items-center border-2 border-dark rounded-xl px-3 py-3 bg-white">
                                        <Package className="text-gray-500 mr-2 shrink-0" size={18} />
                                        <input type="text" placeholder="e.g. 50 Rotis" className="w-full outline-none font-bold text-sm bg-transparent" value={foodItem} onChange={(e) => setFoodItem(e.target.value)} />
                                    </div>
                                </div>
                                <div>
                                    <label className="font-bold block mb-1 text-sm">Quantity</label>
                                    <div className="flex items-center border-2 border-dark rounded-xl px-3 py-3 bg-white">
                                        <span className="text-gray-500 mr-2 font-black text-xs">QTY</span>
                                        <input type="text" placeholder="e.g. 5kg" className="w-full outline-none font-bold text-sm bg-transparent" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="font-bold block mb-1 text-sm">Phone</label>
                                <div className="flex items-center border-2 border-dark rounded-xl px-3 py-3 bg-white">
                                    <Phone className="text-gray-500 mr-3" size={20} />
                                    <input type="tel" placeholder="9876543210" className="w-full outline-none font-bold bg-transparent" value={phone} onChange={(e) => setPhone(e.target.value)} />
                                </div>
                            </div>

                            <div>
                                <label className="font-bold block mb-1 text-sm">Pickup Location</label>
                                <div className="flex gap-2">
                                    <div className="flex-1 flex items-center border-2 border-dark rounded-xl px-3 py-3 bg-white">
                                        <MapPin className="text-gray-500 mr-3" size={20} />
                                        <input type="text" placeholder="Address or Click Detect" className="w-full outline-none font-bold bg-transparent" value={address} onChange={(e) => setAddress(e.target.value)} />
                                    </div>
                                    <NeoButton type="button" onClick={handleGetLocation} className="px-4 bg-secondary text-dark hover:bg-yellow-400"><LocateFixed size={22} /></NeoButton>
                                </div>
                                {location && <p className="text-xs text-green-600 font-bold mt-1 ml-1 flex items-center gap-1"><CheckCircle size={12} /> GPS Locked</p>}
                            </div>

                            <NeoButton disabled={loading || !isVerified} className={`w-full py-4 text-lg mt-2 ${!isVerified ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                {loading ? "Listing..." : <> Khana Donate Karo <Send className="ml-2 w-5 h-5" /> </>}
                            </NeoButton>
                        </form>
                    </motion.div>

                    <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="bg-white border-4 border-dark rounded-3xl overflow-hidden shadow-neo h-[500px] relative z-0">
                        {!location ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10 flex-col gap-4">
                                <div className="w-16 h-16 border-4 border-gray-300 border-t-black rounded-full animate-spin"></div>
                                <p className="font-bold text-gray-500 animate-pulse">Detecting Location...</p>
                            </div>
                        ) : (
                            <MapContainer center={[location.lat, location.lng]} zoom={15} style={{ height: "100%", width: "100%" }}>
                                <TileLayer attribution='© OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <LocationMarker />
                            </MapContainer>
                        )}
                    </motion.div>
                </div>
            )}

            {activeTab === 'history' && (
                <div className="max-w-4xl mx-auto">
                     <h2 className="text-3xl font-black mb-6 flex items-center gap-2"><History size={32}/> Donation History</h2>
                     <div className="bg-white border-4 border-dark rounded-3xl p-6 shadow-neo">
                        {donations.length === 0 ? (
                            <div className="text-center py-12 text-gray-500 font-bold">No donations yet. Start today!</div>
                        ) : (
                            <div className="space-y-4">
                                {donations.map((item, index) => (
                                    <div key={index} className={`flex flex-col md:flex-row justify-between gap-4 bg-gray-50 p-4 rounded-xl border-2 ${item.status === 'reported' ? 'border-red-500 bg-red-50' : 'border-dark'}`}>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-xs font-black px-2 py-0.5 rounded text-white ${item.foodType === 'non-veg' ? 'bg-red-500' : 'bg-green-500'}`}>
                                                    {item.foodType === 'non-veg' ? 'NON-VEG' : 'VEG'}
                                                </span>
                                                <h3 className="font-black text-lg">{item.foodItem}</h3>
                                            </div>
                                            <p className="text-gray-600 font-medium text-sm">{item.quantity} • {item.address}</p>
                                        </div>
                                        
                                        <div className="flex flex-col items-end gap-2">
                                            <div className={`px-3 py-1 rounded-full text-xs font-black border border-dark flex items-center gap-1 ${
                                                item.status === 'completed' ? 'bg-green-200 text-green-900' : 
                                                item.status === 'claimed' ? 'bg-orange-200 text-orange-900 animate-pulse' :
                                                item.status === 'reported' ? 'bg-red-200 text-red-900' : 
                                                'bg-yellow-200 text-yellow-900'
                                            }`}>
                                                {item.status === 'available' && 'OPEN'}
                                                {item.status === 'claimed' && <><LockKeyhole size={12}/> CLAIMED</>}
                                                {item.status === 'completed' && <><CheckCircle size={12}/> DONE</>}
                                                {item.status === 'reported' && <><AlertCircle size={12}/> FAKE</>}
                                            </div>
                                            {item.status === 'claimed' && <VerifyCard item={item} />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                     </div>
                </div>
            )}

            {activeTab === 'guide' && (
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-3xl font-black mb-6 flex items-center gap-2"><Info size={32}/> Packing Guide</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="bg-white border-4 border-dark rounded-2xl p-6 shadow-neo">
                            <h3 className="text-xl font-black mb-4 text-blue-600">Liquid Items (Dal/Curry)</h3>
                            <ul className="list-disc pl-5 space-y-2 font-medium text-gray-700">
                                <li>Use air-tight plastic containers or pouches.</li>
                                <li>Double bag if using polybags to prevent leakage.</li>
                                <li>Do not fill to the brim; leave 1 inch space.</li>
                            </ul>
                        </div>
                        <div className="bg-white border-4 border-dark rounded-2xl p-6 shadow-neo">
                            <h3 className="text-xl font-black mb-4 text-green-600">Dry Items (Roti/Rice)</h3>
                            <ul className="list-disc pl-5 space-y-2 font-medium text-gray-700">
                                <li>Wrap rotis in foil or newspaper to keep soft.</li>
                                <li>Avoid mixing wet and dry items in same container.</li>
                                <li>Rice should be covered to maintain moisture.</li>
                            </ul>
                        </div>
                        <div className="bg-white border-4 border-dark rounded-2xl p-6 shadow-neo">
                            <h3 className="text-xl font-black mb-4 text-red-600">Safety First</h3>
                            <ul className="list-disc pl-5 space-y-2 font-medium text-gray-700">
                                <li>Food must be cooked within last 4 hours.</li>
                                <li>Do not donate stale or smelling food.</li>
                                <li>Wash hands before packing.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'suggestions' && (
                <div className="max-w-2xl mx-auto">
                    <h2 className="text-3xl font-black mb-6 flex items-center gap-2"><MessageSquare size={32}/> Suggestions Box</h2>
                    <div className="bg-white border-4 border-dark rounded-3xl p-8 shadow-neo">
                        <p className="font-bold text-gray-600 mb-4">
                            Found a bug? Have an idea? Or just want to appreciate us? 
                            Write to us directly. Admin reads everything!
                        </p>
                        <textarea 
                            className="w-full h-40 border-2 border-dark rounded-xl p-4 font-medium outline-none focus:bg-gray-50 resize-none mb-4"
                            placeholder="Type your message here..."
                            value={suggestionText}
                            onChange={(e) => setSuggestionText(e.target.value)}
                        ></textarea>
                        <NeoButton onClick={submitSuggestion} className="w-full py-3 flex justify-center gap-2">
                            Send Message <Send size={20}/>
                        </NeoButton>
                    </div>
                </div>
            )}

        </main>
      </div>
    </div>
  );
};

export default DonorDashboard;