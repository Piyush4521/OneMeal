import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, MapPin, Package, Phone, Award, LocateFixed, CheckCircle, LockKeyhole, AlertCircle, Camera, Sparkles, XCircle, Leaf, Beef, Menu, History, Gift, MessageSquare, Info, Search, ArrowUpDown, Filter, Repeat, RefreshCw, Compass, Navigation, ShieldCheck, UserCheck } from 'lucide-react';
import { NeoButton } from '../components/ui/NeoButton';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, doc, updateDoc, onSnapshot, setDoc } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { generateJson, isGeminiConfigured, verifyFoodImage, type GeminiResponseSchema } from '../lib/aiClient';
import { openChat } from '../lib/chatEvents';
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
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

type DonationStatus = 'available' | 'on_way' | 'claimed' | 'completed' | 'reported';
type VolunteerStatus = 'accepted' | 'in_transit' | 'completed' | 'released';

type Donation = {
  id: string;
  foodItem?: string;
  quantity?: string;
  address?: string;
  phone?: string;
  foodType?: 'veg' | 'non-veg';
  pickupPreference?: 'asap' | 'flexible';
  location?: { lat: number; lng: number } | null;
  status?: DonationStatus;
  createdAt?: Timestamp | Date | number | null;
  createdAtClient?: number;
  otp?: string | number;
  verified?: boolean;
  volunteerId?: string | null;
  volunteerName?: string;
  volunteerStatus?: VolunteerStatus;
  volunteerAcceptedAt?: Timestamp | Date | number | null;
  volunteerCompletedAt?: Timestamp | Date | number | null;
};

type VolunteerDonation = Donation & { distance?: number };

const AI_TIMEOUT_MS = 20000;
const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };
const DRAFT_STORAGE_KEY = 'donorDraftV1';
const MAX_IMAGE_MB = 6;

const DONOR_TIPS_SCHEMA: GeminiResponseSchema = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
  },
  required: ['items'],
};

const dateFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

const getDateMillis = (value: Donation['createdAt'] | undefined, fallback?: number): number => {
  if (!value) return fallback ?? 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as Timestamp).toMillis === 'function') return (value as Timestamp).toMillis();
  return fallback ?? 0;
};

const formatDate = (value: Donation['createdAt'] | undefined, fallback?: number) => {
  const ms = getDateMillis(value, fallback);
  if (!ms) return 'Unknown time';
  return dateFormatter.format(new Date(ms));
};

const normalizeText = (value?: string) => (value || '').toLowerCase();

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 9999;
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180))
    * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
};

const getTimeAgo = (value: Donation['createdAt'] | undefined, fallback?: number) => {
  const ms = getDateMillis(value, fallback);
  if (!ms) return 'Just now';
  const diff = Date.now() - ms;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const getKarmaLevel = (karma: number) => {
  if (karma < 0) return { label: 'Needs Care', className: 'bg-red-100 text-red-700 border-red-200' };
  if (karma < 50) return { label: 'Seed', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
  if (karma < 150) return { label: 'Helper', className: 'bg-green-100 text-green-700 border-green-200' };
  if (karma < 300) return { label: 'Champion', className: 'bg-blue-100 text-blue-700 border-blue-200' };
  return { label: 'Legend', className: 'bg-purple-100 text-purple-700 border-purple-200' };
};

const getActionErrorMessage = (error: unknown, fallback: string) => {
  const code =
    typeof error === 'object' && error && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : '';
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  if (/permission-denied|storage\/unauthorized/i.test(code) || /permission|insufficient/i.test(message)) {
    return 'Permission denied. Please sign in again or update Firebase rules.';
  }
  if (/unauth|auth\//i.test(code) || /sign in|login/i.test(message)) {
    return 'Please sign in again and retry.';
  }
  if (/unavailable|network-request-failed/i.test(code) || /network|offline|failed to fetch/i.test(message)) {
    return 'Network issue detected. Please check your internet and retry.';
  }

  return message ? `${fallback} ${message}` : fallback;
};

const DonorDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'donate' | 'history' | 'guide' | 'volunteer' | 'suggestions'>('donate');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [foodItem, setFoodItem] = useState('');
  const [quantity, setQuantity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [foodType, setFoodType] = useState<'veg' | 'non-veg'>('veg');
  const [pickupPreference, setPickupPreference] = useState<'asap' | 'flexible'>('asap');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [aiVerifying, setAiVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestionSubmitting, setSuggestionSubmitting] = useState(false);
  const [aiTips, setAiTips] = useState<string[]>([]);
  const [aiTipsLoading, setAiTipsLoading] = useState(false);
  const [aiTipsError, setAiTipsError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<DonationStatus | 'all'>('all');
  const [historySort, setHistorySort] = useState<'newest' | 'oldest'>('newest');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [volunteerFeed, setVolunteerFeed] = useState<Donation[]>([]);
  const [volunteerClaims, setVolunteerClaims] = useState<Donation[]>([]);
  const [volunteerAvailability, setVolunteerAvailability] = useState(false);
  const [volunteerLoading, setVolunteerLoading] = useState(false);
  const [volunteerError, setVolunteerError] = useState<string | null>(null);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState<string | null>(null);
  const [volunteerActionId, setVolunteerActionId] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUserId(user?.uid ?? null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setDonations([]);
      return;
    }
    const q = query(collection(db, 'donations'), where('donorId', '==', userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const historyData: Donation[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Donation, 'id'>),
      }));
      historyData.sort((a, b) => {
        const aMs = getDateMillis(a.createdAt, a.createdAtClient);
        const bMs = getDateMillis(b.createdAt, b.createdAtClient);
        return bMs - aMs;
      });
      setDonations(historyData);
    });
    return () => unsubscribe();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = onSnapshot(doc(db, 'users', userId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setVolunteerAvailability(Boolean(data?.volunteerAvailable));
      }
    });
    return () => unsubscribe();
  }, [userId]);

  useEffect(() => {
    setVolunteerLoading(true);
    const q = query(collection(db, 'donations'), where('status', '==', 'available'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Donation, 'id'>),
        }));
        setVolunteerFeed(list);
        setVolunteerError(null);
        setVolunteerLoading(false);
      },
      (error) => {
        console.error('Volunteer feed error:', error);
        setVolunteerError('Volunteer feed failed to load.');
        setVolunteerLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setVolunteerClaims([]);
      return;
    }
    const q = query(collection(db, 'donations'), where('volunteerId', '==', userId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Donation, 'id'>),
        }));
        setVolunteerClaims(list);
      },
      (error) => {
        console.error('Volunteer claims error:', error);
        setVolunteerError('Volunteer pickups failed to load.');
      }
    );
    return () => unsubscribe();
  }, [userId]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported');
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationError(null);
        setLocationLoading(false);
      },
      (error) => {
        setLocationError(error.message || 'Location unavailable');
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft && typeof draft === 'object') {
          setFoodItem(draft.foodItem || '');
          setQuantity(draft.quantity || '');
          setAddress(draft.address || '');
          setPhone(draft.phone || '');
          setFoodType(draft.foodType === 'non-veg' ? 'non-veg' : 'veg');
          setPickupPreference(draft.pickupPreference === 'flexible' ? 'flexible' : 'asap');
        }
      }
    } catch {
      // ignore draft errors
    } finally {
      setDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    const draft = { foodItem, quantity, address, phone, foodType, pickupPreference };
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore draft errors
    }
  }, [foodItem, quantity, address, phone, foodType, pickupPreference, draftLoaded]);

  const trimmedFoodItem = foodItem.trim();
  const trimmedQuantity = quantity.trim();
  const trimmedAddress = address.trim();
  const cleanedPhone = phone.replace(/\D/g, '');
  const isPhoneValid = cleanedPhone.length >= 10 && cleanedPhone.length <= 15;
  const isFormComplete = Boolean(trimmedFoodItem && trimmedQuantity && trimmedAddress && isPhoneValid);
  const canSubmit = isFormComplete && isVerified && !loading;
  const hasAi = isGeminiConfigured('donor');
  const normalizeAiTips = (payload: unknown) => {
    if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { items?: unknown[] }).items)) {
      return [];
    }

    return (payload as { items?: unknown[] }).items
      ?.map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, 4) || [];
  };

  const mapCenter = location ?? DEFAULT_CENTER;
  const mapZoom = location ? 15 : 4;

  const readinessPercent = useMemo(() => {
    const steps = [
      Boolean(trimmedFoodItem),
      Boolean(trimmedQuantity),
      Boolean(trimmedAddress),
      isPhoneValid,
      Boolean(imageFile),
      isVerified,
    ];
    const completed = steps.filter(Boolean).length;
    return Math.round((completed / steps.length) * 100);
  }, [trimmedFoodItem, trimmedQuantity, trimmedAddress, isPhoneValid, imageFile, isVerified]);

  const stats = useMemo(() => {
    const total = donations.length;
    const completed = donations.filter((d) => d.status === 'completed').length;
    const reported = donations.filter((d) => d.status === 'reported').length;
    const claimed = donations.filter((d) => d.status === 'claimed' || d.status === 'on_way').length;
    const available = donations.filter((d) => d.status === 'available').length;
    const karma = completed * 10 - reported * 50;
    return { total, completed, reported, claimed, available, karma };
  }, [donations]);

  const karmaLevel = useMemo(() => getKarmaLevel(stats.karma), [stats.karma]);

  const filteredDonations = useMemo(() => {
    let list = [...donations];
    if (historyFilter !== 'all') {
      list = list.filter((d) => d.status === historyFilter);
    }
    const queryText = historySearch.trim().toLowerCase();
    if (queryText) {
      list = list.filter((d) => {
        return (
          normalizeText(d.foodItem).includes(queryText) ||
          normalizeText(d.quantity).includes(queryText) ||
          normalizeText(d.address).includes(queryText)
        );
      });
    }
    list.sort((a, b) => {
      const aMs = getDateMillis(a.createdAt, a.createdAtClient);
      const bMs = getDateMillis(b.createdAt, b.createdAtClient);
      return historySort === 'newest' ? bMs - aMs : aMs - bMs;
    });
    return list;
  }, [donations, historyFilter, historySearch, historySort]);

  const volunteerFeedSorted = useMemo<VolunteerDonation[]>(() => {
    const base = volunteerFeed.filter((item) => item.status === 'available');
    const withDistance = base.map((item) => {
      const distance = location && item.location
        ? calculateDistance(location.lat, location.lng, item.location.lat, item.location.lng)
        : undefined;
      return { ...item, distance };
    });
    const filtered = userId
      ? withDistance.filter((item) => !item.volunteerId || item.volunteerId === userId)
      : withDistance;
    return filtered.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
  }, [volunteerFeed, location, userId]);

  const volunteerActive = useMemo(
    () => volunteerClaims.filter((item) => item.volunteerStatus !== 'completed' && item.status !== 'completed'),
    [volunteerClaims]
  );

  const volunteerCompleted = useMemo(
    () => volunteerClaims.filter((item) => item.volunteerStatus === 'completed' || item.status === 'completed'),
    [volunteerClaims]
  );

  const selectedVolunteerDonation = useMemo(
    () => volunteerFeedSorted.find((item) => item.id === selectedVolunteerId) ?? null,
    [volunteerFeedSorted, selectedVolunteerId]
  );

  const goToHome = () => navigate('/');

  const resetImageInputs = () => {
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const clearSelectedImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setIsVerified(false);
    setFormError(null);
    resetImageInputs();
  };

  const resetForm = (options?: { preserveLocation?: boolean }) => {
    setFoodItem('');
    setQuantity('');
    setAddress('');
    setPhone('');
    setFoodType('veg');
    setPickupPreference('asap');
    setImageFile(null);
    setImagePreview(null);
    setIsVerified(false);
    setFormError(null);
    setAiTips([]);
    setAiTipsError(null);
    resetImageInputs();
    if (!options?.preserveLocation) setLocation(null);
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported');
      toast.error('Geolocation is not supported');
      return;
    }
    setLocationLoading(true);
    setLocationError(null);
    const toastId = toast.loading('Getting your location...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ lat: latitude, lng: longitude });
        setAddress(`GPS Pinned: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        setLocationLoading(false);
        toast.dismiss(toastId);
        toast.success('Location pinned.');
      },
      (error) => {
        setLocationLoading(false);
        setLocationError(error.message || 'Could not fetch location.');
        toast.dismiss(toastId);
        toast.error('Could not fetch location.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      e.target.value = '';
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      toast.error(`Image too large. Max ${MAX_IMAGE_MB}MB.`);
      e.target.value = '';
      return;
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setIsVerified(false);
    setFormError(null);
    e.target.value = '';
  };

  const handleAiTips = async () => {
    if (!hasAi) {
      toast.error('AI tips need VITE_GEMINI_API_KEY_DONOR or VITE_GEMINI_API_KEY.');
      return;
    }
    if (!trimmedFoodItem && !trimmedQuantity && !trimmedAddress) {
      setAiTipsError('Fill a few details first for better tips.');
      return;
    }

    setAiTipsLoading(true);
    setAiTipsError(null);
    setAiTips([]);

    try {
      const prompt = [
        'You improve food donation listings.',
        'Return JSON with key "items".',
        '"items" should contain 4 short lines.',
        'Include 3 practical listing tips and 1 estimated servings line.',
        `Food item: ${trimmedFoodItem || 'unknown'}`,
        `Quantity: ${trimmedQuantity || 'unknown'}`,
        `Food type: ${foodType}`,
        `Pickup preference: ${pickupPreference}`,
        `Address filled: ${trimmedAddress ? 'yes' : 'no'}`,
        `Phone valid: ${isPhoneValid ? 'yes' : 'no'}`,
      ].join('\n');

      const payload = await generateJson<{ items: string[] }>({
        prompt,
        maxOutputTokens: 220,
        temperature: 0.2,
        schema: DONOR_TIPS_SCHEMA,
        systemInstruction: 'Return valid JSON only. Keep each line short and practical for a food donor.',
        feature: 'donor',
      });
      const tips = normalizeAiTips(payload);
      if (!tips.length) {
        setAiTipsError('AI did not return tips. Try again.');
      } else {
        setAiTips(tips);
      }
    } catch (error) {
      console.error('AI tips error:', error);
      setAiTipsError('AI tips failed. Please retry.');
    } finally {
      setAiTipsLoading(false);
    }
  };

  const verifyFoodWithAI = async () => {
    if (!imageFile) {
      toast.error('Please take a photo first!');
      return;
    }
    if (!hasAi) {
      toast.error('AI verification is not configured. Please contact admin.');
      return;
    }

    setAiVerifying(true);
    const toastId = toast.loading('AI is checking your food...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    try {
      const isFood = await verifyFoodImage({ file: imageFile, signal: controller.signal, feature: 'donor' });
      toast.dismiss(toastId);

      if (isFood) {
        setIsVerified(true);
        toast.success('AI verified: food looks valid.');
      } else {
        setIsVerified(false);
        toast.error('AI could not verify food. Please retake the photo.');
        setImageFile(null);
        setImagePreview(null);
      }
    } catch (error: any) {
      console.error('AI Error:', error);
      toast.dismiss(toastId);
      if (error?.name === 'AbortError') {
        toast.error('AI check timed out. Please try again.');
      } else if (/quota|limit|resource exhausted|429/i.test(error?.message || '')) {
        toast.error('Image verify is busy right now. Please wait a few seconds and retry.');
      } else {
        toast.error('AI Error: ' + (error.message || 'Connection failed'));
      }
    } finally {
      clearTimeout(timeout);
      setAiVerifying(false);
    }
  };

  const handleDonate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      toast.error('Please sign in to donate.');
      return;
    }
    if (!isVerified) {
      toast.error('Please verify food with AI first.');
      return;
    }
    if (!imageFile) {
      toast.error('Please add a food image first.');
      return;
    }
    if (!trimmedFoodItem || !trimmedQuantity || !trimmedAddress || !phone) {
      toast.error('Fill all fields');
      return;
    }
    if (!isPhoneValid) {
      toast.error('Enter a valid phone number.');
      return;
    }

    setLoading(true);
    setFormError(null);

    try {
      await addDoc(collection(db, 'donations'), {
        foodItem: trimmedFoodItem,
        quantity: trimmedQuantity,
        address: trimmedAddress,
        location,
        phone: cleanedPhone || phone,
        foodType,
        pickupPreference,
        donorName: auth.currentUser.displayName || 'Anonymous',
        donorId: auth.currentUser.uid,
        status: 'available',
        verified: true,
        createdAt: serverTimestamp(),
        createdAtClient: Date.now(),
      });

      toast.success('Donation listed successfully.');

      resetForm({ preserveLocation: true });
    } catch (error) {
      console.error('Donation create error:', error);
      const message = getActionErrorMessage(error, 'Failed to donate.');
      setFormError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const submitSuggestion = async () => {
    const trimmed = suggestionText.trim();
    if (trimmed.length < 3) return toast.error('Please write something...');
    if (!auth.currentUser) {
      const message = 'Please sign in again before sending a suggestion.';
      setSuggestionError(message);
      toast.error(message);
      return;
    }

    setSuggestionSubmitting(true);
    setSuggestionError(null);
    try {
      await addDoc(collection(db, 'suggestions'), {
        message: trimmed,
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'Anonymous',
        userEmail: auth.currentUser.email || '',
        createdAt: serverTimestamp(),
        createdAtClient: Date.now(),
        title: 'Donor Suggestion',
        role: 'donor',
        source: 'donor-dashboard',
      });
      toast.success('Thanks! Your suggestion was sent to Admin.');
      setSuggestionText('');
    } catch (error) {
      console.error('Suggestion submit error:', error);
      const message = getActionErrorMessage(error, 'Failed to send suggestion.');
      setSuggestionError(message);
      toast.error(message);
    } finally {
      setSuggestionSubmitting(false);
    }
  };

  const reportDonationIssue = async (item: Donation) => {
    if (!window.confirm('Report an issue with this donation? Admin will review.')) return;
    try {
      await addDoc(collection(db, 'suggestions'), {
        title: 'Donation Issue',
        message: `Issue reported for donation: ${item.foodItem || 'Food'} (${item.quantity || 'Quantity'}) at ${item.address || 'Address'}. Status: ${item.status || 'unknown'}.`,
        donationId: item.id,
        userId: auth.currentUser?.uid,
        userName: auth.currentUser?.displayName || 'Anonymous',
        createdAt: serverTimestamp(),
        issueType: 'donation',
      });
      toast.success('Issue reported to Admin.');
    } catch (error) {
      console.error('Donation issue report error:', error);
      toast.error(getActionErrorMessage(error, 'Failed to report issue.'));
    }
  };

  const handleRepeatDonation = (item: Donation) => {
    setFoodItem(item.foodItem || '');
    setQuantity(item.quantity || '');
    setAddress(item.address || '');
    setPhone(item.phone || '');
    setFoodType(item.foodType === 'non-veg' ? 'non-veg' : 'veg');
    setPickupPreference('asap');
    if (item.location) setLocation(item.location);
    setImageFile(null);
    setImagePreview(null);
    setIsVerified(false);
    setActiveTab('donate');
    setMobileMenuOpen(false);
    toast.success('Donation details loaded. Add a photo to verify and submit.');
  };

  const handleVolunteerToggle = async () => {
    if (!auth.currentUser) {
      toast.error('Please sign in to volunteer.');
      return;
    }
    const next = !volunteerAvailability;
    setVolunteerAvailability(next);
    try {
      await setDoc(
        doc(db, 'users', auth.currentUser.uid),
        { volunteerAvailable: next, volunteerUpdatedAt: serverTimestamp() },
        { merge: true }
      );
      toast.success(next ? 'Volunteer mode enabled.' : 'Volunteer mode paused.');
    } catch (error) {
      setVolunteerAvailability(!next);
      toast.error('Failed to update volunteer status.');
    }
  };

  const handleVolunteerAccept = async (item: Donation) => {
    if (!auth.currentUser) {
      toast.error('Please sign in to volunteer.');
      return;
    }
    if (item.volunteerId && item.volunteerId !== auth.currentUser.uid) {
      toast.error('Pickup already assigned.');
      return;
    }
    setVolunteerActionId(item.id);
    try {
      await updateDoc(doc(db, 'donations', item.id), {
        status: 'on_way',
        volunteerId: auth.currentUser.uid,
        volunteerName: auth.currentUser.displayName || 'Volunteer',
        volunteerStatus: 'accepted',
        volunteerAcceptedAt: serverTimestamp(),
      });
      toast.success('Pickup accepted.');
    } catch (error) {
      toast.error('Failed to accept pickup.');
    } finally {
      setVolunteerActionId(null);
    }
  };

  const handleVolunteerComplete = async (item: Donation) => {
    if (!auth.currentUser) return;
    setVolunteerActionId(item.id);
    try {
      await updateDoc(doc(db, 'donations', item.id), {
        status: 'completed',
        volunteerStatus: 'completed',
        volunteerCompletedAt: serverTimestamp(),
      });
      toast.success('Marked as completed.');
    } catch (error) {
      toast.error('Failed to update pickup.');
    } finally {
      setVolunteerActionId(null);
    }
  };

  const handleVolunteerRelease = async (item: Donation) => {
    if (!auth.currentUser) return;
    setVolunteerActionId(item.id);
    try {
      await updateDoc(doc(db, 'donations', item.id), {
        status: 'available',
        volunteerId: null,
        volunteerName: null,
        volunteerStatus: 'released',
        volunteerReleasedAt: serverTimestamp(),
      });
      toast.success('Pickup released.');
    } catch (error) {
      toast.error('Failed to release pickup.');
    } finally {
      setVolunteerActionId(null);
    }
  };

  const openVolunteerMap = (item: Donation) => {
    if (item.location) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${item.location.lat},${item.location.lng}`;
      window.open(url, '_blank');
    } else {
      toast.error('No GPS coordinates.');
    }
  };

  const VerifyCard = ({ item }: { item: Donation }) => {
    const [otpInput, setOtpInput] = useState('');
    const [verifying, setVerifying] = useState(false);

    const handleVerify = async () => {
      const expectedOtp = String(item.otp ?? '').trim();
      const providedOtp = otpInput.trim();
      if (!expectedOtp || expectedOtp.length < 4) {
        toast.error('OTP not available.');
        return;
      }
      if (providedOtp.length < 4) {
        toast.error('Enter the full OTP.');
        return;
      }
      setVerifying(true);
      if (providedOtp === expectedOtp) {
        try {
          const docRef = doc(db, 'donations', item.id);
          await updateDoc(docRef, { status: 'completed' });
          toast.success('Pickup verified! +10 Karma Points');
        } catch (e) {
          toast.error('Error updating status');
        }
      } else {
        toast.error('Wrong OTP!');
      }
      setVerifying(false);
    };

    return (
      <div className="mt-2 bg-yellow-100 p-3 rounded-lg border-2 border-yellow-400">
        <p className="text-xs font-bold text-yellow-800 mb-2">NGO is here! Enter OTP:</p>
        <div className="flex gap-2">
          <input
            type="text"
            maxLength={4}
            inputMode="numeric"
            placeholder="0000"
            className="w-24 p-2 rounded border-2 border-dark font-black text-center tracking-widest text-lg"
            value={otpInput}
            onChange={(e) => setOtpInput(e.target.value)}
          />
          <NeoButton onClick={handleVerify} disabled={verifying} className="text-xs px-3 py-1 bg-green-500 hover:bg-green-600 text-white border-green-700">
            {verifying ? '...' : 'Verify'}
          </NeoButton>
        </div>
      </div>
    );
  };

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
        setLocationError(null);
        setAddress(`Map Pin: ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`);
      },
    });
    return position === null ? null : (
      <Marker position={position}>
        <Popup>Selected Location</Popup>
      </Marker>
    );
  }

  function VolunteerMapUpdater({ center }: { center: { lat: number; lng: number } | null }) {
    const map = useMap();
    useEffect(() => {
      if (center) {
        map.flyTo([center.lat, center.lng], 13, { animate: true });
      }
    }, [center, map]);
    return null;
  }

  const suggestionMax = 500;
  const suggestionRemaining = suggestionMax - suggestionText.length;

  return (
    <div className="min-h-screen bg-[#F0F2F5] font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white border-b-2 border-dark p-4 sticky top-0 z-50 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <NeoButton onClick={goToHome} variant="secondary" className="p-2 rounded-full hidden md:flex">
            <Send size={20} className="rotate-180" />
          </NeoButton>
          <h1 className="text-xl md:text-2xl font-black">
            Donor<span className="text-blue-600">Dashboard</span>
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <GoogleTranslate />
          <div className={`hidden md:flex items-center gap-2 px-3 py-1 rounded-full border-2 border-dark font-bold ${stats.karma >= 0 ? 'bg-yellow-100' : 'bg-red-100'}`}>
            <Award size={18} className={stats.karma >= 0 ? 'text-yellow-600' : 'text-red-600'} />
            <span>{stats.karma} Karma</span>
            <span className={`ml-1 text-[10px] font-black px-2 py-0.5 rounded-full border ${karmaLevel.className}`}>{karmaLevel.label}</span>
          </div>
          <button
            className="md:hidden p-2 border-2 border-dark rounded-lg bg-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            <Menu size={24} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 relative max-w-[1400px] mx-auto w-full">
        {mobileMenuOpen && (
          <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setMobileMenuOpen(false)} aria-hidden="true" />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed md:relative top-[70px] md:top-0 left-0 w-64 h-[calc(100vh-70px)] md:h-auto bg-white border-r-2 border-dark p-4 space-y-3 transition-transform duration-300 z-40 overflow-y-auto
            ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        >
          <div className="md:hidden mb-4 p-4 bg-yellow-50 rounded-xl border-2 border-yellow-200 text-center">
            <div className="font-black text-xl">{stats.karma}</div>
            <div className="text-xs font-bold text-gray-500 uppercase">Karma Points</div>
            <div className={`mt-2 inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-full border ${karmaLevel.className}`}>
              {karmaLevel.label}
            </div>
          </div>

          <button
            onClick={() => {
              setActiveTab('donate');
              setMobileMenuOpen(false);
            }}
            className={`w-full text-left p-4 font-bold border-2 border-dark rounded-xl flex items-center gap-3 transition-all ${activeTab === 'donate' ? 'bg-primary shadow-neo translate-x-1' : 'bg-white hover:bg-gray-50'}`}
          >
            <Gift size={20} /> Donate Krdo
          </button>

          <button
            onClick={() => {
              setActiveTab('history');
              setMobileMenuOpen(false);
            }}
            className={`w-full text-left p-4 font-bold border-2 border-dark rounded-xl flex items-center gap-3 transition-all ${activeTab === 'history' ? 'bg-blue-300 shadow-neo translate-x-1' : 'bg-white hover:bg-gray-50'}`}
          >
            <History size={20} /> Tracking & History
          </button>

          <button
            onClick={() => {
              setActiveTab('guide');
              setMobileMenuOpen(false);
            }}
            className={`w-full text-left p-4 font-bold border-2 border-dark rounded-xl flex items-center gap-3 transition-all ${activeTab === 'guide' ? 'bg-green-300 shadow-neo translate-x-1' : 'bg-white hover:bg-gray-50'}`}
          >
            <Info size={20} /> Packing Guide
          </button>

          <button
            onClick={() => {
              setActiveTab('volunteer');
              setMobileMenuOpen(false);
            }}
            className={`w-full text-left p-4 font-bold border-2 border-dark rounded-xl flex items-center gap-3 transition-all ${activeTab === 'volunteer' ? 'bg-yellow-200 shadow-neo translate-x-1' : 'bg-white hover:bg-gray-50'}`}
          >
            <Compass size={20} /> Volunteer Mode
          </button>

          <button
            onClick={() => {
              setActiveTab('suggestions');
              setMobileMenuOpen(false);
            }}
            className={`w-full text-left p-4 font-bold border-2 border-dark rounded-xl flex items-center gap-3 transition-all ${activeTab === 'suggestions' ? 'bg-purple-300 shadow-neo translate-x-1' : 'bg-white hover:bg-gray-50'}`}
          >
            <MessageSquare size={20} /> Suggestions Box
          </button>
        </aside>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto h-[calc(100vh-80px)]">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white border-2 border-dark rounded-2xl p-4 shadow-neo flex items-center justify-between card-lift">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase">Total</p>
                <p className="text-2xl font-black">{stats.total}</p>
              </div>
              <Package size={22} className="text-gray-600" />
            </div>
            <div className="bg-white border-2 border-dark rounded-2xl p-4 shadow-neo flex items-center justify-between card-lift">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase">Completed</p>
                <p className="text-2xl font-black">{stats.completed}</p>
              </div>
              <CheckCircle size={22} className="text-green-600" />
            </div>
            <div className="bg-white border-2 border-dark rounded-2xl p-4 shadow-neo flex items-center justify-between card-lift">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase">Open</p>
                <p className="text-2xl font-black">{stats.available}</p>
              </div>
              <LockKeyhole size={22} className="text-yellow-700" />
            </div>
            <div className="bg-white border-2 border-dark rounded-2xl p-4 shadow-neo flex items-center justify-between card-lift">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase">Reported</p>
                <p className="text-2xl font-black">{stats.reported}</p>
              </div>
              <AlertCircle size={22} className="text-red-600" />
            </div>
          </div>

          {activeTab === 'donate' && (
            <div className="grid lg:grid-cols-2 gap-8">
              <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="bg-white border-4 border-dark rounded-3xl p-6 md:p-8 shadow-neo h-fit">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-black">Donate Food</h2>
                  <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold border border-green-800 animate-pulse">Live</div>
                </div>

                <div className="mb-6 bg-blue-50 border-2 border-blue-200 rounded-2xl p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="text-xs font-black text-blue-800 uppercase">AI Listing Coach</p>
                      <p className="text-sm font-bold text-gray-700">Get quick tips to improve your listing.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <NeoButton
                        type="button"
                        onClick={handleAiTips}
                        disabled={!hasAi || aiTipsLoading}
                        className="px-4 py-2 text-sm"
                      >
                        {aiTipsLoading ? 'Thinking...' : 'Generate Tips'}
                      </NeoButton>
                      <button
                        type="button"
                        onClick={() => openChat('Help me create the best food donation listing for OneMeal.')}
                        className="text-xs font-bold px-3 py-2 border-2 border-dark rounded-lg bg-white hover:bg-gray-50"
                      >
                        Ask AI
                      </button>
                    </div>
                  </div>

                  {!hasAi && (
                    <p className="mt-3 text-xs font-bold text-red-600">
                      Add <span className="font-black">VITE_GEMINI_API_KEY_DONOR</span> or <span className="font-black">VITE_GEMINI_API_KEY</span> in <code>.env</code> to enable AI tips.
                    </p>
                  )}
                  {aiTipsError && (
                    <p className="mt-3 text-xs font-bold text-red-600">{aiTipsError}</p>
                  )}
                  {aiTips.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs font-bold text-gray-700">
                      {aiTips.map((tip, idx) => (
                        <li key={`${tip}-${idx}`} className="flex items-start gap-2">
                          <span className="mt-0.5 h-2 w-2 rounded-full bg-blue-600" />
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <form onSubmit={handleDonate} className="space-y-5">
                  <div className="flex gap-4 p-1 bg-gray-100 rounded-xl border-2 border-dark">
                    <button
                      type="button"
                      onClick={() => setFoodType('veg')}
                      className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${foodType === 'veg' ? 'bg-green-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}
                    >
                      <Leaf size={18} /> Veg
                    </button>
                    <button
                      type="button"
                      onClick={() => setFoodType('non-veg')}
                      className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${foodType === 'non-veg' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}
                    >
                      <Beef size={18} /> Non-Veg
                    </button>
                  </div>

                  <div className="flex gap-4 p-1 bg-gray-100 rounded-xl border-2 border-dark">
                    <button
                      type="button"
                      onClick={() => setPickupPreference('asap')}
                      className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${pickupPreference === 'asap' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}
                    >
                      ASAP Pickup
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickupPreference('flexible')}
                      className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${pickupPreference === 'flexible' ? 'bg-purple-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}
                    >
                      Flexible
                    </button>
                  </div>

                  <div className="p-4 border-2 border-dashed border-dark rounded-xl bg-gray-50 text-center relative overflow-hidden">
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageSelect}
                      className="hidden"
                      id="food-camera"
                    />
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                      id="food-gallery"
                    />

                    {!imagePreview ? (
                      <div className="flex flex-col items-center gap-3 py-4">
                        <div className="bg-white p-3 rounded-full border-2 border-dark shadow-sm">
                          <Camera size={32} className="text-dark" />
                        </div>
                        <span className="font-bold text-gray-600">Take Photo (Required)</span>
                        <span className="text-xs text-gray-500">Clear, bright photos help AI verify faster.</span>
                        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => cameraInputRef.current?.click()}
                            className="px-4 py-2 rounded-xl border-2 border-dark bg-white font-bold hover:bg-gray-100"
                          >
                            Take Photo
                          </button>
                          <button
                            type="button"
                            onClick={() => galleryInputRef.current?.click()}
                            className="px-4 py-2 rounded-xl border-2 border-dark bg-blue-100 font-bold hover:bg-blue-200"
                          >
                            Upload Image
                          </button>
                        </div>
                        <span className="text-xs text-gray-500">JPG or PNG up to {MAX_IMAGE_MB}MB. You can retry the same photo if needed.</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <img src={imagePreview} alt="Preview" className="w-full h-48 object-cover rounded-lg border-2 border-dark" />
                        <button
                          type="button"
                          onClick={clearSelectedImage}
                          className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full border border-dark z-10 hover:scale-110"
                          aria-label="Remove photo"
                        >
                          <XCircle size={20} />
                        </button>
                        <div className="mt-3 flex flex-col sm:flex-row gap-3">
                          <button
                            type="button"
                            onClick={() => galleryInputRef.current?.click()}
                            className="w-full sm:w-auto px-4 py-2 rounded-xl border-2 border-dark bg-white font-bold hover:bg-gray-100"
                          >
                            Change Image
                          </button>
                          {!isVerified ? (
                            <NeoButton
                              type="button"
                              onClick={verifyFoodWithAI}
                              disabled={aiVerifying}
                              className="w-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center gap-2"
                            >
                              {aiVerifying ? <Sparkles className="animate-spin" /> : <Sparkles />}
                              {aiVerifying ? 'AI Checking...' : 'Verify with AI'}
                            </NeoButton>
                          ) : (
                            <div className="w-full bg-green-100 text-green-800 font-bold py-2 rounded border border-green-500 flex items-center justify-center gap-2">
                              <CheckCircle size={18} /> Food Verified
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="font-bold block mb-1 text-sm">Food Item</label>
                      <div className="flex items-center border-2 border-dark rounded-xl px-3 py-3 bg-white">
                        <Package className="text-gray-500 mr-2 shrink-0" size={18} />
                        <input
                          type="text"
                          placeholder="e.g. 50 Rotis"
                          className="w-full outline-none font-bold text-sm bg-transparent"
                          value={foodItem}
                          maxLength={60}
                          onChange={(e) => {
                            setFoodItem(e.target.value);
                            setFormError(null);
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="font-bold block mb-1 text-sm">Quantity</label>
                      <div className="flex items-center border-2 border-dark rounded-xl px-3 py-3 bg-white">
                        <span className="text-gray-500 mr-2 font-black text-xs">QTY</span>
                        <input
                          type="text"
                          placeholder="e.g. 5kg"
                          className="w-full outline-none font-bold text-sm bg-transparent"
                          value={quantity}
                          maxLength={40}
                          onChange={(e) => {
                            setQuantity(e.target.value);
                            setFormError(null);
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="font-bold block mb-1 text-sm">Phone</label>
                    <div className="flex items-center border-2 border-dark rounded-xl px-3 py-3 bg-white">
                      <Phone className="text-gray-500 mr-3" size={20} />
                        <input
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel"
                          placeholder="9876543210"
                          className="w-full outline-none font-bold bg-transparent"
                          value={phone}
                          maxLength={15}
                          onChange={(e) => {
                            setPhone(e.target.value);
                            setFormError(null);
                          }}
                        />
                    </div>
                    {phone && !isPhoneValid && <p className="text-xs text-red-600 font-bold mt-1 ml-1">Enter a valid phone number.</p>}
                  </div>

                  <div>
                    <label className="font-bold block mb-1 text-sm">Pickup Location</label>
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center border-2 border-dark rounded-xl px-3 py-3 bg-white">
                        <MapPin className="text-gray-500 mr-3" size={20} />
                        <input
                          type="text"
                          placeholder="Address or click Detect"
                          autoComplete="street-address"
                          className="w-full outline-none font-bold bg-transparent"
                          value={address}
                          onChange={(e) => {
                            setAddress(e.target.value);
                            setFormError(null);
                          }}
                        />
                      </div>
                      <NeoButton type="button" onClick={handleGetLocation} className="px-4 bg-secondary text-dark hover:bg-yellow-400">
                        <LocateFixed size={22} />
                      </NeoButton>
                    </div>
                    {location && address && (
                      <p className="text-xs text-green-600 font-bold mt-1 ml-1 flex items-center gap-1">
                        <CheckCircle size={12} /> GPS Locked
                      </p>
                    )}
                    {locationError && <p className="text-xs text-red-600 font-bold mt-1 ml-1">{locationError}</p>}
                  </div>

                  <div className="bg-gray-100 border-2 border-dark rounded-xl p-3">
                    <div className="flex items-center justify-between text-xs font-bold text-gray-600">
                      <span>Form Readiness</span>
                      <span>{readinessPercent}%</span>
                    </div>
                    <div className="h-2 bg-white border border-dark rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-green-400 transition-all" style={{ width: `${readinessPercent}%` }} />
                    </div>
                    {!isVerified && <p className="text-xs text-red-600 font-bold mt-2">AI verification required before submit.</p>}
                  </div>

                  <NeoButton type="submit" disabled={!canSubmit} className={`w-full py-4 text-lg mt-2 ${!canSubmit ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {loading ? (
                      'Listing...'
                    ) : (
                      <>
                        Khana Donate Karo <Send className="ml-2 w-5 h-5" />
                      </>
                    )}
                  </NeoButton>
                  {formError && <p className="text-xs font-bold text-red-600 text-center">{formError}</p>}

                  <button type="button" onClick={() => resetForm({ preserveLocation: true })} className="text-xs font-bold text-gray-500 hover:text-dark underline w-full">
                    Reset form
                  </button>
                </form>
              </motion.div>

              <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="bg-white border-4 border-dark rounded-3xl overflow-hidden shadow-neo h-[500px] relative z-0">
                <MapContainer center={[mapCenter.lat, mapCenter.lng]} zoom={mapZoom} style={{ height: '100%', width: '100%' }}>
                  <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <LocationMarker />
                </MapContainer>

                <div className="absolute top-3 left-3 right-3 flex flex-col gap-2 pointer-events-none">
                  {locationLoading && (
                    <div className="bg-white/90 border-2 border-dark rounded-lg px-3 py-2 text-xs font-bold text-gray-700 shadow-neo">
                      Detecting location...
                    </div>
                  )}
                  {locationError && (
                    <div className="bg-white/90 border-2 border-dark rounded-lg px-3 py-2 text-xs font-bold text-gray-700 shadow-neo pointer-events-auto">
                      <div>Location not available. You can still tap the map to pin a location.</div>
                      <button
                        type="button"
                        onClick={handleGetLocation}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-bold border-2 border-dark rounded-md px-2 py-1 bg-yellow-200 hover:bg-yellow-300"
                      >
                        <RefreshCw size={12} /> Retry
                      </button>
                    </div>
                  )}
                  {!location && !locationLoading && !locationError && (
                    <div className="bg-white/90 border-2 border-dark rounded-lg px-3 py-2 text-xs font-bold text-gray-700 shadow-neo">
                      Tap on the map to pin your pickup location.
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-black mb-6 flex items-center gap-2">
                <History size={32} /> Donation History
              </h2>

              <div className="bg-white border-4 border-dark rounded-3xl p-6 shadow-neo mb-4">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 flex items-center border-2 border-dark rounded-xl px-3 py-2 bg-white">
                    <Search size={16} className="text-gray-500 mr-2" />
                    <input
                      type="text"
                      placeholder="Search by item, quantity, or address"
                      className="w-full outline-none font-bold text-sm bg-transparent"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                    />
                    {historySearch && (
                      <button type="button" onClick={() => setHistorySearch('')} className="text-gray-400 hover:text-dark">
                        <XCircle size={16} />
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <div className="flex items-center border-2 border-dark rounded-xl px-3 py-2 bg-white gap-2">
                      <Filter size={16} className="text-gray-500" />
                      <select
                        value={historyFilter}
                        onChange={(e) => setHistoryFilter(e.target.value as DonationStatus | 'all')}
                        className="font-bold text-sm bg-transparent outline-none"
                      >
                        <option value="all">All</option>
                        <option value="available">Open</option>
                        <option value="on_way">On the way</option>
                        <option value="claimed">Claimed</option>
                        <option value="completed">Completed</option>
                        <option value="reported">Reported</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => setHistorySort(historySort === 'newest' ? 'oldest' : 'newest')}
                      className="flex items-center gap-2 border-2 border-dark rounded-xl px-3 py-2 bg-white font-bold text-sm hover:bg-gray-50"
                    >
                      <ArrowUpDown size={16} className="text-gray-500" />
                      {historySort === 'newest' ? 'Newest' : 'Oldest'}
                    </button>
                  </div>
                </div>

                <div className="mt-3 text-xs font-bold text-gray-500">
                  Showing {filteredDonations.length} of {donations.length}
                </div>
              </div>

              <div className="bg-white border-4 border-dark rounded-3xl p-6 shadow-neo">
                {filteredDonations.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 font-bold">No donations found. Try a different filter.</div>
                ) : (
                  <div className="space-y-4">
                    {filteredDonations.map((item) => (
                      <div key={item.id} className={`flex flex-col md:flex-row justify-between gap-4 bg-gray-50 p-4 rounded-xl border-2 ${item.status === 'reported' ? 'border-red-500 bg-red-50' : 'border-dark'}`}>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-black px-2 py-0.5 rounded text-white ${item.foodType === 'non-veg' ? 'bg-red-500' : 'bg-green-500'}`}>
                              {item.foodType === 'non-veg' ? 'NON-VEG' : 'VEG'}
                            </span>
                            <h3 className="font-black text-lg">{item.foodItem || 'Food Item'}</h3>
                          </div>
                          <p className="text-gray-600 font-medium text-sm">
                            {item.quantity || 'Quantity'} &bull; {item.address || 'Address'}
                          </p>
                          <p className="text-xs text-gray-500 font-bold mt-1">Listed: {formatDate(item.createdAt, item.createdAtClient)}</p>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <div
                            className={`px-3 py-1 rounded-full text-xs font-black border border-dark flex items-center gap-1 ${
                              item.status === 'completed'
                                ? 'bg-green-200 text-green-900'
                                : item.status === 'on_way'
                                ? 'bg-blue-200 text-blue-900 animate-pulse'
                                : item.status === 'claimed'
                                ? 'bg-orange-200 text-orange-900'
                                : item.status === 'reported'
                                ? 'bg-red-200 text-red-900'
                                : 'bg-yellow-200 text-yellow-900'
                            }`}
                          >
                            {item.status === 'available' && 'OPEN'}
                            {item.status === 'on_way' && (
                              <>
                                <Navigation size={12} /> ON WAY
                              </>
                            )}
                            {item.status === 'claimed' && (
                              <>
                                <LockKeyhole size={12} /> CLAIMED
                              </>
                            )}
                            {item.status === 'completed' && (
                              <>
                                <CheckCircle size={12} /> DONE
                              </>
                            )}
                            {item.status === 'reported' && (
                              <>
                                <AlertCircle size={12} /> FAKE
                              </>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRepeatDonation(item)}
                            className="text-xs font-bold border-2 border-dark rounded-lg px-2 py-1 bg-white hover:bg-gray-100 flex items-center gap-1"
                          >
                            <Repeat size={12} /> Repeat
                          </button>

                          <button
                            type="button"
                            onClick={() => reportDonationIssue(item)}
                            className="text-xs font-bold border-2 border-red-400 rounded-lg px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 flex items-center gap-1"
                          >
                            <AlertCircle size={12} /> Report Issue
                          </button>

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
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-black mb-6 flex items-center gap-2">
                <Info size={32} /> Packing Guide
              </h2>
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

          {activeTab === 'volunteer' && (
            <div className="space-y-6">
              <div className="bg-white border-4 border-dark rounded-3xl p-6 shadow-neo">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black flex items-center gap-2">
                      <Compass size={28} /> Volunteer Mode
                    </h2>
                    <p className="text-sm font-bold text-gray-600">Pick up nearby donations when you are free.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleVolunteerToggle}
                      className={`px-4 py-2 rounded-xl border-2 border-dark font-bold text-sm flex items-center gap-2 ${volunteerAvailability ? 'bg-green-200' : 'bg-gray-100'}`}
                    >
                      <UserCheck size={16} />
                      {volunteerAvailability ? 'Available' : 'Paused'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openChat('Share safety tips for food pickup volunteers.')}
                      className="text-xs font-bold px-3 py-2 border-2 border-dark rounded-lg bg-white hover:bg-gray-50"
                    >
                      Ask AI
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <div className="bg-gray-50 border-2 border-dark rounded-xl p-3">
                    <div className="text-xs font-bold text-gray-500 uppercase">Open pickups</div>
                    <div className="text-2xl font-black">{volunteerFeedSorted.length}</div>
                  </div>
                  <div className="bg-gray-50 border-2 border-dark rounded-xl p-3">
                    <div className="text-xs font-bold text-gray-500 uppercase">My active</div>
                    <div className="text-2xl font-black">{volunteerActive.length}</div>
                  </div>
                  <div className="bg-gray-50 border-2 border-dark rounded-xl p-3">
                    <div className="text-xs font-bold text-gray-500 uppercase">Completed</div>
                    <div className="text-2xl font-black">{volunteerCompleted.length}</div>
                  </div>
                  <div className="bg-gray-50 border-2 border-dark rounded-xl p-3">
                    <div className="text-xs font-bold text-gray-500 uppercase">Location</div>
                    <div className="text-sm font-black">{location ? 'GPS Ready' : 'Enable GPS'}</div>
                  </div>
                </div>

                <div className="mt-4 bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 font-black text-blue-800 text-sm">
                    <ShieldCheck size={16} /> Safety checklist
                  </div>
                  <div className="text-xs font-bold text-gray-600 mt-2">
                    Verify donor details, keep food sealed, and share ETA with NGO.
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white border-4 border-dark rounded-3xl p-6 shadow-neo">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-black">Available pickups</h3>
                      <button
                        type="button"
                        onClick={() => openChat('Suggest the best volunteer pickup strategy for today.')}
                        className="text-xs font-bold px-3 py-2 border-2 border-dark rounded-lg bg-white hover:bg-gray-50"
                      >
                        Ask AI
                      </button>
                    </div>

                    {volunteerError && (
                      <div className="mb-3 text-xs font-bold text-red-600">{volunteerError}</div>
                    )}

                    {volunteerLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map((item) => (
                          <div key={item} className="h-28 bg-gray-100 rounded-xl animate-pulse border-2 border-gray-200"></div>
                        ))}
                      </div>
                    ) : volunteerFeedSorted.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 font-bold border-2 border-dashed border-gray-300 rounded-xl">
                        No pickups available right now.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {volunteerFeedSorted.map((item) => {
                          const distanceLabel = typeof item.distance === 'number' ? `${item.distance} km` : 'Distance unknown';
                          const isAssignedToMe = item.volunteerId === userId;
                          const isAssignedToOther = Boolean(item.volunteerId && item.volunteerId !== userId);
                          return (
                            <div
                              key={item.id}
                              className={`border-2 rounded-2xl p-4 shadow-neo transition-colors ${selectedVolunteerId === item.id ? 'border-blue-500 bg-blue-50' : 'border-dark bg-white'}`}
                              onClick={() => setSelectedVolunteerId(item.id)}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="text-lg font-black">{item.foodItem || 'Donation'}</h4>
                                    {item.foodType === 'non-veg' ? (
                                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-200">NON-VEG</span>
                                    ) : (
                                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-green-100 text-green-700 border-green-200">VEG</span>
                                    )}
                                  </div>
                                  <div className="text-xs font-bold text-gray-600">{item.quantity || 'Quantity'} | {item.address || 'Address pending'}</div>
                                  <div className="text-xs font-bold text-gray-400 mt-1">
                                    {distanceLabel} | {getTimeAgo(item.createdAt, item.createdAtClient)}
                                  </div>
                                  {isAssignedToOther && (
                                    <div className="text-[10px] font-black mt-2 text-red-600">Assigned to another volunteer</div>
                                  )}
                                  {isAssignedToMe && (
                                    <div className="text-[10px] font-black mt-2 text-green-700">Assigned to you</div>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={(event) => { event.stopPropagation(); openVolunteerMap(item); }}
                                    className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-blue-500 text-blue-700 bg-blue-50 hover:bg-blue-100 flex items-center gap-1"
                                  >
                                    <Navigation size={14} /> Navigate
                                  </button>
                                  <NeoButton
                                    onClick={(event) => { event.stopPropagation(); handleVolunteerAccept(item); }}
                                    disabled={isAssignedToOther || volunteerActionId === item.id}
                                    className="text-xs px-4 py-2"
                                  >
                                    {isAssignedToMe ? 'Accepted' : 'Accept'}
                                  </NeoButton>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-white border-4 border-dark rounded-3xl overflow-hidden shadow-neo h-[380px] relative">
                    {location ? (
                      <MapContainer center={[location.lat, location.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
                        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Marker position={[location.lat, location.lng]}>
                          <Popup>Your location</Popup>
                        </Marker>
                        {volunteerFeedSorted.map((item) => (
                          item.location ? (
                            <Marker
                              key={item.id}
                              position={[item.location.lat, item.location.lng]}
                              eventHandlers={{ click: () => setSelectedVolunteerId(item.id) }}
                            >
                              <Popup>
                                <div className="text-xs font-bold">{item.foodItem || 'Pickup'}</div>
                                <div className="text-[10px]">{item.quantity || ''}</div>
                              </Popup>
                            </Marker>
                          ) : null
                        ))}
                        <VolunteerMapUpdater center={selectedVolunteerDonation?.location ?? null} />
                      </MapContainer>
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-sm font-bold text-gray-500">
                        Enable location to view the live map.
                      </div>
                    )}
                    <div className="absolute bottom-3 right-3 bg-white/90 border-2 border-dark rounded-lg px-3 py-2 text-[10px] font-bold shadow-neo">
                      Click a card to focus the map.
                    </div>
                  </div>

                  <div className="bg-white border-4 border-dark rounded-3xl p-5 shadow-neo">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-black">My active pickups</h3>
                      <span className="text-xs font-bold text-gray-500">{volunteerActive.length} active</span>
                    </div>
                    {volunteerActive.length === 0 ? (
                      <div className="text-xs font-bold text-gray-500 text-center border-2 border-dashed border-gray-300 rounded-xl p-4">
                        No active pickups yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {volunteerActive.map((item) => (
                          <div key={item.id} className="border-2 border-dark rounded-xl p-3 bg-gray-50">
                            <div className="font-black text-sm">{item.foodItem || 'Pickup'}</div>
                            <div className="text-xs font-bold text-gray-600">{item.quantity || 'Quantity'} | {item.address || 'Address'}</div>
                            <div className="text-[10px] font-bold text-gray-400 mt-1">
                              {formatDate(item.createdAt, item.createdAtClient)}
                            </div>
                            <div className="flex flex-wrap gap-2 mt-3">
                              <button
                                type="button"
                                onClick={() => handleVolunteerComplete(item)}
                                disabled={volunteerActionId === item.id}
                                className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-green-500 bg-green-100 text-green-800 hover:bg-green-200"
                              >
                                Mark complete
                              </button>
                              <button
                                type="button"
                                onClick={() => handleVolunteerRelease(item)}
                                disabled={volunteerActionId === item.id}
                                className="text-xs font-bold px-3 py-2 rounded-lg border-2 border-red-400 bg-red-100 text-red-700 hover:bg-red-200"
                              >
                                Release
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {volunteerCompleted.length > 0 && (
                      <div className="mt-4 border-t border-gray-200 pt-4">
                        <div className="text-xs font-black text-gray-500 uppercase mb-2">
                          Completed pickups
                        </div>
                        <div className="space-y-2">
                          {volunteerCompleted.slice(0, 3).map((item) => (
                            <div key={item.id} className="text-xs font-bold text-gray-600 flex items-center justify-between">
                              <span>{item.foodItem || 'Pickup'}</span>
                              <span>{formatDate(item.createdAt, item.createdAtClient)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'suggestions' && (
            <div className="max-w-2xl mx-auto">
              <h2 className="text-3xl font-black mb-6 flex items-center gap-2">
                <MessageSquare size={32} /> Suggestions Box
              </h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitSuggestion();
                }}
                className="bg-white border-4 border-dark rounded-3xl p-8 shadow-neo"
              >
                <p className="font-bold text-gray-600 mb-4">
                  Found a bug? Have an idea? Or just want to appreciate us? Write to us directly. Admin reads everything!
                </p>
                <textarea
                  className="w-full h-40 border-2 border-dark rounded-xl p-4 font-medium outline-none focus:bg-gray-50 resize-none mb-3"
                  placeholder="Type your message here..."
                  value={suggestionText}
                  maxLength={suggestionMax}
                  disabled={suggestionSubmitting}
                  onChange={(e) => {
                    setSuggestionText(e.target.value);
                    setSuggestionError(null);
                  }}
                ></textarea>
                <div className="flex items-center justify-between text-xs font-bold text-gray-500 mb-4">
                  <span>Be specific for faster fixes.</span>
                  <span>{suggestionRemaining} characters left</span>
                </div>
                {suggestionError && <p className="text-xs font-bold text-red-600 mb-4">{suggestionError}</p>}
                <NeoButton type="submit" disabled={suggestionSubmitting} className="w-full py-3 flex justify-center gap-2">
                  {suggestionSubmitting ? 'Sending...' : 'Send Message'} <Send size={20} />
                </NeoButton>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default DonorDashboard;
