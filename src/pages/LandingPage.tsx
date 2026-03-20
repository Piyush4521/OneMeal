
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  ChefHat,
  Coins,
  Crown,
  Heart,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Megaphone,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Utensils,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { NeoButton } from '../components/ui/NeoButton';
import foodImage from '../assets/img3.png';
import storyImage1 from '../assets/img11.png';
import storyImage2 from '../assets/img12.png';
import storyImage3 from '../assets/img13.png';
import { auth, db, storage } from '../firebase';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { addDoc, collection, doc, getDocs, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import toast from 'react-hot-toast';
import GoogleTranslate from '../components/GoogleTranslate';
import { openChat } from '../lib/chatEvents';

type FoodLeader = {
  name: string;
  karma: number;
  donations: number;
  badge: string;
  message: string;
};

type MoneyLeader = {
  name: string;
  amount: number;
  message: string;
};

type ImpactStats = {
  donations: number;
  donors: number;
  meals: number;
  foodKg: number;
};

type StoryItem = {
  id: string;
  image: string;
  title: string;
  detail: string;
  tag: string;
  body: string;
  location: string;
  author: string;
  roleLabel: string;
  mealsServed: number;
  volunteers: number;
  createdAtMs: number;
  impactNote: string;
  source: 'fallback' | 'community';
};

const FLOATING_SHAPES = Array.from({ length: 14 }, (_, index) => index);
const SHAPE_COLORS = ['bg-primary/20', 'bg-secondary/20', 'bg-accent/20'];
const STORY_IMAGE_MAX_MB = 6;

const random = (min: number, max: number) => Math.random() * (max - min) + min;

const numberFormatter = new Intl.NumberFormat('en-IN');
const storyDateFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });

const fallbackImpact: ImpactStats = {
  donations: 240,
  donors: 80,
  meals: 1200,
  foodKg: 480,
};

const fallbackFoodLeaders: FoodLeader[] = [
  {
    name: 'Aarav',
    karma: 140,
    donations: 14,
    badge: 'Hunger Slayer',
    message: 'Feeds 12 families every month.',
  },
  {
    name: 'Meera',
    karma: 90,
    donations: 9,
    badge: 'Food Ninja',
    message: 'Zero waste for her entire cafe.',
  },
  {
    name: 'Rohan',
    karma: 60,
    donations: 6,
    badge: 'Food Hero',
    message: 'Late-night pickups, always on time.',
  },
];

const fallbackMoneyLeaders: MoneyLeader[] = [
  { name: 'Kriti', amount: 12000, message: 'Fueling 200 meals this week.' },
  { name: 'Dev', amount: 8500, message: 'Supporting volunteer travel costs.' },
  { name: 'Sana', amount: 6000, message: 'Keeps the cold chain running.' },
];

const motivationLines = [
  'Fast pickups, fresh meals.',
  'Zero waste, maximum impact.',
  'Community powered and verified.',
  'Food saved, smiles delivered.',
  'Built with heart and hustle.',
];

const fallbackStories: StoryItem[] = [
  {
    id: 'fallback-story-1',
    image: storyImage1,
    title: 'Wedding Surplus, 300 Meals',
    detail: 'Recovered in 40 minutes with 2 volunteers.',
    tag: 'Solapur',
    body:
      'A local wedding hall called our NGO partner right after dinner service. Two volunteers packed the extra trays, checked seal quality, and routed the food to a nearby shelter before midnight. What could have been waste became hot meals for families the same night.',
    location: 'Solapur, Maharashtra',
    author: 'Sahyog Shelter Team',
    roleLabel: 'NGO Story',
    mealsServed: 300,
    volunteers: 2,
    createdAtMs: new Date('2026-02-11T19:30:00+05:30').getTime(),
    impactNote: 'Large event rescue completed within one pickup window.',
    source: 'fallback',
  },
  {
    id: 'fallback-story-2',
    image: storyImage2,
    title: 'Hostel Kitchen Drive',
    detail: 'Weekly routine, consistent supply.',
    tag: 'Pune',
    body:
      'An engineering hostel now shares its extra dinner prep every Friday. The kitchen team labels every container, our NGO logs the pickup, and community volunteers distribute the food to students and workers staying in temporary housing nearby.',
    location: 'Pune, Maharashtra',
    author: 'Campus Meal Circle',
    roleLabel: 'NGO Story',
    mealsServed: 160,
    volunteers: 4,
    createdAtMs: new Date('2026-02-19T18:00:00+05:30').getTime(),
    impactNote: 'A recurring weekly flow now prevents waste before it starts.',
    source: 'fallback',
  },
  {
    id: 'fallback-story-3',
    image: storyImage3,
    title: 'Restaurant Rescue',
    detail: 'Daily close-out pickups, zero waste.',
    tag: 'Mumbai',
    body:
      'A restaurant owner started sharing safe unsold meals at closing time instead of discarding them. The pickup is now part of the nightly routine, with clear timing, sealed packaging, and a verified NGO handoff that keeps the process fast and trustworthy.',
    location: 'Mumbai, Maharashtra',
    author: 'Seva Route Mumbai',
    roleLabel: 'NGO Story',
    mealsServed: 95,
    volunteers: 3,
    createdAtMs: new Date('2026-03-01T22:00:00+05:30').getTime(),
    impactNote: 'Nightly rescue system reduced end-of-day waste to almost zero.',
    source: 'fallback',
  },
];

const howItWorks = [
  {
    title: 'List the food',
    detail: 'Add food, quantity, and pickup window.',
    icon: BadgeCheck,
  },
  {
    title: 'AI checks',
    detail: 'Quick verification and safe packing tips.',
    icon: Sparkles,
  },
  {
    title: 'Fast pickup',
    detail: 'Nearby NGO + volunteer route match.',
    icon: MapPin,
  },
];

const useCountUp = (target: number, duration = 1200, decimals = 0) => {
  const [value, setValue] = useState(0);
  const previousRef = useRef(0);

  useEffect(() => {
    const from = previousRef.current;
    const to = target;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      const factor = Math.pow(10, decimals);
      setValue(Math.round(current * factor) / factor);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        previousRef.current = to;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, decimals]);

  return value;
};

const parseQuantityKg = (value?: string) => {
  if (!value) return 0;
  const cleaned = value.toLowerCase();
  const match = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) return 0;
  if (/\bkg/.test(cleaned)) return amount;
  if (/\b(g|gm|gram|grams)\b/.test(cleaned)) return amount / 1000;
  return 0;
};

const getFoodBadge = (karma: number) => {
  if (karma >= 120) return 'Hunger Slayer';
  if (karma >= 70) return 'Food Ninja';
  return 'Food Hero';
};

const getStoryMillis = (value: unknown, fallback = Date.now()) => {
  if (!value) return fallback;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (typeof value === 'object' && value && 'toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === 'object' && value && 'seconds' in value && typeof (value as { seconds?: unknown }).seconds === 'number') {
    return (value as { seconds: number }).seconds * 1000;
  }
  return fallback;
};

const sanitizeNumberInput = (value: string) => value.replace(/[^\d]/g, '');

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

  if (/permission-denied|storage\/unauthorized/i.test(code) || /permission|unauthorized/i.test(message)) {
    return 'Permission denied. Please check Firebase Storage and Firestore rules for stories.';
  }
  if (/unauth|auth\//i.test(code) || /sign in|login/i.test(message)) {
    return 'Please sign in again as NGO and retry.';
  }
  if (/network|offline|failed to fetch|unavailable/i.test(message) || /network-request-failed/i.test(code)) {
    return 'Network issue detected. Please retry when your connection is stable.';
  }

  return message ? `${fallback} ${message}` : fallback;
};

const LandingPage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<'donor' | 'receiver' | null>(null);
  const [foodLeaders, setFoodLeaders] = useState<FoodLeader[]>([]);
  const [moneyLeaders, setMoneyLeaders] = useState<MoneyLeader[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [impactStats, setImpactStats] = useState<ImpactStats>({
    donations: 0,
    donors: 0,
    meals: 0,
    foodKg: 0,
  });
  const [mounted, setMounted] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [recipeInput, setRecipeInput] = useState('');
  const [showMoneyModal, setShowMoneyModal] = useState(false);
  const [moneyName, setMoneyName] = useState('');
  const [moneyAmount, setMoneyAmount] = useState('');
  const [moneyMessage, setMoneyMessage] = useState('');
  const [moneySubmitting, setMoneySubmitting] = useState(false);
  const [communityStories, setCommunityStories] = useState<StoryItem[]>([]);
  const [activeStoryIndex, setActiveStoryIndex] = useState<number | null>(null);
  const [showStoryUploadModal, setShowStoryUploadModal] = useState(false);
  const [storyTitle, setStoryTitle] = useState('');
  const [storyLocation, setStoryLocation] = useState('');
  const [storySummary, setStorySummary] = useState('');
  const [storyBody, setStoryBody] = useState('');
  const [storyMeals, setStoryMeals] = useState('');
  const [storyVolunteers, setStoryVolunteers] = useState('');
  const [storyImageFile, setStoryImageFile] = useState<File | null>(null);
  const [storyImagePreview, setStoryImagePreview] = useState<string | null>(null);
  const [storyUploading, setStoryUploading] = useState(false);
  const [storyUploadError, setStoryUploadError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => setShowIntro(false), 1600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      if (storyImagePreview) URL.revokeObjectURL(storyImagePreview);
    };
  }, [storyImagePreview]);

  useEffect(() => {
    if (!user) {
      setUserRole(null);
      return;
    }
    const unsubRole = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      const data = snap.data();
      const role = data?.role;
      if (role === 'receiver' || role === 'donor') {
        setUserRole(role);
      } else {
        setUserRole('donor');
      }
    }, () => {
      setUserRole('donor');
    });
    return () => unsubRole();
  }, [user]);

  useEffect(() => {
    const unsubAnnounce = onSnapshot(doc(db, 'system', 'global'), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        if (data.active && data.message) {
          if (data.createdAt) {
            const now = new Date().getTime();
            const createdTime = data.createdAt.toDate
              ? data.createdAt.toDate().getTime()
              : new Date(data.createdAt).getTime();
            const hoursDiff = (now - createdTime) / (1000 * 60 * 60);

            if (hoursDiff < 24) {
              setAnnouncement(data.message);
            } else {
              setAnnouncement('');
            }
          } else {
            setAnnouncement(data.message);
          }
        } else {
          setAnnouncement('');
        }
      } else {
        setAnnouncement('');
      }
    });
    return () => unsubAnnounce();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'communityStories'),
      (snapshot) => {
        const mappedStories = snapshot.docs.map<StoryItem | null>((docSnap, index) => {
            const data = docSnap.data();
            const fallbackImage = fallbackStories[index % fallbackStories.length]?.image || foodImage;
            const title = typeof data?.title === 'string' ? data.title.trim() : '';
            const detail = typeof data?.summary === 'string'
              ? data.summary.trim()
              : typeof data?.detail === 'string'
                ? data.detail.trim()
                : '';
            const body = typeof data?.body === 'string'
              ? data.body.trim()
              : detail;

            if (!title || !detail) return null;

            const location = typeof data?.location === 'string' && data.location.trim()
              ? data.location.trim()
              : 'OneMeal Community';
            const mealsServed = Number(data?.mealsServed ?? data?.meals ?? 0);
            const volunteers = Number(data?.volunteers ?? data?.helpers ?? 0);
            const tag = location.split(',')[0]?.trim() || 'Community';

            return {
              id: docSnap.id,
              image: typeof data?.imageUrl === 'string' && data.imageUrl.trim() ? data.imageUrl : fallbackImage,
              title,
              detail,
              tag,
              body,
              location,
              author: typeof data?.authorName === 'string' && data.authorName.trim()
                ? data.authorName.trim()
                : 'NGO Team',
              roleLabel: 'NGO Story',
              mealsServed: Number.isFinite(mealsServed) ? mealsServed : 0,
              volunteers: Number.isFinite(volunteers) ? volunteers : 0,
              createdAtMs: getStoryMillis(data?.createdAt, getStoryMillis(data?.createdAtClient, Date.now())),
              impactNote: typeof data?.impactNote === 'string' && data.impactNote.trim()
                ? data.impactNote.trim()
                : 'Shared from the OneMeal NGO network.',
              source: 'community' as const,
            };
          });

        const nextStories = mappedStories
          .filter((story): story is StoryItem => story !== null)
          .sort((a, b) => b.createdAtMs - a.createdAtMs);

        setCommunityStories(nextStories);
      },
      (error) => {
        console.warn('Community stories read failed:', error);
        setCommunityStories([]);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const q = query(collection(db, 'donations'), where('status', '==', 'completed'));
        const snapshot = await getDocs(q);
        const leaderboardMap: Record<string, { donations: number; karma: number }> = {};
        const donors = new Set<string>();
        let totalKg = 0;
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const donorName = (data?.donorName as string | undefined)
            || (data?.donorId as string | undefined)
            || 'Anonymous';
          donors.add(donorName);
          const existing = leaderboardMap[donorName] || { donations: 0, karma: 0 };
          leaderboardMap[donorName] = {
            donations: existing.donations + 1,
            karma: existing.karma + 10,
          };
          totalKg += parseQuantityKg(data?.quantity);
        });

        const computedLeaders = Object.entries(leaderboardMap)
          .map(([name, stats], index) => ({
            name,
            donations: stats.donations,
            karma: stats.karma,
            badge: getFoodBadge(stats.karma),
            message: motivationLines[index % motivationLines.length],
          }))
          .sort((a, b) => b.karma - a.karma)
          .slice(0, 3);

        const donationCount = snapshot.size;
        const safeFoodKg = Math.round(totalKg * 10) / 10;
        const estimatedMeals = safeFoodKg > 0 ? Math.round(safeFoodKg * 2.5) : donationCount * 5;

        setImpactStats({
          donations: donationCount,
          donors: donors.size,
          meals: estimatedMeals,
          foodKg: safeFoodKg,
        });

        if (computedLeaders.length) setFoodLeaders(computedLeaders);
      } catch (e) {
        console.error('Leaderboard Error (Check Firebase Rules):', e);
      }
    };

    const fetchMoneyLeaders = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'moneyDonations'));
        const totals: Record<string, { amount: number; message?: string }> = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const donorName = (data?.donorName as string | undefined)
            || (data?.name as string | undefined)
            || 'Anonymous';
          const amountValue = Number(data?.amount ?? data?.value ?? data?.total ?? 0);
          if (!Number.isFinite(amountValue)) return;
          const existing = totals[donorName] || { amount: 0, message: undefined };
          const donorMessage = typeof data?.message === 'string' && data.message.trim().length > 0
            ? data.message.trim()
            : existing.message;
          totals[donorName] = { amount: existing.amount + amountValue, message: donorMessage };
        });

        const computedLeaders = Object.entries(totals)
          .map(([name, data], index) => ({
            name,
            amount: data.amount,
            message: data.message || motivationLines[index % motivationLines.length],
          }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3);

        if (computedLeaders.length) setMoneyLeaders(computedLeaders);
      } catch (e) {
        console.error('Money leaderboard fetch failed:', e);
      }
    };

    fetchStats();
    fetchMoneyLeaders();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
      navigate('/');
    } catch (error) {
      toast.error('Error logging out');
    }
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: 'smooth' });
  };

  const statsSource = impactStats.donations > 0 ? impactStats : fallbackImpact;
  const usingFallback = impactStats.donations === 0;
  const dashboardPath = user ? (userRole === 'receiver' ? '/receiver' : '/donor') : '/login';
  const isNgoUser = Boolean(user && userRole === 'receiver');

  const displayedStories = useMemo(() => {
    const merged = [...communityStories, ...fallbackStories];
    const seen = new Set<string>();
    return merged.filter((story) => {
      if (seen.has(story.id)) return false;
      seen.add(story.id);
      return true;
    }).slice(0, 6);
  }, [communityStories]);

  const activeStory = activeStoryIndex === null ? null : displayedStories[activeStoryIndex] ?? null;

  const donationCount = useCountUp(statsSource.donations);
  const mealCount = useCountUp(statsSource.meals);
  const donorCount = useCountUp(statsSource.donors);
  const foodKgCount = useCountUp(
    statsSource.foodKg,
    1200,
    statsSource.foodKg < 10 ? 1 : 0
  );
  const displayFoodKg = statsSource.foodKg > 0
    ? foodKgCount
    : Math.max(1, Math.round(statsSource.donations * 2.5));

  const impactCards = useMemo(
    () => [
      {
        label: 'Donations',
        value: `${numberFormatter.format(donationCount)}+`,
        icon: Heart,
        highlight: 'Live pickups',
      },
      {
        label: 'Meals Served',
        value: `${numberFormatter.format(mealCount)}+`,
        icon: Utensils,
        highlight: 'Families fed',
      },
      {
        label: 'Food Saved',
        value: `${numberFormatter.format(displayFoodKg)} kg`,
        icon: Sparkles,
        highlight: 'Waste prevented',
      },
      {
        label: 'Donor Heroes',
        value: `${numberFormatter.format(donorCount)}+`,
        icon: Users,
        highlight: 'Community power',
      },
    ],
    [donationCount, mealCount, displayFoodKg, donorCount]
  );

  const displayedFoodLeaders = foodLeaders.length ? foodLeaders : fallbackFoodLeaders;
  const displayedMoneyLeaders = moneyLeaders.length ? moneyLeaders : fallbackMoneyLeaders;

  useEffect(() => {
    if (activeStoryIndex === null) return;
    if (displayedStories.length === 0) {
      setActiveStoryIndex(null);
      return;
    }
    if (activeStoryIndex >= displayedStories.length) {
      setActiveStoryIndex(displayedStories.length - 1);
    }
  }, [activeStoryIndex, displayedStories]);

  const handleRecipeJump = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = recipeInput.trim();
    if (trimmed) {
      localStorage.setItem('onemeal_recipe_seed', trimmed);
    }
    navigate('/recipes');
  };

  const handleMoneyOpen = () => {
    setMoneyName(user?.displayName || '');
    setMoneyAmount('');
    setMoneyMessage('');
    setShowMoneyModal(true);
  };

  const resetStoryUploadForm = () => {
    if (storyImagePreview) URL.revokeObjectURL(storyImagePreview);
    setStoryTitle('');
    setStoryLocation('');
    setStorySummary('');
    setStoryBody('');
    setStoryMeals('');
    setStoryVolunteers('');
    setStoryImageFile(null);
    setStoryImagePreview(null);
    setStoryUploadError(null);
  };

  const openStoryViewer = (index: number) => {
    if (!displayedStories.length) {
      toast.error('No stories available right now.');
      return;
    }
    setActiveStoryIndex(index);
  };

  const closeStoryViewer = () => setActiveStoryIndex(null);

  const shiftStory = (direction: 'prev' | 'next') => {
    if (!displayedStories.length) return;
    setActiveStoryIndex((current) => {
      const safeIndex = current ?? 0;
      return direction === 'next'
        ? (safeIndex + 1) % displayedStories.length
        : (safeIndex - 1 + displayedStories.length) % displayedStories.length;
    });
  };

  const handleStoryUploadOpen = () => {
    if (!user) {
      toast.error('Login as NGO to upload a story.');
      navigate('/login');
      return;
    }
    if (!isNgoUser) {
      toast.error('Story uploads are unlocked only for NGO accounts.');
      return;
    }

    resetStoryUploadForm();
    setShowStoryUploadModal(true);
  };

  const handleStoryImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      event.target.value = '';
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      event.target.value = '';
      return;
    }
    if (file.size > STORY_IMAGE_MAX_MB * 1024 * 1024) {
      toast.error(`Story image must be under ${STORY_IMAGE_MAX_MB}MB.`);
      event.target.value = '';
      return;
    }

    if (storyImagePreview) URL.revokeObjectURL(storyImagePreview);
    setStoryImageFile(file);
    setStoryImagePreview(URL.createObjectURL(file));
    setStoryUploadError(null);
    event.target.value = '';
  };

  const handleMoneySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      toast.error('Please login to donate.');
      navigate('/login');
      return;
    }
    const amountValue = Number(moneyAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      toast.error('Enter a valid amount.');
      return;
    }
    setMoneySubmitting(true);
    try {
      await addDoc(collection(db, 'moneyDonations'), {
        amount: amountValue,
        donorName: moneyName || user.displayName || 'Anonymous',
        message: moneyMessage.trim() || null,
        donorId: user.uid,
        status: 'pledged',
        currency: 'INR',
        createdAt: serverTimestamp(),
      });
      toast.success('Thanks! Your pledge is recorded.');
      setShowMoneyModal(false);
    } catch (error) {
      console.error('Money donation error:', error);
      toast.error('Failed to record donation.');
    } finally {
      setMoneySubmitting(false);
    }
  };

  const handleStoryUploadSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      toast.error('Please login as NGO first.');
      navigate('/login');
      return;
    }
    if (!isNgoUser) {
      toast.error('Only NGO accounts can upload stories.');
      return;
    }

    const trimmedTitle = storyTitle.trim();
    const trimmedLocation = storyLocation.trim();
    const trimmedSummary = storySummary.trim();
    const trimmedBody = storyBody.trim();
    const mealsServed = Number(storyMeals);
    const volunteerCount = Number(storyVolunteers);

    if (!trimmedTitle || !trimmedLocation || !trimmedSummary || !trimmedBody) {
      const message = 'Fill title, location, summary, and full story.';
      setStoryUploadError(message);
      toast.error(message);
      return;
    }
    if (!storyImageFile) {
      const message = 'Please add a story image.';
      setStoryUploadError(message);
      toast.error(message);
      return;
    }
    if (!Number.isFinite(mealsServed) || mealsServed <= 0) {
      const message = 'Enter meals served as a valid number.';
      setStoryUploadError(message);
      toast.error(message);
      return;
    }
    if (!Number.isFinite(volunteerCount) || volunteerCount <= 0) {
      const message = 'Enter volunteer count as a valid number.';
      setStoryUploadError(message);
      toast.error(message);
      return;
    }

    setStoryUploading(true);
    setStoryUploadError(null);

    const safeFileName = storyImageFile.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const imagePath = `communityStories/${user.uid}/${Date.now()}-${safeFileName}`;

    try {
      await uploadBytes(storageRef(storage, imagePath), storyImageFile);
      const imageUrl = await getDownloadURL(storageRef(storage, imagePath));

      await addDoc(collection(db, 'communityStories'), {
        title: trimmedTitle,
        summary: trimmedSummary,
        body: trimmedBody,
        location: trimmedLocation,
        mealsServed,
        volunteers: volunteerCount,
        imageUrl,
        imagePath,
        authorId: user.uid,
        authorName: user.displayName || user.email || 'NGO Team',
        authorRole: 'receiver',
        status: 'published',
        impactNote: `${mealsServed} meals supported with ${volunteerCount} volunteers.`,
        createdAt: serverTimestamp(),
        createdAtClient: Date.now(),
      });

      toast.success('Story uploaded and added to the community section.');
      setShowStoryUploadModal(false);
      resetStoryUploadForm();
      scrollToSection('gallery');
    } catch (error) {
      console.error('Story upload failed:', error);
      if (imagePath) {
        deleteObject(storageRef(storage, imagePath)).catch(() => null);
      }
      const message = getActionErrorMessage(error, 'Failed to upload story.');
      setStoryUploadError(message);
      toast.error(message);
    } finally {
      setStoryUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-dark font-sans overflow-x-hidden relative">
      <AnimatePresence>
        {showIntro && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-bg"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="bg-white border-4 border-dark rounded-3xl px-8 py-6 shadow-neo text-center"
            >
              <div className="mx-auto w-16 h-16 rounded-2xl bg-primary border-2 border-dark flex items-center justify-center mb-4">
                <ChefHat size={34} />
              </div>
              <div className="text-2xl font-black tracking-tight">OneMeal</div>
              <div className="text-xs font-bold uppercase text-gray-600 mt-2">
                Save food, serve people
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none hero-mesh">
        {mounted &&
          FLOATING_SHAPES.map((shape) => (
            <motion.div
              key={shape}
              initial={{ opacity: 0, y: 0 }}
              animate={{
                opacity: [0, 0.6, 0],
                y: [0, random(-120, -220), 0],
                x: [0, random(-60, 60), 0],
                rotate: [0, random(-180, 180)],
              }}
              transition={{
                duration: random(14, 26),
                repeat: Infinity,
                delay: random(0, 0.4),
                ease: 'easeInOut',
              }}
              className={`absolute h-10 w-10 rounded-full blur-[1px] ${
                SHAPE_COLORS[shape % SHAPE_COLORS.length]
              }`}
              style={{
                left: `${random(0, 100)}%`,
                top: `${random(0, 100)}%`,
              }}
            />
          ))}
      </div>

      {announcement && (
        <div className="bg-red-500 text-white font-black py-2 px-4 text-center border-b-2 border-dark animate-pulse flex items-center justify-center gap-2 relative z-50">
          <Megaphone size={20} className="animate-bounce" /> {announcement}
        </div>
      )}

      <nav className="border-b-2 border-dark bg-white/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-2xl font-black tracking-tighter flex items-center gap-2">
            <ChefHat className="w-8 h-8" /> OneMeal
          </div>

          <div className="hidden md:flex gap-6">
            <button
              onClick={() => scrollToSection('mission')}
              className="hover:underline decoration-2 underline-offset-4 font-bold"
            >
              Mission
            </button>
            <button
              onClick={() => scrollToSection('leaderboard')}
              className="hover:underline decoration-2 underline-offset-4 font-bold text-yellow-600"
            >
              Leaderboard
            </button>
            <button
              onClick={() => scrollToSection('gallery')}
              className="hover:underline decoration-2 underline-offset-4 font-bold"
            >
              Stories
            </button>
            <button
              onClick={() => scrollToSection('recipes')}
              className="hover:underline decoration-2 underline-offset-4 font-bold"
            >
              Recipe Hub
            </button>
            <button
              onClick={() => scrollToSection('about')}
              className="hover:underline decoration-2 underline-offset-4 font-bold"
            >
              About Us
            </button>
            <button
              onClick={() => scrollToSection('contact')}
              className="hover:underline decoration-2 underline-offset-4 font-bold"
            >
              Contact
            </button>
          </div>

          <div className="flex items-center gap-4">
            <GoogleTranslate />
            {user ? (
              <div className="flex items-center gap-3">
                <Link to={dashboardPath}>
                  <NeoButton
                    variant="secondary"
                    className="text-sm px-4 py-2 items-center gap-2 hidden sm:flex"
                  >
                    <LayoutDashboard size={16} /> Dashboard
                  </NeoButton>
                </Link>
                <NeoButton
                  onClick={handleLogout}
                  variant="danger"
                  className="text-sm px-4 py-2 flex items-center gap-2"
                >
                  <LogOut size={16} /> <span className="hidden sm:inline">Logout</span>
                </NeoButton>
              </div>
            ) : (
              <Link to="/login">
                <NeoButton variant="primary" className="text-sm px-4 py-2">
                  Login Karo Boss
                </NeoButton>
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="border-b-2 border-dark bg-yellow-300 overflow-hidden py-2 relative z-20">
        <div className="animate-marquee whitespace-nowrap font-bold text-sm uppercase tracking-wider flex gap-8">
          <span>Update: Rohit just donated 5kg rice in Solapur</span>
          <span>Update: Priya claimed 3 meals today</span>
          <span>Update: New donation live - wedding leftovers</span>
          <span>Update: 50+ meals distributed today</span>
          <span>Update: Rohit just donated 5kg rice in Solapur</span>
        </div>
      </div>

      <header className="max-w-[1400px] mx-auto px-4 pt-10 pb-12 md:pt-16 md:pb-16 lg:pt-20 lg:pb-20 grid md:grid-cols-2 gap-10 items-center relative z-20">
        <div className="space-y-5">
          <motion.div
            initial={{ rotate: -2 }}
            animate={{ rotate: 0 }}
            className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 border-2 border-dark shadow-neo rounded-lg font-bold transform -rotate-2"
          >
            <Sparkles size={16} /> Stop food waste. Feed people.
          </motion.div>
          <h1 className="text-5xl md:text-7xl font-black leading-tight">
            Extra food hai? <br />
            <span className="bg-primary px-2 border-2 border-dark rounded-lg inline-block transform rotate-1">
              Donate kardo.
            </span>
          </h1>
          <p className="text-xl font-medium text-gray-700">
            Hotels, mess, aur events ka bacha hua khana hungry people tak. <br />
            <span className="font-bold text-dark">Simple. Fast. Punya ka kaam.</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-4 pt-3">
            <Link to={dashboardPath}>
              <NeoButton>
                Donate Now <Heart className="w-5 h-5 fill-dark ml-2" />
              </NeoButton>
            </Link>
            <Link to="/recipes">
              <NeoButton variant="secondary">
                Recipes Dekho <ArrowRight className="w-5 h-5 ml-2" />
              </NeoButton>
            </Link>
            <NeoButton variant="secondary" onClick={handleMoneyOpen}
            >
              Donate Money <Coins className="w-5 h-5 ml-2" />
            </NeoButton>
          </div>
          <button
            type="button"
            onClick={() => openChat('Suggest the best way I can help OneMeal right now.')}
            className="mt-2 text-sm font-bold underline decoration-2 underline-offset-4 hover:text-primary"
          >
            Ask AI for the best way to help
          </button>

          <div className="grid grid-cols-2 gap-3 pt-5">
            {impactCards.map((card) => (
              <div key={card.label} className="bg-white/90 border-2 border-dark rounded-xl p-3 shadow-neo">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-gray-500">
                  <card.icon size={16} /> {card.label}
                </div>
                <div className="text-2xl font-black mt-1">{card.value}</div>
                <div className="text-xs font-bold text-gray-500">{card.highlight}</div>
              </div>
            ))}
          </div>
          {usingFallback && (
            <div className="text-xs font-bold text-gray-500">Showing community impact sample.</div>
          )}
        </div>

        <div className="relative">
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3.2 }}
            className="bg-white border-2 border-dark rounded-3xl p-7 shadow-neo relative z-10 float-slow"
          >
            <div className="aspect-video bg-white rounded-lg border-2 border-dark overflow-hidden flex items-center justify-center mb-4">
              <img src={foodImage} alt="Food Donation" className="w-full h-full object-cover" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-bg p-3 rounded-lg border-2 border-dashed border-gray-300">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Pickup ETA</div>
                <div className="font-black text-xl">25 mins</div>
              </div>
              <div className="bg-bg p-3 rounded-lg border-2 border-dashed border-gray-300">
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">AI Verified</div>
                <div className="font-black text-xl">Safe</div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4 bg-bg p-3 rounded-lg border-2 border-dashed border-gray-300">
              <div className="bg-green-100 p-2 rounded-full border border-dark">
                <TrendingUp size={24} className="text-green-600" />
              </div>
              <div>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Live Impact</div>
                <div className="font-black text-xl flex items-center gap-2">
                  {statsSource.donations > 0 ? statsSource.donations : fallbackImpact.donations}+ Donations
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                </div>
              </div>
            </div>
            <div className="absolute -top-6 -right-6 bg-secondary text-dark border-2 border-dark p-3 rounded-full shadow-neo font-bold rotate-12">
              AI Powered
            </div>
          </motion.div>
          <div className="absolute top-12 left-2 right-0 h-full bg-primary rounded-3xl border-2 border-dark -z-10"></div>
          <div className="static sm:absolute sm:bottom-3 sm:right-4 mt-4 sm:mt-0 mx-auto sm:mx-0 bg-white/95 backdrop-blur border-2 border-dark rounded-2xl shadow-neo px-4 py-3 flex items-center gap-3 z-20">
            <ShieldCheck className="text-green-600" size={22} />
            <div>
              <div className="text-xs font-black text-gray-500 uppercase">Safety First</div>
              <div className="text-sm font-black">Verified Pickup Flow</div>
            </div>
          </div>
        </div>
      </header>

      <section className="border-y-2 border-dark bg-primary overflow-hidden py-4 relative z-20">
        <div className="flex gap-8 animate-marquee whitespace-nowrap font-black text-2xl uppercase tracking-widest">
          <span>Zero Hunger • Food Rescue • AI Packing • Live Tracking • Punya Kamao •</span>
          <span>Zero Hunger • Food Rescue • AI Packing • Live Tracking • Punya Kamao •</span>
        </div>
      </section>

      <section className="py-12 md:py-14 px-4 bg-white border-b-2 border-dark relative z-20">
        <div className="max-w-[1400px] mx-auto grid md:grid-cols-3 gap-6">
          <div className="bg-white border-4 border-dark rounded-2xl p-6 shadow-neo">
            <div className="bg-yellow-200 w-14 h-14 rounded-full flex items-center justify-center border-2 border-dark mb-4">
              <BadgeCheck size={26} className="text-yellow-900" />
            </div>
            <h3 className="text-xl font-black mb-2">Verified donations</h3>
            <p className="text-gray-600 font-bold">AI checks + safety tips before listing goes live.</p>
          </div>
          <div className="bg-white border-4 border-dark rounded-2xl p-6 shadow-neo">
            <div className="bg-green-200 w-14 h-14 rounded-full flex items-center justify-center border-2 border-dark mb-4">
              <MapPin size={26} className="text-green-900" />
            </div>
            <h3 className="text-xl font-black mb-2">Smart routing</h3>
            <p className="text-gray-600 font-bold">Nearby NGOs and volunteers matched in minutes.</p>
          </div>
          <div className="bg-white border-4 border-dark rounded-2xl p-6 shadow-neo">
            <div className="bg-red-200 w-14 h-14 rounded-full flex items-center justify-center border-2 border-dark mb-4">
              <ShieldCheck size={26} className="text-red-900" />
            </div>
            <h3 className="text-xl font-black mb-2">Safe handoff</h3>
            <p className="text-gray-600 font-bold">OTP pickups, photo proof, and real-time updates.</p>
          </div>
        </div>
      </section>

      <section id="leaderboard" className="py-14 md:py-16 px-4 bg-white border-b-2 border-dark relative z-20 bg-dots">
        <div className="max-w-[1400px] mx-auto text-center">
          <div className="bg-yellow-200 w-20 h-20 rounded-full flex items-center justify-center mb-6 border-2 border-dark mx-auto shadow-neo">
            <Trophy size={40} className="text-yellow-800" />
          </div>
          <h2 className="text-5xl font-black mb-4">Karma Leaderboard</h2>
          <p className="text-xl font-bold text-gray-600 mb-8">
            Top food donors and money supporters
          </p>

          <div className="grid lg:grid-cols-2 gap-7 text-left">
            <div className="bg-white border-4 border-dark rounded-3xl p-6 shadow-neo">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-primary/80 w-12 h-12 rounded-full border-2 border-dark flex items-center justify-center">
                  <Utensils size={22} />
                </div>
                <div>
                  <div className="text-xs font-black uppercase text-gray-500">Top Food Donors</div>
                  <div className="text-xl font-black">Meals saved, hearts won</div>
                </div>
              </div>

              <div className="space-y-4">
                {displayedFoodLeaders.map((hero, index) => (
                  <div
                    key={hero.name}
                    className="bg-gray-50 border-2 border-dark rounded-2xl p-4 flex items-center gap-4"
                  >
                    <div className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-dark bg-white font-black">
                      {index === 0 ? <Crown className="text-yellow-500" /> : `#${index + 1}`}
                    </div>
                    <div className="flex-1">
                      <div className="font-black text-lg">{hero.name}</div>
                      <div className="text-xs font-bold uppercase text-gray-500">{hero.badge}</div>
                      <div className="text-sm font-bold text-gray-600">{hero.message}</div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 font-black text-yellow-700">
                        <Star size={16} className="fill-current" /> {hero.karma} Karma
                      </div>
                      <div className="text-xs font-bold text-gray-500">{hero.donations} donations</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border-4 border-dark rounded-3xl p-6 shadow-neo">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-secondary/80 w-12 h-12 rounded-full border-2 border-dark flex items-center justify-center">
                  <Coins size={22} />
                </div>
                <div>
                  <div className="text-xs font-black uppercase text-gray-500">Top Money Donors</div>
                  <div className="text-xl font-black">Fueling logistics and care</div>
                </div>
              </div>

              <div className="space-y-4">
                {displayedMoneyLeaders.map((hero, index) => (
                  <div
                    key={hero.name}
                    className="bg-gray-50 border-2 border-dark rounded-2xl p-4 flex items-center gap-4"
                  >
                    <div className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-dark bg-white font-black">
                      {index === 0 ? <Crown className="text-yellow-500" /> : `#${index + 1}`}
                    </div>
                    <div className="flex-1">
                      <div className="font-black text-lg">{hero.name}</div>
                      <div className="text-sm font-bold text-gray-600">{hero.message}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-green-700">
                        INR {numberFormatter.format(Math.round(hero.amount))}
                      </div>
                      <div className="text-xs font-bold text-gray-500">Donation</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="mission" className="py-14 md:py-16 px-4 bg-white border-b-2 border-dark relative z-20">
        <div className="max-w-[1400px] mx-auto text-center">
          <div className="bg-accent/20 w-20 h-20 rounded-full flex items-center justify-center mb-6 border-2 border-dark mx-auto">
            <Target size={40} />
          </div>
          <h2 className="text-5xl font-black mb-4">Our Mission</h2>
          <p className="text-2xl font-bold text-gray-700 leading-relaxed">
            "India wastes 68 million tonnes of food every year. Humara aim simple hai: iss number ko{' '}
            <span className="bg-primary px-2 border border-dark rounded transform -rotate-1 inline-block">ZERO</span> banana."
          </p>
        </div>

        <div className="max-w-[1400px] mx-auto mt-10 grid md:grid-cols-3 gap-6">
          {howItWorks.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white border-4 border-dark rounded-2xl p-6 shadow-neo"
            >
              <div className="bg-primary/80 w-12 h-12 rounded-full border-2 border-dark flex items-center justify-center mb-4">
                <step.icon size={22} />
              </div>
              <h3 className="text-xl font-black mb-2">{step.title}</h3>
              <p className="text-gray-600 font-bold">{step.detail}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="gallery" className="py-14 md:py-16 px-4 bg-secondary/10 border-b-2 border-dark relative z-20">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
            <div>
              <div className="text-xs font-black uppercase text-gray-500">Impact Stories</div>
              <h2 className="text-4xl font-black">Community stories</h2>
              <p className="text-lg font-bold text-gray-600 mt-2">
                Tap any card to open the full story, impact, and pickup details.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <NeoButton variant="secondary" onClick={() => openStoryViewer(0)}>
                View stories
                <ArrowRight size={18} />
              </NeoButton>
              {isNgoUser ? (
                <NeoButton onClick={handleStoryUploadOpen} className="bg-primary text-dark">
                  Upload NGO story
                </NeoButton>
              ) : user ? (
                <div className="px-4 py-3 text-xs font-black uppercase border-2 border-dark rounded-xl bg-white flex items-center justify-center">
                  NGO login unlocks uploads
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="px-4 py-3 text-xs font-black uppercase border-2 border-dark rounded-xl bg-white hover:bg-gray-50"
                >
                  Login as NGO to upload
                </button>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {displayedStories.map((item, index) => (
              <motion.button
                key={item.id}
                type="button"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -4, x: -4 }}
                whileTap={{ y: 1, x: 1 }}
                onClick={() => openStoryViewer(index)}
                className="bg-white border-4 border-dark rounded-3xl overflow-hidden shadow-neo text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yellow-300"
              >
                <div className="h-48 overflow-hidden border-b-4 border-dark relative">
                  <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                  <div className="absolute left-4 top-4 bg-white/95 border-2 border-dark rounded-full px-3 py-1 text-[10px] font-black uppercase">
                    {item.tag}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent px-4 pb-4 pt-10">
                    <div className="text-xs font-black uppercase tracking-wide text-yellow-200">Tap to view full story</div>
                    <div className="text-sm font-bold text-white">{item.author}</div>
                  </div>
                </div>
                <div className="p-5">
                  <div className="text-xl font-black mb-2">{item.title}</div>
                  <p className="text-sm font-bold text-gray-600">{item.detail}</p>
                  <div className="mt-4 flex items-center justify-between text-xs font-black text-gray-500 uppercase">
                    <span>{item.roleLabel}</span>
                    <span>{numberFormatter.format(item.mealsServed)} meals</span>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      <section id="recipes" className="py-14 md:py-16 px-4 bg-white border-b-2 border-dark relative z-20">
        <div className="max-w-[1400px] mx-auto grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase text-gray-500 mb-3">
              <BookOpen size={16} /> AI Recipe Hub
            </div>
            <h2 className="text-4xl font-black mb-4">Got ingredients? We have recipes.</h2>
            <p className="text-lg font-bold text-gray-600 mb-5">
              Type what you have and get 2-3 AI recipes, healthy swaps, and a mini meal plan.
            </p>
            <form
              onSubmit={handleRecipeJump}
              className="bg-white border-4 border-dark rounded-2xl p-3 shadow-neo flex flex-col md:flex-row gap-2"
            >
              <input
                type="text"
                value={recipeInput}
                onChange={(event) => setRecipeInput(event.target.value)}
                placeholder="e.g. rice, dal, capsicum"
                className="flex-1 bg-transparent p-3 font-bold outline-none"
              />
              <NeoButton type="submit" className="min-w-[160px]">
                Try Recipe AI <ArrowRight size={18} />
              </NeoButton>
            </form>
            <div className="flex flex-wrap gap-2 mt-4">
              {['15-min meals', 'Healthy swaps', 'Zero waste tips'].map((chip) => (
                <span
                  key={chip}
                  className="text-xs font-black uppercase border-2 border-dark rounded-full px-3 py-1 bg-yellow-100"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-white border-4 border-dark rounded-3xl p-6 shadow-neo">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-primary/80 w-12 h-12 rounded-full border-2 border-dark flex items-center justify-center">
                <Utensils size={22} />
              </div>
              <div>
                <div className="text-xs font-black uppercase text-gray-500">Recipe Picks</div>
                <div className="text-xl font-black">Popular in OneMeal</div>
              </div>
            </div>
            <div className="space-y-4">
              {['Masala Khichdi', 'Roti Noodles', 'Seasonal Veg Bowl'].map((recipe) => (
                <div
                  key={recipe}
                  className="bg-gray-50 border-2 border-dark rounded-2xl px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <div className="font-black">{recipe}</div>
                    <div className="text-xs font-bold text-gray-500">Under 20 mins</div>
                  </div>
                  <ArrowRight size={18} />
                </div>
              ))}
            </div>
            <NeoButton variant="secondary" className="mt-6 w-full" onClick={() => navigate('/recipes')}>
              Explore full Recipe Hub
            </NeoButton>
          </div>
        </div>
      </section>

      <section id="about" className="py-14 md:py-16 px-4 bg-secondary/10 border-b-2 border-dark relative z-20">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex flex-col md:flex-row gap-10 items-center">
            <div className="flex-1">
              <div className="bg-white w-20 h-20 rounded-full flex items-center justify-center mb-6 border-2 border-dark">
                <Users size={40} />
              </div>
              <h2 className="text-5xl font-black mb-4">About Us</h2>
              <p className="text-xl font-bold text-gray-700 mb-4">
                We are builders, volunteers, and food lovers who want waste to drop to zero.
              </p>
              <div className="flex flex-col gap-3 mt-4">
                {[
                  'Real-time food tracking',
                  'AI freshness and packing tips',
                  'Verified NGO network',
                ].map((point) => (
                  <div
                    key={point}
                    className="bg-white border-2 border-dark p-4 rounded-xl shadow-neo font-bold flex items-center gap-3"
                  >
                    <Sparkles size={18} className="text-primary" /> {point}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 space-y-4">
              <div className="bg-white border-2 border-dark p-6 rounded-2xl shadow-neo">
                <div className="text-xs font-black uppercase text-gray-500">Vision</div>
                <div className="text-2xl font-black mt-2">A food-secure India with zero waste.</div>
              </div>
              <div className="bg-white border-2 border-dark p-6 rounded-2xl shadow-neo">
                <div className="text-xs font-black uppercase text-gray-500">Values</div>
                <div className="mt-2 space-y-2">
                  <div className="font-bold text-gray-700 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-green-600" /> Safety and trust first
                  </div>
                  <div className="font-bold text-gray-700 flex items-center gap-2">
                    <Heart size={16} className="text-red-600" /> Community powered
                  </div>
                  <div className="font-bold text-gray-700 flex items-center gap-2">
                    <Target size={16} className="text-yellow-600" /> Impact over hype
                  </div>
                </div>
              </div>
              <div className="bg-white border-2 border-dark p-6 rounded-2xl shadow-neo">
                <div className="text-xs font-black uppercase text-gray-500">Need help?</div>
                <p className="font-bold text-gray-600 mt-2">
                  Chat with our AI assistant or reach the team directly.
                </p>
                <NeoButton className="mt-4 w-full" onClick={() => openChat('I need help with donations.')}
                >
                  Talk to OneMeal AI
                </NeoButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer id="contact" className="bg-dark text-bg py-12 md:py-14 px-4 relative z-20">
        <div className="max-w-[1400px] mx-auto text-center">
          <h2 className="text-4xl font-black mb-6 text-white">Contact Us</h2>
          <div className="flex flex-col md:flex-row justify-center gap-6 mb-8">
            <a
              href="mailto:missiononemeal@gmail.com"
              className="flex items-center justify-center gap-2 text-xl font-bold hover:text-primary transition-colors"
            >
              <Mail /> missiononemeal@gmail.com
            </a>
            <div className="flex items-center justify-center gap-2 text-xl font-bold hover:text-primary transition-colors">
              <Phone /> 9175096541 / 7030883504
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            {['Mission', 'Leaderboard', 'Gallery', 'Recipes', 'About', 'Contact'].map((item) => (
              <button
                key={item}
                onClick={() => scrollToSection(item.toLowerCase())}
                className="text-sm font-bold uppercase text-gray-400 hover:text-white"
              >
                {item}
              </button>
            ))}
          </div>
          <div className="flex justify-center mt-8">
            <Link to="/admin" className="text-gray-600 hover:text-white text-sm font-bold opacity-50 flex items-center gap-1">
              <Lock size={12} /> Admin Login
            </Link>
          </div>
          <div className="border-t border-gray-700 pt-8 mt-8 text-gray-400 font-medium">
            @Piyush Sonawane 2026 OneMeal. All rights reserved
          </div>
          <div className="border-t border-gray-700 pt-8 text-gray-400 font-medium">
            Built with heart and code ❤️.
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {activeStory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={closeStoryViewer}
          >
            <motion.div
              initial={{ y: 24, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 16, opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              className="bg-[#FFFDF5] border-4 border-dark rounded-3xl shadow-neo w-full max-w-5xl max-h-[92vh] overflow-hidden grid lg:grid-cols-[1.05fr_0.95fr]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="relative min-h-[260px] lg:min-h-full bg-dark">
                <img src={activeStory.image} alt={activeStory.title} className="w-full h-full object-cover" />
                <div className="absolute left-4 top-4 bg-yellow-200 border-2 border-dark rounded-full px-3 py-1 text-[10px] font-black uppercase">
                  {activeStory.tag}
                </div>
                <div className="absolute right-4 top-4 bg-white border-2 border-dark rounded-full px-3 py-1 text-[10px] font-black uppercase">
                  {activeStory.source === 'community' ? 'Live story' : 'Featured'}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-5 pb-5 pt-12 text-white">
                  <div className="text-xs font-black uppercase tracking-wide text-yellow-200">{activeStory.roleLabel}</div>
                  <h3 className="text-3xl font-black mt-2">{activeStory.title}</h3>
                  <p className="text-sm font-bold text-white/90 mt-2">{activeStory.detail}</p>
                </div>
              </div>

              <div className="p-6 md:p-7 overflow-y-auto">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div>
                    <div className="text-xs font-black uppercase text-gray-500">Story details</div>
                    <div className="text-lg font-black">{activeStory.location}</div>
                  </div>
                  <button
                    type="button"
                    onClick={closeStoryViewer}
                    className="text-xs font-bold px-3 py-2 border-2 border-dark rounded-lg bg-white hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 mb-5">
                  <div className="bg-white border-2 border-dark rounded-2xl p-4">
                    <div className="text-[10px] font-black uppercase text-gray-500">Meals served</div>
                    <div className="text-2xl font-black mt-1">{numberFormatter.format(activeStory.mealsServed)}</div>
                  </div>
                  <div className="bg-white border-2 border-dark rounded-2xl p-4">
                    <div className="text-[10px] font-black uppercase text-gray-500">Volunteers</div>
                    <div className="text-2xl font-black mt-1">{numberFormatter.format(activeStory.volunteers)}</div>
                  </div>
                  <div className="bg-white border-2 border-dark rounded-2xl p-4">
                    <div className="text-[10px] font-black uppercase text-gray-500">Shared by</div>
                    <div className="text-base font-black mt-1">{activeStory.author}</div>
                  </div>
                  <div className="bg-white border-2 border-dark rounded-2xl p-4">
                    <div className="text-[10px] font-black uppercase text-gray-500">Posted</div>
                    <div className="text-base font-black mt-1">{storyDateFormatter.format(new Date(activeStory.createdAtMs))}</div>
                  </div>
                </div>

                <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4 mb-4">
                  <div className="text-[10px] font-black uppercase text-yellow-700">Impact note</div>
                  <p className="font-bold text-gray-700 mt-2">{activeStory.impactNote}</p>
                </div>

                <div className="bg-white border-2 border-dark rounded-2xl p-5">
                  <div className="text-[10px] font-black uppercase text-gray-500 mb-2">Full story</div>
                  <p className="font-bold text-gray-700 whitespace-pre-line leading-relaxed">{activeStory.body}</p>
                </div>

                {displayedStories.length > 1 && (
                  <div className="flex flex-col sm:flex-row gap-3 mt-5">
                    <NeoButton type="button" variant="secondary" className="w-full" onClick={() => shiftStory('prev')}>
                      Previous story
                    </NeoButton>
                    <NeoButton type="button" className="w-full" onClick={() => shiftStory('next')}>
                      Next story <ArrowRight size={18} />
                    </NeoButton>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showStoryUploadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/65 flex items-center justify-center p-4"
            onClick={() => {
              if (!storyUploading) {
                setShowStoryUploadModal(false);
                resetStoryUploadForm();
              }
            }}
          >
            <motion.div
              initial={{ y: 20, scale: 0.95, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 10, scale: 0.98, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
              className="bg-white border-4 border-dark rounded-3xl p-6 shadow-neo w-full max-w-2xl max-h-[92vh] overflow-y-auto"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <div className="text-xs font-black uppercase text-gray-500">NGO only</div>
                  <h3 className="text-2xl font-black">Upload community story</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowStoryUploadModal(false);
                    resetStoryUploadForm();
                  }}
                  disabled={storyUploading}
                  className="text-xs font-bold px-3 py-2 border-2 border-dark rounded-lg bg-white hover:bg-gray-50 disabled:opacity-60"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleStoryUploadSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-600 uppercase">Story title</label>
                    <input
                      type="text"
                      value={storyTitle}
                      onChange={(event) => {
                        setStoryTitle(event.target.value);
                        setStoryUploadError(null);
                      }}
                      placeholder="e.g. Night shelter dinner rescue"
                      className="w-full border-2 border-dark rounded-xl px-3 py-2 font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 uppercase">Location</label>
                    <input
                      type="text"
                      value={storyLocation}
                      onChange={(event) => {
                        setStoryLocation(event.target.value);
                        setStoryUploadError(null);
                      }}
                      placeholder="e.g. Pune, Maharashtra"
                      className="w-full border-2 border-dark rounded-xl px-3 py-2 font-bold outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Short summary</label>
                  <textarea
                    value={storySummary}
                    onChange={(event) => {
                      setStorySummary(event.target.value);
                      setStoryUploadError(null);
                    }}
                    placeholder="1-2 lines for the story card"
                    className="w-full border-2 border-dark rounded-xl px-3 py-2 font-bold outline-none h-24 resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Full story</label>
                  <textarea
                    value={storyBody}
                    onChange={(event) => {
                      setStoryBody(event.target.value);
                      setStoryUploadError(null);
                    }}
                    placeholder="Share what happened, who helped, and the impact."
                    className="w-full border-2 border-dark rounded-xl px-3 py-2 font-bold outline-none h-32 resize-none"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-600 uppercase">Meals served</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={storyMeals}
                      onChange={(event) => {
                        setStoryMeals(sanitizeNumberInput(event.target.value));
                        setStoryUploadError(null);
                      }}
                      placeholder="e.g. 120"
                      className="w-full border-2 border-dark rounded-xl px-3 py-2 font-bold outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-600 uppercase">Volunteers involved</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={storyVolunteers}
                      onChange={(event) => {
                        setStoryVolunteers(sanitizeNumberInput(event.target.value));
                        setStoryUploadError(null);
                      }}
                      placeholder="e.g. 4"
                      className="w-full border-2 border-dark rounded-xl px-3 py-2 font-bold outline-none"
                    />
                  </div>
                </div>

                <div className="border-2 border-dashed border-dark rounded-2xl p-4 bg-gray-50">
                  <label className="text-xs font-bold text-gray-600 uppercase">Story image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleStoryImageSelect}
                    className="mt-2 block w-full text-sm font-bold"
                  />
                  <p className="text-xs font-bold text-gray-500 mt-2">Use JPG/PNG under {STORY_IMAGE_MAX_MB}MB.</p>
                  {storyImagePreview && (
                    <img src={storyImagePreview} alt="Story preview" className="mt-4 h-48 w-full object-cover rounded-2xl border-2 border-dark" />
                  )}
                </div>

                {storyUploadError && <p className="text-xs font-bold text-red-600">{storyUploadError}</p>}

                <NeoButton type="submit" className="w-full" disabled={storyUploading}>
                  {storyUploading ? 'Uploading story...' : 'Publish story'}
                </NeoButton>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMoneyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center p-4"
            onClick={() => setShowMoneyModal(false)}
          >
            <motion.div
              initial={{ y: 20, scale: 0.95, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 10, scale: 0.98, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
              className="bg-white border-4 border-dark rounded-3xl p-6 shadow-neo w-full max-w-md"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-black">Donate Money (Pledge)</h3>
                <button
                  type="button"
                  onClick={() => setShowMoneyModal(false)}
                  className="text-xs font-bold px-3 py-2 border-2 border-dark rounded-lg bg-white hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleMoneySubmit} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Name</label>
                  <input
                    type="text"
                    value={moneyName}
                    onChange={(event) => setMoneyName(event.target.value)}
                    placeholder="Your name"
                    className="w-full border-2 border-dark rounded-xl px-3 py-2 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Amount (INR)</label>
                  <input
                    type="number"
                    min="1"
                    value={moneyAmount}
                    onChange={(event) => setMoneyAmount(event.target.value)}
                    placeholder="e.g. 500"
                    className="w-full border-2 border-dark rounded-xl px-3 py-2 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase">Message (Optional)</label>
                  <textarea
                    value={moneyMessage}
                    onChange={(event) => setMoneyMessage(event.target.value)}
                    placeholder="Why you are donating"
                    className="w-full border-2 border-dark rounded-xl px-3 py-2 font-bold outline-none h-24 resize-none"
                  />
                </div>
                <NeoButton type="submit" className="w-full" disabled={moneySubmitting}>
                  {moneySubmitting ? 'Saving...' : 'Submit Pledge'}
                </NeoButton>
              </form>
              <p className="mt-3 text-xs font-bold text-gray-500">
                Payment integration is coming soon. This saves your pledge for now.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LandingPage;
