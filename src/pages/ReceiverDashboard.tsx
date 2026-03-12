import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Navigation, Clock, Phone, AlertCircle, RefreshCw, ArrowRight, Menu, ShoppingBag, History, Compass, Beef, Leaf, CheckCircle, LockKeyhole } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { NeoButton } from '../components/ui/NeoButton';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { generateText, isGeminiConfigured } from '../lib/aiClient';
import { claimDonation, reportDonation } from '../lib/backendClient';
import { openChat } from '../lib/chatEvents';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const UserIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const FoodIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 9999;
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    return Number((R * c).toFixed(1)); 
};

const toDateSafe = (timestamp: any) => {
    if(!timestamp) return null;
    if(timestamp instanceof Date) return timestamp;
    if(typeof timestamp === 'number') return new Date(timestamp);
    if(typeof timestamp === 'string') {
        const parsed = new Date(timestamp);
        return isNaN(parsed.getTime()) ? null : parsed;
    }
    if(timestamp.toDate) return timestamp.toDate();
    if(typeof timestamp.seconds === 'number') return new Date(timestamp.seconds * 1000);
    return null;
};

const formatShortTime = (timestamp: any) => {
    const date = toDateSafe(timestamp);
    if(!date) return 'Unknown';
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function MapUpdater({ center }: { center: { lat: number, lng: number } | null }) {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.flyTo([center.lat, center.lng], 14, { animate: true });
        }
    }, [center, map]);
    return null;
}

const ReceiverDashboard = () => {
  const [activeTab, setActiveTab] = useState<'feed' | 'pickups' | 'history'>('feed');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [donations, setDonations] = useState<any[]>([]);
  const [myClaims, setMyClaims] = useState<any[]>([]);
  const [pickupOtps, setPickupOtps] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [ngoLocation, setNgoLocation] = useState<{lat: number, lng: number} | null>(null);
  const [selectedDonation, setSelectedDonation] = useState<string | null>(null);
  const [aiPickups, setAiPickups] = useState<string[]>([]);
  const [aiPickupsLoading, setAiPickupsLoading] = useState(false);
  const [aiPickupsError, setAiPickupsError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setNgoLocation({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (error) => {
                console.error("Error getting location", error);
                toast.error("Enable location to see distance!");
            }
        );
    }
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'donations'), where('status', '==', 'available'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const foodData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDonations(foodData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
      if(!auth.currentUser) {
          setMyClaims([]);
          return;
      }

      const q = query(collection(db, 'donations'), where('claimedById', '==', auth.currentUser.uid));
      const unsubscribe = onSnapshot(q, (snapshot) => {
          const myData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setMyClaims(myData);
      });
      return () => unsubscribe();
  }, []);

  useEffect(() => {
      if (!auth.currentUser) {
          setPickupOtps({});
          return;
      }

      const q = query(collection(db, 'donationSecrets'), where('claimedById', '==', auth.currentUser.uid));
      const unsubscribe = onSnapshot(q, (snapshot) => {
          const next = snapshot.docs.reduce<Record<string, string>>((accumulator, docSnapshot) => {
              const data = docSnapshot.data();
              if (typeof data?.otp === 'string') {
                  accumulator[docSnapshot.id] = data.otp;
              }
              return accumulator;
          }, {});
          setPickupOtps(next);
      });

      return () => unsubscribe();
  }, []);

  const sortedDonations = useMemo(() => {
      if (!ngoLocation) return donations;
      return [...donations].map(item => ({
          ...item,
          distance: item.location ? calculateDistance(ngoLocation.lat, ngoLocation.lng, item.location.lat, item.location.lng) : 9999
      })).sort((a, b) => a.distance - b.distance);
  }, [donations, ngoLocation]);

  const activePickups = myClaims.filter(d => d.status === 'claimed');
  const historyPickups = myClaims.filter(d => d.status === 'completed');
  const hasAi = isGeminiConfigured();

  const parseAiLines = (text: string) =>
    text
      .split('\n')
      .map((line) => line.replace(/^[-*]\s?/, '').trim())
      .filter(Boolean)
      .slice(0, 4);

  const handleLogout = () => {
    auth.signOut();
    navigate('/');
    toast.success("Logged out.");
  };

  const handleAiPickups = async () => {
    if (!hasAi) {
      toast.error('AI assistant is not available right now.');
      return;
    }
    if (sortedDonations.length === 0) {
      setAiPickups([]);
      setAiPickupsError('No donations available for AI picks.');
      return;
    }

    setAiPickupsLoading(true);
    setAiPickupsError(null);
    setAiPickups([]);

    try {
      const list = sortedDonations.slice(0, 6).map((item, idx) => {
        const distance = typeof item.distance === 'number' ? `${item.distance} km` : 'unknown distance';
        return `#${idx + 1} ${item.foodItem || 'Food'} | qty: ${item.quantity || 'unknown'} | ${distance} | ${item.pickupPreference || 'asap'} | ${item.address || 'no address'}`;
      }).join('\n');

      const prompt = [
        'You help an NGO decide which food pickup to claim.',
        'Pick top 3 from the list with short reasons.',
        'Return exactly 3 lines starting with "- ".',
        list,
      ].join('\n');

      const reply = await generateText({ prompt, maxOutputTokens: 160 });
      const picks = parseAiLines(reply);
      if (!picks.length) {
        setAiPickupsError('AI did not return picks. Try again.');
      } else {
        setAiPickups(picks);
      }
    } catch (error) {
      console.error('AI pickup error:', error);
      setAiPickups([]);
      setAiPickupsError('AI picks failed. Please retry.');
    } finally {
      setAiPickupsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] font-sans flex flex-col h-screen overflow-hidden">
      
      {/* HEADER */}
      <header className="bg-white border-b-2 border-dark p-4 sticky top-0 z-50 flex justify-between items-center shadow-sm shrink-0">
        <div className="flex items-center gap-3">
             <Link to="/"><NeoButton variant="secondary" className="p-2 rounded-full hidden md:flex"><ArrowRight size={20} className="rotate-180"/></NeoButton></Link>
             <h1 className="text-xl md:text-2xl font-black">NGO<span className="text-green-600">Dashboard</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full border-2 border-dark font-bold bg-green-100">
                <Leaf size={18} className="text-green-600"/> 
                <span>Active NGO</span>
            </div>
            <button className="md:hidden p-2 border-2 border-dark rounded-lg bg-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                <Menu size={24}/>
            </button>
             <NeoButton onClick={handleLogout} variant="danger" className="text-sm py-2 px-4 hidden md:flex">Logout</NeoButton>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        
        {/* SIDEBAR */}
        <aside className={`
            absolute md:static top-0 left-0 h-full w-64 bg-white border-r-2 border-dark p-4 space-y-3 transition-transform duration-300 z-40
            ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
             <button onClick={() => {setActiveTab('feed'); setMobileMenuOpen(false);}} className={`w-full text-left p-4 font-bold border-2 border-dark rounded-xl flex items-center gap-3 transition-all ${activeTab === 'feed' ? 'bg-primary shadow-neo translate-x-1' : 'bg-white hover:bg-gray-50'}`}>
                <Compass size={20}/> Live Feed
             </button>

             <button onClick={() => {setActiveTab('pickups'); setMobileMenuOpen(false);}} className={`w-full text-left p-4 font-bold border-2 border-dark rounded-xl flex items-center gap-3 transition-all ${activeTab === 'pickups' ? 'bg-yellow-300 shadow-neo translate-x-1' : 'bg-white hover:bg-gray-50'}`}>
                <ShoppingBag size={20}/> My Pickups
                {activePickups.length > 0 && <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{activePickups.length}</span>}
             </button>

             <button onClick={() => {setActiveTab('history'); setMobileMenuOpen(false);}} className={`w-full text-left p-4 font-bold border-2 border-dark rounded-xl flex items-center gap-3 transition-all ${activeTab === 'history' ? 'bg-blue-300 shadow-neo translate-x-1' : 'bg-white hover:bg-gray-50'}`}>
                <History size={20}/> History
             </button>
             
             <div className="mt-auto pt-8 md:hidden">
                <NeoButton onClick={handleLogout} variant="danger" className="w-full">Logout</NeoButton>
             </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 overflow-hidden relative bg-gray-100 w-full">
            
            {activeTab === 'feed' && (
                <div className="flex flex-col md:flex-row h-full">
                    <div className="w-full md:w-1/3 p-4 overflow-y-auto custom-scrollbar space-y-4 pb-20 md:pb-4">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-xl font-black flex items-center gap-2">Available <span className="bg-dark text-white px-2 rounded-full text-sm">{sortedDonations.length}</span></h2>
                        </div>

                        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase text-blue-800">AI Best Picks</p>
                                    <p className="text-xs font-bold text-gray-600">Get top pickups based on distance and freshness.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <NeoButton
                                        onClick={handleAiPickups}
                                        disabled={!hasAi || aiPickupsLoading}
                                        className="px-3 py-2 text-xs"
                                    >
                                        {aiPickupsLoading ? 'Thinking...' : 'Suggest'}
                                    </NeoButton>
                                    <button
                                        type="button"
                                        onClick={() => openChat('Suggest best pickup strategy for an NGO on OneMeal.')}
                                        className="text-[10px] font-bold px-2 py-1 border-2 border-dark rounded-lg bg-white hover:bg-gray-50"
                                    >
                                        Ask AI
                                    </button>
                                </div>
                            </div>

                            {!hasAi && (
                                <p className="mt-2 text-[10px] font-bold text-red-600">
                                    AI suggestions are temporarily unavailable.
                                </p>
                            )}
                            {aiPickupsError && (
                                <p className="mt-2 text-[10px] font-bold text-red-600">{aiPickupsError}</p>
                            )}
                            {aiPickups.length > 0 && (
                                <ul className="mt-2 space-y-1 text-[11px] font-bold text-gray-700">
                                    {aiPickups.map((pick, idx) => (
                                        <li key={`${pick}-${idx}`} className="flex items-start gap-2">
                                            <span className="mt-1 h-2 w-2 rounded-full bg-blue-600" />
                                            <span>{pick}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        
                        {loading ? (
                             <div className="space-y-4">
                                {[1,2,3].map(i => <div key={i} className="h-40 bg-gray-200 rounded-xl animate-pulse"></div>)}
                             </div>
                        ) : sortedDonations.length === 0 ? (
                            <div className="text-center p-8 border-2 border-dashed border-gray-400 rounded-xl">
                                <AlertCircle className="mx-auto mb-2 text-gray-400" size={32} />
                                <p className="font-bold text-gray-500">No food available right now.</p>
                            </div>
                        ) : (
                            sortedDonations.map((food) => (
                                <FoodCard 
                                    key={food.id} 
                                    data={food} 
                                    ngoLocation={ngoLocation}
                                    isSelected={selectedDonation === food.id}
                                    onFocus={() => setSelectedDonation(food.id)}
                                />
                            ))
                        )}
                    </div>

                    {/* Map Section */}
                    <div className="hidden md:block w-2/3 h-full border-l-2 border-dark relative">
                         {!ngoLocation ? (
                            <div className="h-full w-full flex items-center justify-center bg-gray-50">
                                <p className="font-bold text-gray-500 animate-pulse flex items-center gap-2">
                                    <RefreshCw className="animate-spin" /> Locating you on map...
                                </p>
                            </div>
                         ) : (
                            <MapContainer 
                                center={[ngoLocation.lat, ngoLocation.lng]} 
                                zoom={13} 
                                style={{ height: "100%", width: "100%" }}
                            >
                                <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <Marker position={[ngoLocation.lat, ngoLocation.lng]} icon={UserIcon}>
                                    <Popup><b>You are here</b></Popup>
                                </Marker>

                                {sortedDonations.map((food) => (
                                    food.location && food.location.lat ? (
                                        <Marker 
                                            key={food.id} 
                                            position={[food.location.lat, food.location.lng]}
                                            icon={FoodIcon}
                                            eventHandlers={{ click: () => setSelectedDonation(food.id) }}
                                        >
                                            <Popup>
                                                <div className="p-1">
                                                    <h3 className="font-bold text-sm">{food.foodItem}</h3>
                                                    <p className="text-xs">Qty: {food.quantity}</p>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    ) : null
                                ))}
                                {selectedDonation && (() => {
                                    const target = sortedDonations.find(d => d.id === selectedDonation);
                                    return target?.location ? <MapUpdater center={target.location} /> : null;
                                })()}
                            </MapContainer>
                         )}
                         <div className="absolute bottom-6 right-6 bg-white/90 border-2 border-dark p-3 rounded-xl shadow-neo z-[400] text-xs font-bold">
                            <div className="flex items-center gap-2 mb-1"><Navigation className="text-blue-600 fill-blue-600" size={14} /> You</div>
                            <div className="flex items-center gap-2"><MapPin className="text-green-600 fill-green-600" size={14} /> Food</div>
                         </div>
                    </div>
                </div>
            )}

            {activeTab === 'pickups' && (
                <div className="p-4 md:p-8 overflow-y-auto h-full">
                    <h2 className="text-3xl font-black mb-6 flex items-center gap-2"><ShoppingBag size={32} className="text-yellow-600"/> Active Pickups</h2>
                    {activePickups.length === 0 ? (
                        <div className="text-center py-12 text-gray-500 font-bold border-2 border-dashed border-gray-300 rounded-xl">
                            You haven't claimed any food yet. Go to Live Feed!
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {activePickups.map((item) => (
                                <div key={item.id} className="bg-yellow-50 border-4 border-yellow-400 p-6 rounded-2xl shadow-neo relative">
                                    <div className="absolute -top-3 -right-3 bg-red-500 text-white font-black px-3 py-1 rounded-full border-2 border-black animate-pulse">
                                        OTP: {pickupOtps[item.id] || 'Pending'}
                                    </div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-black text-xl">{item.foodItem}</h3>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${item.pickupPreference === 'flexible' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                                            {item.pickupPreference === 'flexible' ? 'FLEXIBLE' : 'ASAP'}
                                        </span>
                                    </div>
                                    <p className="text-gray-700 font-medium text-sm mb-2">{item.quantity} - {item.address}</p>
                                    <p className="text-xs font-bold text-gray-500 mb-3">Listed: {formatShortTime(item.createdAt || item.createdAtClient)}</p>
                                    
                                    <div className="bg-white p-3 rounded-xl border-2 border-yellow-200">
                                        <p className="text-xs font-bold text-gray-500 uppercase">Donor Phone</p>
                                        <p className="font-black text-lg tracking-wider">{item.phone}</p>
                                        <a href={`tel:${item.phone}`} className="block mt-2 text-center bg-black text-white text-sm font-bold py-2 rounded-lg">Call Donor</a>
                                    </div>
                                    <p className="mt-4 text-xs font-bold text-center text-yellow-800">
                                        Show OTP to donor to verify pickup.
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="p-4 md:p-8 overflow-y-auto h-full">
                    <h2 className="text-3xl font-black mb-6 flex items-center gap-2"><History size={32} className="text-blue-600"/> Pickup History</h2>
                    <div className="space-y-4">
                        {historyPickups.map((item) => (
                             <div key={item.id} className="bg-white border-2 border-dark p-4 rounded-xl flex justify-between items-center shadow-sm">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-black text-lg">{item.foodItem}</h3>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${item.pickupPreference === 'flexible' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                                            {item.pickupPreference === 'flexible' ? 'FLEXIBLE' : 'ASAP'}
                                        </span>
                                    </div>
                                    <p className="text-gray-500 text-sm font-bold">{item.address}</p>
                                    <p className="text-xs text-gray-400 font-bold">Listed: {formatShortTime(item.createdAt || item.createdAtClient)}</p>
                                </div>
                                <div className="flex items-center gap-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-black border border-green-200">
                                    <CheckCircle size={14}/> COMPLETED
                                </div>
                             </div>
                        ))}
                        {historyPickups.length === 0 && (
                            <div className="text-center py-10 text-gray-400 font-bold">No history found.</div>
                        )}
                    </div>
                </div>
            )}
            
        </main>
      </div>
    </div>
  );
};


const FoodCard = ({ data, ngoLocation, isSelected, onFocus }: any) => {
  const [claimed, setClaimed] = useState(false);
  const [reporting, setReporting] = useState(false); 
  const cardRef = useRef<HTMLDivElement>(null);
  const isOnWay = data?.status === 'on_way';
  const claimDisabled = claimed || reporting || isOnWay;

  useEffect(() => {
    if (isSelected && cardRef.current) {
        cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isSelected]);

  const distance = (data.location && ngoLocation) 
    ? calculateDistance(ngoLocation.lat, ngoLocation.lng, data.location.lat, data.location.lng)
    : null;

  const getTimeAgo = (timestamp: any, fallback?: any) => {
      const date = toDateSafe(timestamp) || toDateSafe(fallback);
      if (!date) return "Just now";
      const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
      if (seconds < 60) return `${seconds}s ago`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
  };

  const handleClaim = async () => {
    if (data?.status !== 'available') {
      toast.error('Pickup already in progress.');
      return;
    }
    if (!auth.currentUser) {
      toast.error('Please sign in again.');
      return;
    }
    try {
        setClaimed(true);
        const result = await claimDonation(data.id);
        toast.success(`Claimed. OTP ${result.otp} is now in My Pickups.`, { duration: 4000 });
    } catch (error) {
        console.error("Error claiming:", error);
        setClaimed(false);
        toast.error('Pickup could not be claimed.');
    }
  };

  const handleReport = async () => {
      const reason = window.prompt('Why are you reporting this donation?')?.trim();
      if(!reason) return;
      try {
          setReporting(true);
          await reportDonation(data.id, reason);
          toast.error("Donation reported.");
      } catch {
          toast.error("Error reporting.");
      } finally {
          setReporting(false);
      }
  };

  const openGoogleMaps = () => {
      if(data.location) {
          const url = `https://www.google.com/maps/dir/?api=1&destination=${data.location.lat},${data.location.lng}`;
          window.open(url, '_blank');
      } else {
          toast.error("No GPS coordinates.");
      }
  };

  return (
    <motion.div 
        ref={cardRef}
        onClick={onFocus}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onFocus();
          }
        }}
        layout
        initial={{ scale: 0.9, opacity: 0 }}
        whileHover={{ y: -4 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        animate={{ 
            scale: isSelected ? 1.02 : 1, 
            opacity: 1,
            borderColor: isSelected ? '#3b82f6' : '#171717',
        }}
        className={`bg-white border-2 rounded-xl p-4 shadow-neo relative overflow-hidden cursor-pointer transition-colors ${isSelected ? 'ring-4 ring-blue-100' : 'border-dark'}`}
    >
      {distance && (
          <div className="absolute top-0 left-0 bg-yellow-300 text-xs font-black px-2 py-1 border-r-2 border-b-2 border-dark rounded-br-lg z-10">
              {distance} km away
          </div>
      )}
      
      <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
         {data.foodType === 'non-veg' ? (
             <span className="flex items-center gap-1 bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full text-[10px] font-black">
                <Beef size={10} /> NON-VEG
             </span>
         ) : (
             <span className="flex items-center gap-1 bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full text-[10px] font-black">
                <Leaf size={10} /> VEG
             </span>
         )}
         {isOnWay && (
             <span className="flex items-center gap-1 bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full text-[10px] font-black">
                <Navigation size={10} /> ON WAY
             </span>
         )}
         <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${data.pickupPreference === 'flexible' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
            {data.pickupPreference === 'flexible' ? 'FLEXIBLE' : 'ASAP'}
         </span>
      </div>

      <h3 className="font-black text-xl mb-1 pr-16 mt-5">{data.foodItem}</h3>
      <p className="text-gray-700 font-bold mb-3 text-sm flex items-center gap-2">
         <span className="bg-gray-100 px-2 py-0.5 rounded text-dark border border-gray-300 text-xs">Qty: {data.quantity}</span>
         <span className="text-gray-400 text-xs">- {data.donorName}</span>
      </p>

      <div className="flex items-start gap-2 text-sm font-medium text-gray-600 mb-3 bg-gray-50 p-2 rounded border border-gray-200">
         <MapPin size={16} className="mt-0.5 min-w-[16px] text-primary" />
         <span className="line-clamp-2 leading-tight">{data.address}</span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs font-bold text-gray-400 mb-4">
        <span className="flex items-center gap-1"><Clock size={12} /> {getTimeAgo(data.createdAt, data.createdAtClient)}</span>
        <span>Listed: {formatShortTime(data.createdAt || data.createdAtClient)}</span>
      </div>
      
      <div className="grid grid-cols-5 gap-2">
          {data.phone && (
             <a href={`tel:${data.phone}`} onClick={(e) => e.stopPropagation()} className="col-span-1 bg-white border-2 border-dark rounded-lg flex items-center justify-center hover:bg-gray-100 h-10 transition-transform hover:scale-105">
                <Phone size={18} />
             </a>
          )}
          <button 
             onClick={(e) => { e.stopPropagation(); openGoogleMaps(); }} 
             className="col-span-1 bg-blue-100 border-2 border-blue-600 text-blue-700 rounded-lg flex items-center justify-center hover:bg-blue-200 h-10 transition-transform hover:scale-105"
             title="Navigate"
          >
             <Navigation size={18} />
          </button>

          <button 
            onClick={(e) => { e.stopPropagation(); handleReport(); }}
            disabled={reporting || claimed}
            className="col-span-1 bg-red-100 border-2 border-red-500 text-red-600 rounded-lg flex items-center justify-center hover:bg-red-200 h-10 transition-transform hover:scale-105"
            title="Report"
          >
            <AlertCircle size={18} />
          </button>
          
          <NeoButton 
            onClick={(e) => { e.stopPropagation(); handleClaim(); }} 
            disabled={claimDisabled}
            className={`col-span-2 w-full text-sm py-2 flex items-center justify-center gap-2 h-10 ${claimDisabled ? 'bg-gray-300 border-gray-500 text-gray-600 shadow-none' : ''}`}
          >
            {isOnWay ? <><LockKeyhole size={16}/> On Way</> : claimed ? <LockKeyhole size={16}/> : <>Claim <ArrowRight size={16}/></>}
          </NeoButton>
      </div>
    </motion.div>
  );
};

export default ReceiverDashboard;
