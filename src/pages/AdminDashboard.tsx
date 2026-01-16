import { useEffect, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, query, orderBy, deleteDoc } from 'firebase/firestore';
import { Users, Megaphone, Ban, CheckCircle, LogOut, Package, MapPin, Activity, AlertTriangle, ShieldAlert, MessageSquare, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NeoButton } from '../components/ui/NeoButton';
import toast from 'react-hot-toast';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'users' | 'announcement' | 'donations' | 'suggestions'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [donations, setDonations] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) {
        navigate('/admin');
        return;
    }
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const qDonations = query(collection(db, "donations"), orderBy("createdAt", "desc"));
    const unsubDonations = onSnapshot(qDonations, (snap) => {
      setDonations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
        console.error("Donation fetch error:", error);
        setLoading(false);
    });
    const qSuggestions = query(collection(db, "suggestions"), orderBy("createdAt", "desc"));
    const unsubSuggestions = onSnapshot(qSuggestions, (snap) => {
        setSuggestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubUsers(); unsubDonations(); unsubSuggestions(); };
  }, [navigate]);

  const toggleBan = async (userId: string, currentStatus: boolean) => {
      if(!window.confirm(`Are you sure you want to ${currentStatus ? 'Unban' : 'BAN'} this user?`)) return;
      try {
          await updateDoc(doc(db, "users", userId), { banned: !currentStatus });
          toast.success(currentStatus ? "User Unbanned ✅" : "User Banned 🚫");
      } catch(e) { toast.error("Error updating user"); }
  };

  const postAnnouncement = async () => {
      if(!announcement.trim()) return toast.error("Write something first!");
      try {
          await setDoc(doc(db, "system", "global"), { 
              message: announcement, 
              active: true,
              createdAt: new Date() 
          });
          toast.success("Announcement Live! 📢");
          setAnnouncement("");
      } catch(e) { toast.error("Failed to post"); }
  };

  const deleteSuggestion = async (id: string) => {
      if(!window.confirm("Delete this suggestion?")) return;
      try {
          await deleteDoc(doc(db, "suggestions", id));
          toast.success("Suggestion deleted");
      } catch(e) { toast.error("Error deleting"); }
  };

  const formatTime = (timestamp: any) => {
      if(!timestamp) return "N/A";
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString("en-IN", { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getStatusBadge = (status: any) => {
      const safeStatus = typeof status === 'string' ? status.toLowerCase() : 'unknown';
      switch(safeStatus) {
          case 'completed': return <span className="bg-green-200 text-green-900 px-2 py-1 rounded-md border-2 border-green-800 font-bold text-xs flex w-fit items-center gap-1"><CheckCircle size={12}/> DONE</span>;
          case 'claimed': return <span className="bg-blue-200 text-blue-900 px-2 py-1 rounded-md border-2 border-blue-800 font-bold text-xs flex w-fit items-center gap-1">🚚 ON WAY</span>;
          case 'available': return <span className="bg-yellow-200 text-yellow-900 px-2 py-1 rounded-md border-2 border-yellow-800 font-bold text-xs flex w-fit items-center gap-1">⏳ OPEN</span>;
          case 'reported': return <span className="bg-red-200 text-red-900 px-2 py-1 rounded-md border-2 border-red-800 font-bold text-xs flex w-fit items-center gap-1">⚠️ FAKE</span>;
          default: return <span className="bg-gray-200 text-gray-900 px-2 py-1 rounded-md border-2 border-gray-800 font-bold text-xs">{String(status || "UNKNOWN")}</span>;
      }
  };

  const bannedCount = users.filter(u => u.banned).length;
  const activeDonationsCount = donations.filter(d => d?.status === 'available').length;

  return (
    <div className="min-h-screen bg-grid-pattern font-sans pb-10 bg-gray-50">
      <div className="w-full bg-black text-white overflow-hidden py-2 border-b-4 border-dark mb-6 sticky top-0 z-50 shadow-md">
        <div className="animate-marquee whitespace-nowrap font-mono font-bold text-sm flex items-center gap-8">
            <span className="text-green-400">● SYSTEM ONLINE</span>
            <span>⚡ LOAD: 12%</span>
            <span>📍 REGION: INDIA</span>
            <span className="text-red-400">👮‍♂️ BANNED: {bannedCount}</span>
            <span className="text-yellow-400">📦 PENDING: {activeDonationsCount}</span>
            <span className="text-blue-400">👥 USERS: {users.length}</span>
            <span className="text-green-400">● SYSTEM ONLINE</span>
            <span>⚡ LOAD: 12%</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4">
        <div className="bg-white border-4 border-dark rounded-2xl p-6 shadow-neo mb-8 flex flex-col md:flex-row justify-between items-center relative overflow-hidden">
            <div className="z-10 relative">
                <div className="flex items-center gap-3 mb-2">
                    <div className="bg-red-500 text-white p-2 rounded-lg border-2 border-dark">
                        <ShieldAlert size={24} />
                    </div>
                    <h1 className="text-3xl font-black uppercase italic tracking-tighter">Command Center</h1>
                </div>
                <p className="text-gray-600 font-bold ml-1">Admin: {auth.currentUser?.email}</p>
            </div>
            
            <NeoButton onClick={() => { auth.signOut(); navigate('/'); }} variant="danger" className="text-sm z-10 mt-4 md:mt-0">
                <LogOut size={16} /> Logout
            </NeoButton>

            <Activity className="absolute right-[-20px] top-[-40px] text-gray-100 w-64 h-64 rotate-12 pointer-events-none" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-blue-100 border-4 border-dark rounded-xl p-5 shadow-neo flex items-center gap-4 transition-transform hover:-translate-y-1">
                <div className="bg-blue-500 text-white p-3 rounded-lg border-2 border-dark">
                    <Users size={32} />
                </div>
                <div>
                    <h3 className="font-black text-3xl">{users.length}</h3>
                    <p className="font-bold text-gray-600 text-sm">Total Users</p>
                </div>
            </div>

            <div className="bg-green-100 border-4 border-dark rounded-xl p-5 shadow-neo flex items-center gap-4 transition-transform hover:-translate-y-1">
                <div className="bg-green-500 text-white p-3 rounded-lg border-2 border-dark">
                    <Package size={32} />
                </div>
                <div>
                    <h3 className="font-black text-3xl">{donations.length}</h3>
                    <p className="font-bold text-gray-600 text-sm">Total Donations</p>
                </div>
            </div>

            <div className="bg-yellow-100 border-4 border-dark rounded-xl p-5 shadow-neo flex items-center gap-4 transition-transform hover:-translate-y-1">
                <div className="bg-yellow-500 text-white p-3 rounded-lg border-2 border-dark">
                    <MessageSquare size={32} />
                </div>
                <div>
                    <h3 className="font-black text-3xl">{suggestions.length}</h3>
                    <p className="font-bold text-gray-600 text-sm">New Suggestions</p>
                </div>
            </div>

            <div className="bg-red-100 border-4 border-dark rounded-xl p-5 shadow-neo flex items-center gap-4 transition-transform hover:-translate-y-1">
                <div className="bg-red-500 text-white p-3 rounded-lg border-2 border-dark">
                    <Ban size={32} />
                </div>
                <div>
                    <h3 className="font-black text-3xl">{bannedCount}</h3>
                    <p className="font-bold text-gray-600 text-sm">Banned Accounts</p>
                </div>
            </div>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
            <div className="space-y-4 h-fit sticky top-24 z-30">
                <button onClick={() => setActiveTab('users')} className={`w-full p-4 border-2 border-dark rounded-xl font-bold flex items-center gap-3 transition-all hover:translate-x-1 ${activeTab === 'users' ? 'bg-primary shadow-neo translate-x-1' : 'bg-white'}`}>
                    <Users size={20}/> Manage Users
                </button>
                <button onClick={() => setActiveTab('donations')} className={`w-full p-4 border-2 border-dark rounded-xl font-bold flex items-center gap-3 transition-all hover:translate-x-1 ${activeTab === 'donations' ? 'bg-green-400 shadow-neo translate-x-1' : 'bg-white'}`}>
                    <Package size={20}/> Food Tracking
                </button>
                <button onClick={() => setActiveTab('suggestions')} className={`w-full p-4 border-2 border-dark rounded-xl font-bold flex items-center gap-3 transition-all hover:translate-x-1 ${activeTab === 'suggestions' ? 'bg-purple-400 shadow-neo translate-x-1' : 'bg-white'}`}>
                    <MessageSquare size={20}/> Suggestions
                </button>
                <button onClick={() => setActiveTab('announcement')} className={`w-full p-4 border-2 border-dark rounded-xl font-bold flex items-center gap-3 transition-all hover:translate-x-1 ${activeTab === 'announcement' ? 'bg-yellow-400 shadow-neo translate-x-1' : 'bg-white'}`}>
                    <Megaphone size={20}/> Announcements
                </button>
            </div>

            <div className="md:col-span-3 bg-white border-4 border-dark rounded-2xl p-6 shadow-neo min-h-[500px]">
                {activeTab === 'users' && (
                    <div className="animate-fadeIn">
                        <div className="flex justify-between items-center mb-6 border-b-2 border-gray-100 pb-4">
                            <h2 className="text-2xl font-black flex items-center gap-2"><Users/> User Database</h2>
                            <span className="bg-gray-100 px-3 py-1 rounded-lg border-2 border-dark font-bold text-xs">{users.length} Records</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                                    <tr>
                                        <th className="p-3 border-b-2 border-gray-300">User</th>
                                        <th className="p-3 border-b-2 border-gray-300">Role</th>
                                        <th className="p-3 border-b-2 border-gray-300">Joined</th>
                                        <th className="p-3 border-b-2 border-gray-300">Status</th>
                                        <th className="p-3 border-b-2 border-gray-300 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => (
                                        <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                            <td className="p-3">
                                                <div className="font-black text-dark">{u.name || "Unknown"}</div>
                                                <div className="text-xs text-gray-500 font-bold">{u.email}</div>
                                            </td>
                                            <td className="p-3">
                                                <span className={`text-xs font-black px-2 py-1 rounded border ${u.role === 'admin' ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-gray-100 border-gray-300'}`}>
                                                    {u.role || 'USER'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-xs font-medium text-gray-500">
                                                {formatTime(u.createdAt)}
                                            </td>
                                            <td className="p-3">
                                                {u.banned 
                                                    ? <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-black border border-red-200">BANNED</span> 
                                                    : <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-black border border-green-200">ACTIVE</span>
                                                }
                                            </td>
                                            <td className="p-3 text-center">
                                                {u.role !== 'admin' && (
                                                    <button onClick={() => toggleBan(u.id, u.banned)} className="hover:scale-110 transition-transform active:scale-90" title="Ban/Unban">
                                                        {u.banned ? <CheckCircle className="text-green-600"/> : <Ban className="text-red-600"/>}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'donations' && (
                    <div className="animate-fadeIn">
                        <div className="flex justify-between items-center mb-6 border-b-2 border-gray-100 pb-4">
                            <h2 className="text-2xl font-black flex items-center gap-2"><Package/> Live Transactions</h2>
                            <span className="bg-green-100 px-3 py-1 rounded-lg border-2 border-green-800 font-bold text-xs text-green-900 animate-pulse">● LIVE UPDATES</span>
                        </div>
                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse relative">
                                <thead className="bg-gray-100 text-gray-600 uppercase text-xs sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 border-b-2 border-gray-300">Food Item</th>
                                        <th className="p-3 border-b-2 border-gray-300">Donor</th>
                                        <th className="p-3 border-b-2 border-gray-300">Status</th>
                                        <th className="p-3 border-b-2 border-gray-300">Location</th>
                                        <th className="p-3 border-b-2 border-gray-300">Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading && <tr><td colSpan={5} className="p-8 text-center font-bold">Loading Data...</td></tr>}
                                    {!loading && donations.length === 0 && (
                                        <tr><td colSpan={5} className="p-8 text-center text-gray-500 font-bold italic">No food donations detected yet! 📡</td></tr>
                                    )}
                                    {donations.map(d => (
                                    <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                        <td className="p-3">
                                            <div className="font-black text-gray-800 uppercase flex items-center gap-2">
                                                {d.foodItem}
                                                {d.verified && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded border border-blue-200">AI OK</span>}
                                            </div>
                                            {d.quantity && <span className="text-xs font-bold bg-gray-100 px-2 py-0.5 rounded text-gray-600">{d.quantity}</span>}
                                        </td>

                                        <td className="p-3">
                                            <div className="font-bold text-sm">{d.donorName || "Anonymous"}</div>
                                            <div className="text-xs text-gray-500 font-mono">{d.phone}</div>
                                        </td>

                                        <td className="p-3">
                                            {getStatusBadge(d.status)}
                                        </td>

                                        <td className="p-3 text-xs text-gray-600 font-bold max-w-[150px]">
                                            <div className="flex items-start gap-1">
                                                <MapPin size={14} className="mt-0.5 shrink-0 text-primary"/> 
                                                <span className="truncate" title={d.address}>
                                                    {d.address ? d.address.substring(0, 20) + "..." : "GPS Location"}
                                                </span>
                                            </div>
                                        </td>
                                        
                                        <td className="p-3 text-xs font-mono text-gray-500">
                                            {formatTime(d.createdAt)}
                                        </td>
                                    </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'suggestions' && (
                    <div className="animate-fadeIn">
                        <div className="flex justify-between items-center mb-6 border-b-2 border-gray-100 pb-4">
                            <h2 className="text-2xl font-black flex items-center gap-2"><MessageSquare/> User Suggestions</h2>
                        </div>
                        {suggestions.length === 0 ? (
                            <div className="text-center py-12 text-gray-500 font-bold">
                                No suggestions received yet.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {suggestions.map(s => (
                                    <div key={s.id} className="bg-purple-50 border-2 border-purple-200 p-4 rounded-xl relative group">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h4 className="font-black text-purple-900 text-lg">{s.title || "Suggestion"}</h4>
                                                <span className="text-xs font-bold text-purple-600">From: {s.userName || "Anonymous"}</span>
                                            </div>
                                            <span className="text-xs font-mono text-gray-500">{formatTime(s.createdAt)}</span>
                                        </div>
                                        <p className="text-gray-700 font-medium">{s.message}</p>
                                        
                                        <button 
                                            onClick={() => deleteSuggestion(s.id)}
                                            className="absolute bottom-4 right-4 bg-white border border-red-200 text-red-500 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                                            title="Delete Suggestion"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'announcement' && (
                    <div className="animate-fadeIn">
                        <h2 className="text-2xl font-black mb-6 flex items-center gap-2"><Megaphone/> Global Broadcast</h2>
                        
                        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-xl mb-6 shadow-sm">
                            <div className="flex gap-3">
                                <AlertTriangle className="text-yellow-600 shrink-0" />
                                <div>
                                    <p className="font-black text-yellow-800">Emergency Broadcast System</p>
                                    <p className="text-sm font-medium text-yellow-700 mt-1">
                                        Sending a message here will trigger a notification on <b>ALL</b> user screens immediately. 
                                        The message will automatically expire after 24 hours.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="relative">
                            <textarea 
                                className="w-full border-4 border-gray-200 rounded-xl p-4 font-bold h-40 outline-none focus:border-dark focus:bg-white bg-gray-50 transition-all text-lg resize-none"
                                placeholder="Type your alert message here... (e.g. Heavy rains in Solapur! Urgent food donations needed at Station Road.)"
                                value={announcement}
                                onChange={(e) => setAnnouncement(e.target.value)}
                            ></textarea>
                            <div className="absolute bottom-4 right-4 text-xs font-bold text-gray-400">
                                {announcement.length} chars
                            </div>
                        </div>

                        <NeoButton onClick={postAnnouncement} className="mt-6 w-full flex items-center justify-center gap-2 py-4 text-lg">
                            <Megaphone size={24} /> 
                            Publish Broadcast
                        </NeoButton>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;