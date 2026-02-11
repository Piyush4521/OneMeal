import { useEffect, useMemo, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, query, orderBy, deleteDoc } from 'firebase/firestore';
import { Users, Megaphone, Ban, CheckCircle, Coins, LogOut, Package, MapPin, Activity, AlertTriangle, ShieldAlert, MessageSquare, Trash2, Search, Download, Filter, RefreshCcw, Clock, TrendingUp, Layers, Eye, EyeOff, UserCheck, UserX, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NeoButton } from '../components/ui/NeoButton';
import toast from 'react-hot-toast';
import { generateText, isGeminiConfigured } from '../lib/aiClient';
import { openChat } from '../lib/chatEvents';

const ANNOUNCEMENT_TEMPLATES = [
  { label: 'Weather Alert', message: 'Severe weather expected. Please prioritize sealed and dry food donations at main pickup hubs.' },
  { label: 'Urgent Need', message: 'Urgent: Food shortage reported. Volunteers needed for immediate pickup and delivery support.' },
  { label: 'Pickup Delay', message: 'Notice: Pickup delays due to road closures. Please coordinate drop-offs at alternate routes.' },
  { label: 'Safety Notice', message: 'Safety reminder: Label items clearly and ensure packages are sealed for safe distribution.' },
];

type ActivityItem =
  | {
      type: 'donation';
      title: string;
      meta: string;
      time: number;
      status?: string;
      pickupPreference?: string;
    }
  | {
      type: 'money';
      title: string;
      meta: string;
      time: number;
      amount?: number;
      status?: string;
    }
  | {
      type: 'suggestion';
      title: string;
      meta: string;
      time: number;
    }
  | {
      type: 'user';
      title: string;
      meta: string;
      time: number;
      banned?: boolean;
    };

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'users' | 'announcement' | 'donations' | 'suggestions' | 'issues' | 'money'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [donations, setDonations] = useState<any[]>([]);
  const [moneyDonations, setMoneyDonations] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [loading, setLoading] = useState(true);
  const [userQuery, setUserQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'banned'>('all');
  const [donationQuery, setDonationQuery] = useState('');
  const [donationStatusFilter, setDonationStatusFilter] = useState<'all' | 'available' | 'on_way' | 'claimed' | 'completed' | 'reported'>('all');
  const [donationVerifiedFilter, setDonationVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [moneyQuery, setMoneyQuery] = useState('');
  const [moneyStatusFilter, setMoneyStatusFilter] = useState<'all' | 'pledged' | 'paid'>('all');
  const [moneySort, setMoneySort] = useState<'recent' | 'amount'>('recent');
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [suggestionSort, setSuggestionSort] = useState<'none' | 'recent' | 'oldest'>('none');
  const [announcePreview, setAnnouncePreview] = useState(true);
  const [announceSaving, setAnnounceSaving] = useState(false);
  const [announcementHistory, setAnnouncementHistory] = useState<{ message: string; createdAt: string }[]>([]);
  const [lastAnnouncementAt, setLastAnnouncementAt] = useState<Date | null>(null);
  const [lastUsersSync, setLastUsersSync] = useState<Date | null>(null);
  const [lastDonationsSync, setLastDonationsSync] = useState<Date | null>(null);
  const [lastMoneySync, setLastMoneySync] = useState<Date | null>(null);
  const [lastSuggestionsSync, setLastSuggestionsSync] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [aiSummary, setAiSummary] = useState<string[]>([]);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);
  const [aiIssueSummary, setAiIssueSummary] = useState<string[]>([]);
  const [aiIssueLoading, setAiIssueLoading] = useState(false);
  const [aiIssueError, setAiIssueError] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('admin:lastAnnouncementAt');
    if (stored) setLastAnnouncementAt(new Date(stored));
    const historyRaw = localStorage.getItem('admin:announcementHistory');
    if (historyRaw) {
      try {
        const parsed = JSON.parse(historyRaw);
        if (Array.isArray(parsed)) setAnnouncementHistory(parsed);
      } catch (e) {
        console.warn('Invalid announcement history cache');
      }
    }
  }, []);

  useEffect(() => {
    if (!auth.currentUser) {
        navigate('/admin');
        return;
    }
    setLoading(true);
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLastUsersSync(new Date());
    }, (error) => {
      console.error("User fetch error:", error);
      toast.error("User sync failed");
    });
    const qDonations = query(collection(db, "donations"), orderBy("createdAt", "desc"));
    const unsubDonations = onSnapshot(qDonations, (snap) => {
      setDonations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
      setLastDonationsSync(new Date());
    }, (error) => {
        console.error("Donation fetch error:", error);
        setLoading(false);
    });
    const qMoney = query(collection(db, "moneyDonations"), orderBy("createdAt", "desc"));
    const unsubMoney = onSnapshot(qMoney, (snap) => {
        setMoneyDonations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLastMoneySync(new Date());
    }, (error) => {
        console.error("Money donations fetch error:", error);
    });
    const qSuggestions = query(collection(db, "suggestions"), orderBy("createdAt", "desc"));
    const unsubSuggestions = onSnapshot(qSuggestions, (snap) => {
        setSuggestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLastSuggestionsSync(new Date());
    }, (error) => {
        console.error("Suggestion fetch error:", error);
        toast.error("Suggestion sync failed");
    });

    return () => { unsubUsers(); unsubDonations(); unsubMoney(); unsubSuggestions(); };
  }, [navigate, refreshTick]);

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

  const getTimeValue = (timestamp: any) => {
      const date = toDateSafe(timestamp);
      return date ? date.getTime() : 0;
  };

  const toggleBan = async (userId: string, currentStatus: boolean) => {
      if(!window.confirm(`Are you sure you want to ${currentStatus ? 'Unban' : 'BAN'} this user?`)) return;
      try {
          await updateDoc(doc(db, "users", userId), { banned: !currentStatus });
          toast.success(currentStatus ? "User Unbanned ?" : "User Banned ??");
      } catch(e) { toast.error("Error updating user"); }
  };

  const postAnnouncement = async () => {
      if(!announcement.trim()) return toast.error("Write something first!");
      const message = announcement.trim();
      setAnnounceSaving(true);
      try {
          await setDoc(doc(db, "system", "global"), { 
              message,
              active: true,
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          });
          const now = new Date();
          setLastAnnouncementAt(now);
          localStorage.setItem('admin:lastAnnouncementAt', now.toISOString());
          setAnnouncementHistory((prev) => {
              const next = [{ message, createdAt: now.toISOString() }, ...prev].slice(0, 6);
              localStorage.setItem('admin:announcementHistory', JSON.stringify(next));
              return next;
          });
          toast.success("Announcement Live! ??");
          setAnnouncement("");
      } catch(e) { toast.error("Failed to post"); }
      finally { setAnnounceSaving(false); }
  };

  const deleteSuggestion = async (id: string) => {
      if(!window.confirm("Delete this suggestion?")) return;
      try {
          await deleteDoc(doc(db, "suggestions", id));
          toast.success("Suggestion deleted");
      } catch(e) { toast.error("Error deleting"); }
  };

  const reopenReportedDonation = async (donationId: string) => {
      if(!window.confirm("Reopen this donation? It will become available again.")) return;
      try {
          await updateDoc(doc(db, "donations", donationId), {
              status: "available",
              reportedResolvedAt: new Date(),
              reportedResolvedBy: auth.currentUser?.uid || "admin"
          });
          toast.success("Donation reopened");
      } catch(e) { toast.error("Failed to reopen"); }
  };

  const removeReportedDonation = async (donationId: string) => {
      if(!window.confirm("Remove this donation permanently?")) return;
      try {
          await deleteDoc(doc(db, "donations", donationId));
          toast.success("Donation removed");
      } catch(e) { toast.error("Failed to remove"); }
  };

  const formatTime = (timestamp: any) => {
      if(!timestamp) return "N/A";
      const date = toDateSafe(timestamp);
      if(!date) return "N/A";
      return date.toLocaleDateString("en-IN", { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatDonationTime = (donation: any) => {
      return formatTime(donation?.createdAt || donation?.createdAtClient);
  };

  const getMoneyAmount = (entry: any) => {
      const raw = entry?.amount ?? entry?.value ?? entry?.total ?? 0;
      const amount = Number(raw);
      return Number.isFinite(amount) ? amount : 0;
  };

  const formatMoneyAmount = (amount: number, currency = 'INR') => {
      try {
          return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
      } catch (e) {
          return `${currency} ${Math.round(amount)}`;
      }
  };

  const getStatusBadge = (status: any) => {
      const safeStatus = typeof status === 'string' ? status.toLowerCase() : 'unknown';
      switch(safeStatus) {
          case 'completed': return <span className="bg-green-200 text-green-900 px-2 py-1 rounded-md border-2 border-green-800 font-bold text-xs flex w-fit items-center gap-1"><CheckCircle size={12}/> DONE</span>;
          case 'on_way': return <span className="bg-blue-200 text-blue-900 px-2 py-1 rounded-md border-2 border-blue-800 font-bold text-xs flex w-fit items-center gap-1">?? ON WAY</span>;
          case 'claimed': return <span className="bg-purple-200 text-purple-900 px-2 py-1 rounded-md border-2 border-purple-800 font-bold text-xs flex w-fit items-center gap-1"><ShieldCheck size={12}/> CLAIMED</span>;
          case 'available': return <span className="bg-yellow-200 text-yellow-900 px-2 py-1 rounded-md border-2 border-yellow-800 font-bold text-xs flex w-fit items-center gap-1">? OPEN</span>;
          case 'reported': return <span className="bg-red-200 text-red-900 px-2 py-1 rounded-md border-2 border-red-800 font-bold text-xs flex w-fit items-center gap-1">?? FAKE</span>;
          default: return <span className="bg-gray-200 text-gray-900 px-2 py-1 rounded-md border-2 border-gray-800 font-bold text-xs">{String(status || "UNKNOWN")}</span>;
      }
  };

  const getMoneyStatusBadge = (status: any) => {
      const safeStatus = typeof status === 'string' ? status.toLowerCase() : 'pledged';
      switch(safeStatus) {
          case 'paid': return <span className="bg-green-200 text-green-900 px-2 py-1 rounded-md border-2 border-green-800 font-bold text-xs">PAID</span>;
          case 'pledged': return <span className="bg-yellow-200 text-yellow-900 px-2 py-1 rounded-md border-2 border-yellow-800 font-bold text-xs">PLEDGED</span>;
          default: return <span className="bg-gray-200 text-gray-900 px-2 py-1 rounded-md border-2 border-gray-800 font-bold text-xs">{String(status || "UNKNOWN")}</span>;
      }
  };

  const downloadCsv = (filename: string, rows: Record<string, any>[]) => {
      if(!rows.length) {
          toast.error("Nothing to export");
          return;
      }
      const headers = Object.keys(rows[0]);
      const escapeValue = (value: any) => {
          if(value === null || value === undefined) return '';
          const str = String(value);
          if(str.includes('"') || str.includes(',') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
      };
      const csv = [
          headers.join(','),
          ...rows.map(row => headers.map(h => escapeValue(row[h])).join(','))
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
  };

  const resetUserFilters = () => {
      setUserQuery('');
      setUserRoleFilter('all');
      setUserStatusFilter('all');
  };

  const resetDonationFilters = () => {
      setDonationQuery('');
      setDonationStatusFilter('all');
      setDonationVerifiedFilter('all');
  };

  const resetMoneyFilters = () => {
      setMoneyQuery('');
      setMoneyStatusFilter('all');
      setMoneySort('recent');
  };

  const resetSuggestionFilters = () => {
      setSuggestionQuery('');
      setSuggestionSort('none');
  };

  const handleRefreshStreams = () => {
      setRefreshTick((tick) => tick + 1);
      toast.success("Refreshing live streams");
  };

  const filteredUsers = useMemo(() => {
      const queryText = userQuery.trim().toLowerCase();
      return users.filter((u) => {
          const haystack = `${u.name || ''} ${u.email || ''} ${u.phone || ''}`.toLowerCase();
          const matchesQuery = !queryText || haystack.includes(queryText);
          const matchesRole = userRoleFilter === 'all' || (userRoleFilter === 'admin' ? u.role === 'admin' : u.role !== 'admin');
          const matchesStatus = userStatusFilter === 'all' || (userStatusFilter === 'banned' ? u.banned : !u.banned);
          return matchesQuery && matchesRole && matchesStatus;
      });
  }, [users, userQuery, userRoleFilter, userStatusFilter]);

  const filteredDonations = useMemo(() => {
      const queryText = donationQuery.trim().toLowerCase();
      return donations.filter((d) => {
          const haystack = `${d.foodItem || ''} ${d.donorName || ''} ${d.phone || ''} ${d.address || ''}`.toLowerCase();
          const matchesQuery = !queryText || haystack.includes(queryText);
          const matchesStatus = donationStatusFilter === 'all' || d.status === donationStatusFilter;
          const matchesVerified = donationVerifiedFilter === 'all' || (donationVerifiedFilter === 'verified' ? d.verified : !d.verified);
          return matchesQuery && matchesStatus && matchesVerified;
      });
  }, [donations, donationQuery, donationStatusFilter, donationVerifiedFilter]);

  const filteredMoneyDonations = useMemo(() => {
      const queryText = moneyQuery.trim().toLowerCase();
      const base = moneyDonations.filter((m) => {
          const haystack = `${m.donorName || ''} ${m.message || ''} ${m.donorId || ''}`.toLowerCase();
          const matchesQuery = !queryText || haystack.includes(queryText);
          const status = typeof m.status === 'string' ? m.status.toLowerCase() : 'pledged';
          const matchesStatus = moneyStatusFilter === 'all' || status === moneyStatusFilter;
          return matchesQuery && matchesStatus;
      });
      const sorted = [...base];
      sorted.sort((a, b) => {
          if (moneySort === 'amount') {
              return getMoneyAmount(b) - getMoneyAmount(a);
          }
          return getTimeValue(b.createdAt) - getTimeValue(a.createdAt);
      });
      return sorted;
  }, [moneyDonations, moneyQuery, moneyStatusFilter, moneySort]);

  const filteredSuggestions = useMemo(() => {
      const queryText = suggestionQuery.trim().toLowerCase();
      const base = suggestions.filter((s) => {
          const haystack = `${s.title || ''} ${s.message || ''} ${s.userName || ''}`.toLowerCase();
          return !queryText || haystack.includes(queryText);
      });
      if(suggestionSort === 'none') return base;
      const sorted = [...base];
      sorted.sort((a, b) => suggestionSort === 'recent'
          ? getTimeValue(b.createdAt) - getTimeValue(a.createdAt)
          : getTimeValue(a.createdAt) - getTimeValue(b.createdAt)
      );
      return sorted;
  }, [suggestions, suggestionQuery, suggestionSort]);

  const userStats = useMemo(() => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      let recent = 0;
      let admins = 0;
      users.forEach((u) => {
          if(u.role === 'admin') admins += 1;
          if(getTimeValue(u.createdAt) >= cutoff) recent += 1;
      });
      return { recent, admins };
  }, [users]);

  const donationStats = useMemo(() => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const stats = { available: 0, claimed: 0, completed: 0, reported: 0, verified: 0, recent: 0 };
      donations.forEach((d) => {
          const status = typeof d.status === 'string' ? d.status.toLowerCase() : 'unknown';
          if(status === 'available') stats.available += 1;
          if(status === 'claimed' || status === 'on_way') stats.claimed += 1;
          if(status === 'completed') stats.completed += 1;
          if(status === 'reported') stats.reported += 1;
          if(d.verified) stats.verified += 1;
          if(getTimeValue(d.createdAt) >= cutoff) stats.recent += 1;
      });
      return stats;
  }, [donations]);

  const moneyStats = useMemo(() => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      let total = 0;
      let pledged = 0;
      let paid = 0;
      let recent = 0;
      const donors = new Set<string>();
      moneyDonations.forEach((m) => {
          const amount = getMoneyAmount(m);
          total += amount;
          const status = typeof m.status === 'string' ? m.status.toLowerCase() : 'pledged';
          if (status === 'paid') {
              paid += 1;
          } else {
              pledged += 1;
          }
          if (getTimeValue(m.createdAt) >= cutoff) recent += 1;
          const donorKey = m.donorId || m.donorName;
          if (donorKey) donors.add(String(donorKey));
      });
      return { total, pledged, paid, recent, donors: donors.size };
  }, [moneyDonations]);

  const reportedDonations = useMemo(() => {
      return donations.filter((d) => (d.status || '').toLowerCase() === 'reported');
  }, [donations]);

  const suggestionStats = useMemo(() => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      let recent = 0;
      let withTitle = 0;
      suggestions.forEach((s) => {
          if(s.title) withTitle += 1;
          if(getTimeValue(s.createdAt) >= cutoff) recent += 1;
      });
      return { recent, withTitle };
  }, [suggestions]);

  const hasAi = isGeminiConfigured();

  const parseAiLines = (text: string) =>
      text
          .split('\n')
          .map((line) => line.replace(/^[-*]\s?/, '').trim())
          .filter(Boolean)
          .slice(0, 5);

  const handleAiSummary = async () => {
      if (!hasAi) {
          toast.error('AI summary needs VITE_GEMINI_API_KEY.');
          return;
      }
      if (!filteredSuggestions.length) {
          setAiSummary([]);
          setAiSummaryError('No suggestions available for summary.');
          return;
      }

      setAiSummaryLoading(true);
      setAiSummaryError(null);
      setAiSummary([]);
      try {
          const sample = filteredSuggestions.slice(0, 8).map((s, idx) => {
              return `#${idx + 1} ${s.title || 'Suggestion'}: ${s.message || ''}`.slice(0, 140);
          }).join('\n');

          const prompt = [
              'You are an admin assistant.',
              'Summarize main themes and urgent items from these suggestions.',
              'Return 4 short bullets, each starting with "- ".',
              sample
          ].join('\n');

          const reply = await generateText({ prompt, maxOutputTokens: 180 });
          const lines = parseAiLines(reply);
          if (!lines.length) {
              setAiSummaryError('AI summary empty. Try again.');
          } else {
              setAiSummary(lines);
          }
      } catch (error) {
          console.error('AI summary error:', error);
          setAiSummaryError('AI summary failed. Please retry.');
      } finally {
          setAiSummaryLoading(false);
      }
  };

  const handleAiIssues = async () => {
      if (!hasAi) {
          toast.error('AI insights need VITE_GEMINI_API_KEY.');
          return;
      }
      if (!reportedDonations.length) {
          setAiIssueSummary([]);
          setAiIssueError('No reported donations to analyze.');
          return;
      }

      setAiIssueLoading(true);
      setAiIssueError(null);
      setAiIssueSummary([]);
      try {
          const sample = reportedDonations.slice(0, 6).map((d, idx) => {
              return `#${idx + 1} ${d.foodItem || 'Donation'} | ${d.quantity || 'qty?'} | ${d.donorName || 'donor?'} | ${d.address || 'location?'}`;
          }).join('\n');

          const prompt = [
              'You are an admin assistant.',
              'Identify patterns or risks from reported donations.',
              'Return 3 short bullets, each starting with "- ".',
              sample
          ].join('\n');

          const reply = await generateText({ prompt, maxOutputTokens: 160 });
          const lines = parseAiLines(reply);
          if (!lines.length) {
              setAiIssueError('AI insight empty. Try again.');
          } else {
              setAiIssueSummary(lines);
          }
      } catch (error) {
          console.error('AI issue error:', error);
          setAiIssueError('AI insights failed. Please retry.');
      } finally {
          setAiIssueLoading(false);
      }
  };

  const activityFeed = useMemo(() => {
      const items: ActivityItem[] = [
          ...donations.map((d) => ({
              type: 'donation' as const,
              title: d.foodItem || 'Donation',
              meta: d.donorName || 'Anonymous',
              time: getTimeValue(d.createdAt),
              status: d.status,
              pickupPreference: d.pickupPreference
          })),
          ...moneyDonations.map((m) => {
              const amount = getMoneyAmount(m);
              const currency = typeof m.currency === 'string' ? m.currency : 'INR';
              const status = typeof m.status === 'string' ? m.status.toUpperCase() : 'PLEDGED';
              return ({
                  type: 'money' as const,
                  title: m.donorName || 'Money donation',
                  meta: `${formatMoneyAmount(amount, currency)} • ${status}`,
                  time: getTimeValue(m.createdAt),
                  amount,
                  status: m.status
              });
          }),
          ...suggestions.map((s) => ({
              type: 'suggestion' as const,
              title: s.title || 'Suggestion',
              meta: s.userName || 'Anonymous',
              time: getTimeValue(s.createdAt)
          })),
          ...users.map((u) => ({
              type: 'user' as const,
              title: u.name || 'User',
              meta: u.email || 'No email',
              time: getTimeValue(u.createdAt),
              banned: u.banned
          })),
      ];
      return items.sort((a, b) => b.time - a.time).slice(0, 8);
  }, [donations, moneyDonations, suggestions, users]);

  const lastAnnouncementExpiresAt = useMemo(() => {
      if(!lastAnnouncementAt) return null;
      return new Date(lastAnnouncementAt.getTime() + 24 * 60 * 60 * 1000);
  }, [lastAnnouncementAt]);

  const exportUsersCsv = () => {
      downloadCsv('users.csv', filteredUsers.map((u) => ({
          id: u.id,
          name: u.name || '',
          email: u.email || '',
          role: u.role || 'user',
          banned: !!u.banned,
          createdAt: formatTime(u.createdAt)
      })));
  };

  const exportDonationsCsv = () => {
      downloadCsv('donations.csv', filteredDonations.map((d) => ({
          id: d.id,
          foodItem: d.foodItem || '',
          quantity: d.quantity || '',
          donorName: d.donorName || '',
          phone: d.phone || '',
          status: d.status || '',
          verified: !!d.verified,
          pickupPreference: d.pickupPreference || '',
          address: d.address || '',
          createdAt: formatDonationTime(d)
      })));
  };

  const exportMoneyCsv = () => {
      downloadCsv('money-donations.csv', filteredMoneyDonations.map((m) => ({
          id: m.id,
          donorName: m.donorName || '',
          donorId: m.donorId || '',
          amount: getMoneyAmount(m),
          currency: m.currency || 'INR',
          status: m.status || 'pledged',
          message: m.message || '',
          createdAt: formatTime(m.createdAt)
      })));
  };

  const exportSuggestionsCsv = () => {
      downloadCsv('suggestions.csv', filteredSuggestions.map((s) => ({
          id: s.id,
          title: s.title || '',
          message: s.message || '',
          userName: s.userName || '',
          createdAt: formatTime(s.createdAt)
      })));
  };

  const bannedCount = users.filter(u => u.banned).length;
  const activeDonationsCount = donations.filter(d => d?.status === 'available').length;

  return (
    <div className="min-h-screen bg-grid-pattern font-sans pb-10 bg-gray-50">
      <div className="w-full bg-black text-white overflow-hidden py-2 border-b-4 border-dark mb-6 sticky top-0 z-50 shadow-md">
        <div className="animate-marquee whitespace-nowrap font-mono font-bold text-sm flex items-center gap-8">
            <span className="text-green-400">? SYSTEM ONLINE</span>
            <span>? LOAD: 12%</span>
            <span>?? REGION: INDIA</span>
            <span className="text-red-400">????? BANNED: {bannedCount}</span>
            <span className="text-yellow-400">?? PENDING: {activeDonationsCount}</span>
            <span className="text-blue-400">?? USERS: {users.length}</span>
            <span className="text-green-400">? SYSTEM ONLINE</span>
            <span>? LOAD: 12%</span>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white border-4 border-dark rounded-xl p-5 shadow-neo">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-black text-lg flex items-center gap-2"><ShieldCheck size={18}/> System Health</h3>
                    <button onClick={handleRefreshStreams} className="text-xs font-bold px-3 py-1 rounded-lg border-2 border-dark bg-gray-100 hover:bg-gray-200 flex items-center gap-1">
                        <RefreshCcw size={12}/> Refresh
                    </button>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className={`px-2 py-1 rounded-md border-2 text-xs font-bold ${isOnline ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                    {lastUsersSync && (
                        <span className="px-2 py-1 rounded-md border-2 border-gray-200 text-xs font-bold text-gray-600 flex items-center gap-1">
                            <Clock size={12}/> Users: {formatTime(lastUsersSync)}
                        </span>
                    )}
                    {lastDonationsSync && (
                        <span className="px-2 py-1 rounded-md border-2 border-gray-200 text-xs font-bold text-gray-600 flex items-center gap-1">
                            <Clock size={12}/> Donations: {formatTime(lastDonationsSync)}
                        </span>
                    )}
                    {lastMoneySync && (
                        <span className="px-2 py-1 rounded-md border-2 border-gray-200 text-xs font-bold text-gray-600 flex items-center gap-1">
                            <Clock size={12}/> Money: {formatTime(lastMoneySync)}
                        </span>
                    )}
                    {lastSuggestionsSync && (
                        <span className="px-2 py-1 rounded-md border-2 border-gray-200 text-xs font-bold text-gray-600 flex items-center gap-1">
                            <Clock size={12}/> Suggestions: {formatTime(lastSuggestionsSync)}
                        </span>
                    )}
                </div>
                <p className="text-xs font-bold text-gray-500 mt-3">Live streams auto-update. Manual refresh re-subscribes.</p>
            </div>

            <div className="bg-white border-4 border-dark rounded-xl p-5 shadow-neo">
                <h3 className="font-black text-lg flex items-center gap-2"><TrendingUp size={18}/> Pulse</h3>
                <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 flex items-center gap-2 text-xs font-bold text-blue-800">
                        <UserCheck size={14}/> New Users 24h
                        <span className="ml-auto text-sm text-blue-900">{userStats.recent}</span>
                    </div>
                    <div className="bg-red-50 border-2 border-red-200 rounded-lg p-3 flex items-center gap-2 text-xs font-bold text-red-800">
                        <UserX size={14}/> Banned
                        <span className="ml-auto text-sm text-red-900">{bannedCount}</span>
                    </div>
                    <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-3 flex items-center gap-2 text-xs font-bold text-yellow-800">
                        <Layers size={14}/> Open Donations
                        <span className="ml-auto text-sm text-yellow-900">{donationStats.available}</span>
                    </div>
                    <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3 flex items-center gap-2 text-xs font-bold text-green-800">
                        <CheckCircle size={14}/> Completed
                        <span className="ml-auto text-sm text-green-900">{donationStats.completed}</span>
                    </div>
                    <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-3 flex items-center gap-2 text-xs font-bold text-purple-800">
                        <MessageSquare size={14}/> Suggestions 24h
                        <span className="ml-auto text-sm text-purple-900">{suggestionStats.recent}</span>
                    </div>
                    <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-3 flex items-center gap-2 text-xs font-bold text-gray-700">
                        <Package size={14}/> Verified
                        <span className="ml-auto text-sm text-gray-800">{donationStats.verified}</span>
                    </div>
                    <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-3 flex items-center gap-2 text-xs font-bold text-amber-800">
                        <Coins size={14}/> Money Pledges
                        <span className="ml-auto text-sm text-amber-900">{moneyStats.pledged}</span>
                    </div>
                    <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-3 flex items-center gap-2 text-xs font-bold text-emerald-800">
                        <Coins size={14}/> Money Total
                        <span className="ml-auto text-sm text-emerald-900">{formatMoneyAmount(moneyStats.total)}</span>
                    </div>
                </div>
            </div>

            <div className="bg-white border-4 border-dark rounded-xl p-5 shadow-neo">
                <h3 className="font-black text-lg flex items-center gap-2"><Activity size={18}/> Recent Activity</h3>
                <div className="mt-4 space-y-3">
                    {activityFeed.length === 0 ? (
                        <div className="text-xs font-bold text-gray-500">No recent activity yet.</div>
                    ) : (
                        activityFeed.map((item, index) => {
                            const icon = item.type === 'donation'
                                ? <Package size={14} />
                                : item.type === 'money'
                                  ? <Coins size={14} />
                                  : item.type === 'suggestion'
                                    ? <MessageSquare size={14} />
                                    : <Users size={14} />;
                            return (
                                <div key={`${item.type}-${item.time}-${index}`} className="flex items-center justify-between bg-gray-50 border-2 border-gray-200 rounded-lg p-2">
                                        <div className="flex items-center gap-2">
                                            <div className="bg-white border-2 border-dark rounded-md p-1">{icon}</div>
                                            <div>
                                                <div className="font-black text-xs text-gray-800 flex items-center gap-2">
                                                    <span>{item.title}</span>
                                                    {item.type === 'donation' && (
                                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${item.pickupPreference === 'flexible' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                                                            {item.pickupPreference === 'flexible' ? 'FLEXIBLE' : 'ASAP'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-gray-500 font-bold">{item.meta}</div>
                                            </div>
                                        </div>
                                        <div className="text-[10px] font-mono text-gray-400">{item.time ? formatTime(item.time) : 'N/A'}</div>
                                    </div>
                                );
                            })
                    )}
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
                <button onClick={() => setActiveTab('money')} className={`w-full p-4 border-2 border-dark rounded-xl font-bold flex items-center gap-3 transition-all hover:translate-x-1 ${activeTab === 'money' ? 'bg-amber-300 shadow-neo translate-x-1' : 'bg-white'}`}>
                    <Coins size={20}/> Money Donations
                </button>
                <button onClick={() => setActiveTab('issues')} className={`w-full p-4 border-2 border-dark rounded-xl font-bold flex items-center gap-3 transition-all hover:translate-x-1 ${activeTab === 'issues' ? 'bg-red-300 shadow-neo translate-x-1' : 'bg-white'}`}>
                    <ShieldCheck size={20}/> Issues
                    {reportedDonations.length > 0 && (
                        <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{reportedDonations.length}</span>
                    )}
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
                        <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-4 mb-4">
                            <div className="flex flex-col lg:flex-row gap-3">
                                <div className="relative flex-1">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        className="w-full border-2 border-gray-200 rounded-lg py-2 pl-10 pr-3 font-bold text-sm outline-none focus:border-dark bg-white"
                                        placeholder="Search name, email, phone..."
                                        value={userQuery}
                                        onChange={(e) => setUserQuery(e.target.value)}
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <div className="flex items-center gap-2 bg-white border-2 border-dark rounded-lg px-2">
                                        <Filter size={14} className="text-gray-500" />
                                        <select
                                            className="py-2 pr-2 text-sm font-bold outline-none bg-transparent"
                                            value={userRoleFilter}
                                            onChange={(e) => setUserRoleFilter(e.target.value as 'all' | 'admin' | 'user')}
                                        >
                                            <option value="all">All Roles</option>
                                            <option value="admin">Admins</option>
                                            <option value="user">Users</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white border-2 border-dark rounded-lg px-2">
                                        <select
                                            className="py-2 pr-2 text-sm font-bold outline-none bg-transparent"
                                            value={userStatusFilter}
                                            onChange={(e) => setUserStatusFilter(e.target.value as 'all' | 'active' | 'banned')}
                                        >
                                            <option value="all">All Status</option>
                                            <option value="active">Active</option>
                                            <option value="banned">Banned</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={resetUserFilters} className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-dark bg-white hover:bg-gray-100 flex items-center gap-1">
                                        <RefreshCcw size={14}/> Reset
                                    </button>
                                    <button onClick={exportUsersCsv} className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-dark bg-gray-100 hover:bg-gray-200 flex items-center gap-1">
                                        <Download size={14}/> Export CSV
                                    </button>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-gray-500">
                                <span className="bg-white border-2 border-dark rounded-md px-2 py-1">Showing {filteredUsers.length} of {users.length}</span>
                                <span className="bg-purple-50 border-2 border-purple-200 rounded-md px-2 py-1">Admins: {userStats.admins}</span>
                                <span className="bg-green-50 border-2 border-green-200 rounded-md px-2 py-1">New 24h: {userStats.recent}</span>
                                <span className="bg-red-50 border-2 border-red-200 rounded-md px-2 py-1">Banned: {bannedCount}</span>
                            </div>
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
                                    {filteredUsers.length === 0 && (
                                        <tr><td colSpan={5} className="p-6 text-center text-gray-500 font-bold italic">No users match current filters.</td></tr>
                                    )}
                                    {filteredUsers.map(u => (
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
                            <span className="bg-green-100 px-3 py-1 rounded-lg border-2 border-green-800 font-bold text-xs text-green-900 animate-pulse">? LIVE UPDATES</span>
                        </div>
                        <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-4 mb-4">
                            <div className="flex flex-col lg:flex-row gap-3">
                                <div className="relative flex-1">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        className="w-full border-2 border-gray-200 rounded-lg py-2 pl-10 pr-3 font-bold text-sm outline-none focus:border-dark bg-white"
                                        placeholder="Search food, donor, phone, location..."
                                        value={donationQuery}
                                        onChange={(e) => setDonationQuery(e.target.value)}
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <div className="flex items-center gap-2 bg-white border-2 border-dark rounded-lg px-2">
                                        <Filter size={14} className="text-gray-500" />
                                        <select
                                            className="py-2 pr-2 text-sm font-bold outline-none bg-transparent"
                                            value={donationStatusFilter}
                                            onChange={(e) => setDonationStatusFilter(e.target.value as 'all' | 'available' | 'on_way' | 'claimed' | 'completed' | 'reported')}
                                        >
                                            <option value="all">All Status</option>
                                            <option value="available">Available</option>
                                            <option value="on_way">On the way</option>
                                            <option value="claimed">Claimed</option>
                                            <option value="completed">Completed</option>
                                            <option value="reported">Reported</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white border-2 border-dark rounded-lg px-2">
                                        <select
                                            className="py-2 pr-2 text-sm font-bold outline-none bg-transparent"
                                            value={donationVerifiedFilter}
                                            onChange={(e) => setDonationVerifiedFilter(e.target.value as 'all' | 'verified' | 'unverified')}
                                        >
                                            <option value="all">All Verification</option>
                                            <option value="verified">Verified</option>
                                            <option value="unverified">Unverified</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={resetDonationFilters} className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-dark bg-white hover:bg-gray-100 flex items-center gap-1">
                                        <RefreshCcw size={14}/> Reset
                                    </button>
                                    <button onClick={exportDonationsCsv} className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-dark bg-gray-100 hover:bg-gray-200 flex items-center gap-1">
                                        <Download size={14}/> Export CSV
                                    </button>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-gray-500">
                                <span className="bg-white border-2 border-dark rounded-md px-2 py-1">Showing {filteredDonations.length} of {donations.length}</span>
                                <span className="bg-yellow-50 border-2 border-yellow-200 rounded-md px-2 py-1">Available: {donationStats.available}</span>
                                <span className="bg-blue-50 border-2 border-blue-200 rounded-md px-2 py-1">Claimed: {donationStats.claimed}</span>
                                <span className="bg-green-50 border-2 border-green-200 rounded-md px-2 py-1">Completed: {donationStats.completed}</span>
                                <span className="bg-red-50 border-2 border-red-200 rounded-md px-2 py-1">Reported: {donationStats.reported}</span>
                            </div>
                        </div>
                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse relative">
                                <thead className="bg-gray-100 text-gray-600 uppercase text-xs sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 border-b-2 border-gray-300">Food Item</th>
                                        <th className="p-3 border-b-2 border-gray-300">Donor</th>
                                        <th className="p-3 border-b-2 border-gray-300">Status</th>
                                        <th className="p-3 border-b-2 border-gray-300">Pickup</th>
                                        <th className="p-3 border-b-2 border-gray-300">Location</th>
                                        <th className="p-3 border-b-2 border-gray-300">Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading && <tr><td colSpan={6} className="p-8 text-center font-bold">Loading Data...</td></tr>}
                                    {!loading && filteredDonations.length === 0 && (
                                        <tr><td colSpan={6} className="p-8 text-center text-gray-500 font-bold italic">{donations.length === 0 ? 'No food donations detected yet! ??' : 'No donations match current filters.'}</td></tr>
                                    )}
                                    {filteredDonations.map(d => (
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

                                        <td className="p-3">
                                            <span className={`text-xs font-black px-2 py-1 rounded-md border-2 ${d.pickupPreference === 'flexible' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                                                {d.pickupPreference === 'flexible' ? 'FLEXIBLE' : 'ASAP'}
                                            </span>
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
                                            {formatDonationTime(d)}
                                        </td>
                                    </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'money' && (
                    <div className="animate-fadeIn">
                        <div className="flex justify-between items-center mb-6 border-b-2 border-gray-100 pb-4">
                            <h2 className="text-2xl font-black flex items-center gap-2"><Coins/> Money Donations</h2>
                            <span className="bg-amber-100 px-3 py-1 rounded-lg border-2 border-amber-800 font-bold text-xs text-amber-900">Total: {formatMoneyAmount(moneyStats.total)}</span>
                        </div>
                        <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-4 mb-4">
                            <div className="flex flex-col lg:flex-row gap-3">
                                <div className="relative flex-1">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        className="w-full border-2 border-gray-200 rounded-lg py-2 pl-10 pr-3 font-bold text-sm outline-none focus:border-dark bg-white"
                                        placeholder="Search donor, message, id..."
                                        value={moneyQuery}
                                        onChange={(e) => setMoneyQuery(e.target.value)}
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <div className="flex items-center gap-2 bg-white border-2 border-dark rounded-lg px-2">
                                        <Filter size={14} className="text-gray-500" />
                                        <select
                                            className="py-2 pr-2 text-sm font-bold outline-none bg-transparent"
                                            value={moneyStatusFilter}
                                            onChange={(e) => setMoneyStatusFilter(e.target.value as 'all' | 'pledged' | 'paid')}
                                        >
                                            <option value="all">All Status</option>
                                            <option value="pledged">Pledged</option>
                                            <option value="paid">Paid</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white border-2 border-dark rounded-lg px-2">
                                        <select
                                            className="py-2 pr-2 text-sm font-bold outline-none bg-transparent"
                                            value={moneySort}
                                            onChange={(e) => setMoneySort(e.target.value as 'recent' | 'amount')}
                                        >
                                            <option value="recent">Newest</option>
                                            <option value="amount">Highest Amount</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={resetMoneyFilters} className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-dark bg-white hover:bg-gray-100 flex items-center gap-1">
                                        <RefreshCcw size={14}/> Reset
                                    </button>
                                    <button onClick={exportMoneyCsv} className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-dark bg-gray-100 hover:bg-gray-200 flex items-center gap-1">
                                        <Download size={14}/> Export CSV
                                    </button>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-gray-500">
                                <span className="bg-white border-2 border-dark rounded-md px-2 py-1">Showing {filteredMoneyDonations.length} of {moneyDonations.length}</span>
                                <span className="bg-amber-50 border-2 border-amber-200 rounded-md px-2 py-1">Pledged: {moneyStats.pledged}</span>
                                <span className="bg-green-50 border-2 border-green-200 rounded-md px-2 py-1">Paid: {moneyStats.paid}</span>
                                <span className="bg-blue-50 border-2 border-blue-200 rounded-md px-2 py-1">Donors: {moneyStats.donors}</span>
                                <span className="bg-purple-50 border-2 border-purple-200 rounded-md px-2 py-1">Recent 24h: {moneyStats.recent}</span>
                            </div>
                        </div>
                        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse relative">
                                <thead className="bg-gray-100 text-gray-600 uppercase text-xs sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 border-b-2 border-gray-300">Donor</th>
                                        <th className="p-3 border-b-2 border-gray-300">Amount</th>
                                        <th className="p-3 border-b-2 border-gray-300">Status</th>
                                        <th className="p-3 border-b-2 border-gray-300">Message</th>
                                        <th className="p-3 border-b-2 border-gray-300">Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMoneyDonations.length === 0 && (
                                        <tr><td colSpan={5} className="p-8 text-center text-gray-500 font-bold italic">{moneyDonations.length === 0 ? 'No money donations yet.' : 'No money donations match current filters.'}</td></tr>
                                    )}
                                    {filteredMoneyDonations.map((m) => {
                                        const amount = getMoneyAmount(m);
                                        const currency = typeof m.currency === 'string' ? m.currency : 'INR';
                                        return (
                                            <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                                <td className="p-3">
                                                    <div className="font-bold text-sm">{m.donorName || 'Anonymous'}</div>
                                                    <div className="text-xs text-gray-500 font-mono">{m.donorId || 'N/A'}</div>
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-black text-sm">{formatMoneyAmount(amount, currency)}</div>
                                                    <div className="text-[10px] text-gray-500 font-bold uppercase">{currency}</div>
                                                </td>
                                                <td className="p-3">
                                                    {getMoneyStatusBadge(m.status)}
                                                </td>
                                                <td className="p-3 text-xs text-gray-600 font-bold max-w-[220px]">
                                                    <span className="truncate block" title={m.message || ''}>
                                                        {m.message || '-'}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-xs font-mono text-gray-500">
                                                    {formatTime(m.createdAt)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'issues' && (
                    <div className="animate-fadeIn">
                        <div className="flex justify-between items-center mb-6 border-b-2 border-gray-100 pb-4">
                            <h2 className="text-2xl font-black flex items-center gap-2"><ShieldCheck/> Reported Donations</h2>
                            <span className="bg-red-100 px-3 py-1 rounded-lg border-2 border-red-300 font-bold text-xs text-red-700">{reportedDonations.length} Issues</span>
                        </div>
                        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-4">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase text-red-700">AI Risk Insights</p>
                                    <p className="text-xs font-bold text-gray-600">Spot patterns in reported donations.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleAiIssues}
                                        disabled={!hasAi || aiIssueLoading}
                                        className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-dark bg-white hover:bg-gray-100"
                                    >
                                        {aiIssueLoading ? 'Thinking...' : 'Analyze'}
                                    </button>
                                    <button
                                        onClick={() => openChat('Analyze reported donations and suggest admin actions.')}
                                        className="text-[10px] font-bold px-2 py-1 rounded-lg border-2 border-dark bg-white hover:bg-gray-100"
                                    >
                                        Ask AI
                                    </button>
                                </div>
                            </div>
                            {!hasAi && (
                                <p className="mt-2 text-[10px] font-bold text-red-600">
                                    Add <span className="font-black">VITE_GEMINI_API_KEY</span> in <code>.env</code> to enable.
                                </p>
                            )}
                            {aiIssueError && (
                                <p className="mt-2 text-[10px] font-bold text-red-600">{aiIssueError}</p>
                            )}
                            {aiIssueSummary.length > 0 && (
                                <ul className="mt-2 space-y-1 text-[11px] font-bold text-gray-700">
                                    {aiIssueSummary.map((line, idx) => (
                                        <li key={`${line}-${idx}`} className="flex items-start gap-2">
                                            <span className="mt-1 h-2 w-2 rounded-full bg-red-500" />
                                            <span>{line}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {reportedDonations.length === 0 ? (
                            <div className="text-center py-12 text-gray-500 font-bold border-2 border-dashed border-gray-300 rounded-xl">
                                No reported donations right now.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {reportedDonations.map((d) => (
                                    <div key={d.id} className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-black text-lg">{d.foodItem || 'Donation'}</h3>
                                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${d.pickupPreference === 'flexible' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                                                        {d.pickupPreference === 'flexible' ? 'FLEXIBLE' : 'ASAP'}
                                                    </span>
                                                    {d.verified && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded border border-blue-200">AI OK</span>}
                                                </div>
                                                <div className="text-xs font-bold text-gray-600">{d.quantity || 'Quantity'} - {d.donorName || 'Anonymous'}</div>
                                                <div className="text-xs font-mono text-gray-500 mt-1">{d.phone || 'No phone'}</div>
                                                <div className="text-xs font-bold text-gray-500 mt-1">Created: {formatDonationTime(d)}</div>
                                                <div className="text-xs font-bold text-gray-600 mt-2 flex items-start gap-1">
                                                    <MapPin size={12} className="mt-0.5 text-primary" />
                                                    <span>{d.address || 'GPS Location'}</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => reopenReportedDonation(d.id)}
                                                    className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-dark bg-white hover:bg-gray-100"
                                                >
                                                    Reopen
                                                </button>
                                                <button
                                                    onClick={() => removeReportedDonation(d.id)}
                                                    className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-red-400 bg-red-100 text-red-700 hover:bg-red-200"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'suggestions' && (
                    <div className="animate-fadeIn">
                        <div className="flex justify-between items-center mb-6 border-b-2 border-gray-100 pb-4">
                            <h2 className="text-2xl font-black flex items-center gap-2"><MessageSquare/> User Suggestions</h2>
                        </div>
                        <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 mb-4">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase text-purple-800">AI Summary</p>
                                    <p className="text-xs font-bold text-gray-600">Quick themes and urgent items.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleAiSummary}
                                        disabled={!hasAi || aiSummaryLoading}
                                        className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-dark bg-white hover:bg-gray-100"
                                    >
                                        {aiSummaryLoading ? 'Thinking...' : 'Generate'}
                                    </button>
                                    <button
                                        onClick={() => openChat('Summarize recent user suggestions and propose fixes.')}
                                        className="text-[10px] font-bold px-2 py-1 rounded-lg border-2 border-dark bg-white hover:bg-gray-100"
                                    >
                                        Ask AI
                                    </button>
                                </div>
                            </div>
                            {!hasAi && (
                                <p className="mt-2 text-[10px] font-bold text-red-600">
                                    Add <span className="font-black">VITE_GEMINI_API_KEY</span> in <code>.env</code> to enable.
                                </p>
                            )}
                            {aiSummaryError && (
                                <p className="mt-2 text-[10px] font-bold text-red-600">{aiSummaryError}</p>
                            )}
                            {aiSummary.length > 0 && (
                                <ul className="mt-2 space-y-1 text-[11px] font-bold text-gray-700">
                                    {aiSummary.map((line, idx) => (
                                        <li key={`${line}-${idx}`} className="flex items-start gap-2">
                                            <span className="mt-1 h-2 w-2 rounded-full bg-purple-600" />
                                            <span>{line}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-4 mb-4">
                            <div className="flex flex-col lg:flex-row gap-3">
                                <div className="relative flex-1">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        className="w-full border-2 border-gray-200 rounded-lg py-2 pl-10 pr-3 font-bold text-sm outline-none focus:border-dark bg-white"
                                        placeholder="Search title, message, user..."
                                        value={suggestionQuery}
                                        onChange={(e) => setSuggestionQuery(e.target.value)}
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <div className="flex items-center gap-2 bg-white border-2 border-dark rounded-lg px-2">
                                        <Filter size={14} className="text-gray-500" />
                                        <select
                                            className="py-2 pr-2 text-sm font-bold outline-none bg-transparent"
                                            value={suggestionSort}
                                            onChange={(e) => setSuggestionSort(e.target.value as 'none' | 'recent' | 'oldest')}
                                        >
                                            <option value="none">Default Order</option>
                                            <option value="recent">Newest First</option>
                                            <option value="oldest">Oldest First</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={resetSuggestionFilters} className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-dark bg-white hover:bg-gray-100 flex items-center gap-1">
                                        <RefreshCcw size={14}/> Reset
                                    </button>
                                    <button onClick={exportSuggestionsCsv} className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-dark bg-gray-100 hover:bg-gray-200 flex items-center gap-1">
                                        <Download size={14}/> Export CSV
                                    </button>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-gray-500">
                                <span className="bg-white border-2 border-dark rounded-md px-2 py-1">Showing {filteredSuggestions.length} of {suggestions.length}</span>
                                <span className="bg-purple-50 border-2 border-purple-200 rounded-md px-2 py-1">With Title: {suggestionStats.withTitle}</span>
                                <span className="bg-green-50 border-2 border-green-200 rounded-md px-2 py-1">New 24h: {suggestionStats.recent}</span>
                            </div>
                        </div>
                        {filteredSuggestions.length === 0 ? (
                            <div className="text-center py-12 text-gray-500 font-bold">
                                {suggestions.length === 0 ? 'No suggestions received yet.' : 'No suggestions match current filters.'}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredSuggestions.map(s => (
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
                                <h3 className="font-black text-sm flex items-center gap-2"><Clock size={14}/> Broadcast Status</h3>
                                <div className="mt-2 text-xs font-bold text-gray-600 space-y-1">
                                    <div>Last: {lastAnnouncementAt ? formatTime(lastAnnouncementAt) : 'N/A'}</div>
                                    <div>Expires: {lastAnnouncementExpiresAt ? formatTime(lastAnnouncementExpiresAt) : 'N/A'}</div>
                                </div>
                            </div>
                            <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
                                <h3 className="font-black text-sm flex items-center gap-2"><Layers size={14}/> Quick Templates</h3>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {ANNOUNCEMENT_TEMPLATES.map((template) => (
                                        <button
                                            key={template.label}
                                            onClick={() => setAnnouncement(template.message)}
                                            className="text-xs font-bold px-3 py-1 rounded-lg border-2 border-dark bg-gray-50 hover:bg-gray-100"
                                        >
                                            {template.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
                                <h3 className="font-black text-sm flex items-center gap-2"><Eye size={14}/> Tools</h3>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <button
                                        onClick={() => setAnnouncePreview((prev) => !prev)}
                                        className="text-xs font-bold px-3 py-1 rounded-lg border-2 border-dark bg-white hover:bg-gray-100 flex items-center gap-1"
                                    >
                                        {announcePreview ? <EyeOff size={14}/> : <Eye size={14}/>}
                                        {announcePreview ? 'Hide Preview' : 'Show Preview'}
                                    </button>
                                    <button
                                        onClick={() => setAnnouncement('')}
                                        className="text-xs font-bold px-3 py-1 rounded-lg border-2 border-dark bg-gray-100 hover:bg-gray-200"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                        </div>
                        
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

                        {announcePreview && announcement.trim() && (
                            <div className="mt-4 bg-black text-white border-4 border-dark rounded-xl p-4 shadow-neo">
                                <div className="text-xs font-mono font-bold text-green-300 mb-2">PREVIEW</div>
                                <div className="font-bold text-lg">{announcement}</div>
                            </div>
                        )}

                        <NeoButton onClick={postAnnouncement} className="mt-6 w-full flex items-center justify-center gap-2 py-4 text-lg" disabled={announceSaving} aria-busy={announceSaving}>
                            <Megaphone size={24} /> 
                            {announceSaving ? 'Publishing...' : 'Publish Broadcast'}
                        </NeoButton>

                        {announcementHistory.length > 0 && (
                            <div className="mt-6">
                                <h3 className="text-lg font-black flex items-center gap-2"><Clock size={16}/> Recent Broadcasts (local)</h3>
                                <div className="mt-3 space-y-3">
                                    {announcementHistory.map((item, index) => (
                                        <div key={`${item.createdAt}-${index}`} className="bg-gray-50 border-2 border-gray-200 rounded-xl p-3">
                                            <div className="text-xs font-mono text-gray-500">{formatTime(item.createdAt)}</div>
                                            <div className="font-bold text-gray-800 mt-1">{item.message}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
