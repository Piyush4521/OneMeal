
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
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { addDoc, collection, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import GoogleTranslate from '../components/GoogleTranslate';
import { openChat } from '../lib/chatEvents';
import { useAuthSession } from '../context/AuthContext';
import { getLandingMetrics } from '../lib/backendClient';
import { getDashboardPath } from '../lib/roles';

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

const FLOATING_SHAPES = Array.from({ length: 14 }, (_, index) => index);
const SHAPE_COLORS = ['bg-primary/20', 'bg-secondary/20', 'bg-accent/20'];

const random = (min: number, max: number) => Math.random() * (max - min) + min;

const numberFormatter = new Intl.NumberFormat('en-IN');

const galleryItems = [
  {
    title: 'Wedding Surplus, 300 Meals',
    detail: 'Recovered in 40 minutes with 2 volunteers.',
    tag: 'Solapur',
  },
  {
    title: 'Hostel Kitchen Drive',
    detail: 'Weekly routine, consistent supply.',
    tag: 'Pune',
  },
  {
    title: 'Restaurant Rescue',
    detail: 'Daily close-out pickups, zero waste.',
    tag: 'Mumbai',
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

const toMillis = (value: unknown) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }
  if (typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof (value as { seconds?: number }).seconds === 'number') {
    return (value as { seconds: number }).seconds * 1000;
  }
  return 0;
};

const LandingPage = () => {
  const navigate = useNavigate();
  const { isBanned, loading: sessionLoading, role: userRole, user } = useAuthSession();
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

  useEffect(() => {
    setMounted(true);
    const timer = setTimeout(() => setShowIntro(false), 1600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unsubAnnounce = onSnapshot(doc(db, 'system', 'global'), (docSnapshot) => {
      if (!docSnapshot.exists()) {
        setAnnouncement('');
        return;
      }

      const data = docSnapshot.data();
      if (!data.active || !data.message) {
        setAnnouncement('');
        return;
      }

      const now = Date.now();
      const expiresAt = toMillis(data.expiresAt);
      const createdAt = toMillis(data.createdAt);

      if (expiresAt) {
        setAnnouncement(expiresAt > now ? data.message : '');
        return;
      }

      if (createdAt) {
        setAnnouncement(createdAt + 24 * 60 * 60 * 1000 > now ? data.message : '');
        return;
      }

      setAnnouncement('');
    });
    return () => unsubAnnounce();
  }, []);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const metrics = await getLandingMetrics();
        setImpactStats(metrics.impactStats);
        setFoodLeaders(metrics.foodLeaders);
        setMoneyLeaders(metrics.moneyLeaders);
      } catch (error) {
        console.error('Landing metrics fetch failed:', error);
        setImpactStats({
          donations: 0,
          donors: 0,
          meals: 0,
          foodKg: 0,
        });
        setFoodLeaders([]);
        setMoneyLeaders([]);
      }
    };

    fetchMetrics();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
      navigate('/');
    } catch {
      toast.error('Error logging out');
    }
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: 'smooth' });
  };

  const dashboardPath = user ? getDashboardPath(userRole) : '/login';
  const dashboardReady = Boolean(user && dashboardPath && !isBanned);
  const resolvedDashboardPath = dashboardPath || '/login';

  const donationCount = useCountUp(impactStats.donations);
  const mealCount = useCountUp(impactStats.meals);
  const donorCount = useCountUp(impactStats.donors);
  const foodKgCount = useCountUp(
    impactStats.foodKg,
    1200,
    impactStats.foodKg > 0 && impactStats.foodKg < 10 ? 1 : 0
  );
  const displayFoodKg = impactStats.foodKg > 0
    ? foodKgCount
    : 0;

  const impactCards = useMemo(
    () => [
      {
        label: 'Donations',
        value: numberFormatter.format(donationCount),
        icon: Heart,
        highlight: 'Live pickups',
      },
      {
        label: 'Meals Served',
        value: numberFormatter.format(mealCount),
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
        value: numberFormatter.format(donorCount),
        icon: Users,
        highlight: 'Community power',
      },
    ],
    [donationCount, mealCount, displayFoodKg, donorCount]
  );

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
                {dashboardReady ? (
                  <Link to={resolvedDashboardPath}>
                    <NeoButton
                      variant="secondary"
                      className="text-sm px-4 py-2 items-center gap-2 hidden sm:flex"
                    >
                      <LayoutDashboard size={16} /> Dashboard
                    </NeoButton>
                  </Link>
                ) : (
                  <NeoButton
                    variant="secondary"
                    className="text-sm px-4 py-2 items-center gap-2 hidden sm:flex"
                    disabled
                  >
                    <LayoutDashboard size={16} />
                    {isBanned ? 'Access blocked' : sessionLoading ? 'Checking access...' : 'Role required'}
                  </NeoButton>
                )}
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
            {!user ? (
              <Link to="/login">
                <NeoButton>
                  Donate Now <Heart className="w-5 h-5 fill-dark ml-2" />
                </NeoButton>
              </Link>
            ) : dashboardReady ? (
              <Link to={resolvedDashboardPath}>
                <NeoButton>
                  Donate Now <Heart className="w-5 h-5 fill-dark ml-2" />
                </NeoButton>
              </Link>
            ) : (
              <NeoButton disabled>
                {user ? (isBanned ? 'Account blocked' : 'Checking dashboard...') : 'Login to donate'}
                <Heart className="w-5 h-5 fill-dark ml-2" />
              </NeoButton>
            )}
            <Link to="/recipes">
              <NeoButton variant="secondary">
                Recipes Dekho <ArrowRight className="w-5 h-5 ml-2" />
              </NeoButton>
            </Link>
            <NeoButton variant="secondary" onClick={handleMoneyOpen}
            >
              Pledge Support <Coins className="w-5 h-5 ml-2" />
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
          {!impactStats.donations && (
            <div className="text-xs font-bold text-gray-500">
              No completed donations yet. These counters will start moving as real pickups are verified.
            </div>
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
                  {impactStats.donations} Donations
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

              {foodLeaders.length === 0 ? (
                <div className="text-sm font-bold text-gray-500 border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center">
                  No completed donations yet. The first verified pickups will appear here.
                </div>
              ) : (
                <div className="space-y-4">
                  {foodLeaders.map((hero, index) => (
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
              )}
            </div>

            <div className="bg-white border-4 border-dark rounded-3xl p-6 shadow-neo">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-secondary/80 w-12 h-12 rounded-full border-2 border-dark flex items-center justify-center">
                  <Coins size={22} />
                </div>
                <div>
                  <div className="text-xs font-black uppercase text-gray-500">Top Paid Supporters</div>
                  <div className="text-xl font-black">Confirmed support only</div>
                </div>
              </div>

              {moneyLeaders.length === 0 ? (
                <div className="text-sm font-bold text-gray-500 border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center">
                  No paid support recorded yet. Pledges are not shown here until payment is confirmed.
                </div>
              ) : (
                <div className="space-y-4">
                  {moneyLeaders.map((hero, index) => (
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
                        <div className="text-xs font-bold text-gray-500">Paid support</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
              <h2 className="text-4xl font-black">Community gallery</h2>
              <p className="text-lg font-bold text-gray-600 mt-2">
                Real pickups, real people, real meals served.
              </p>
            </div>
            <NeoButton variant="secondary" onClick={() => openChat('Show me recent impact stories.')}
            >
              View more stories
              <ArrowRight size={18} />
            </NeoButton>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {galleryItems.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white border-4 border-dark rounded-3xl overflow-hidden shadow-neo"
              >
                <div className="h-48 overflow-hidden border-b-4 border-dark">
                  <img src={foodImage} alt={item.title} className="w-full h-full object-cover" />
                </div>
                <div className="p-5">
                  <div className="text-xs font-black uppercase text-gray-500">{item.tag}</div>
                  <div className="text-xl font-black mb-2">{item.title}</div>
                  <p className="text-sm font-bold text-gray-600">{item.detail}</p>
                </div>
              </motion.div>
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
              <Phone /> 7030883504
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
            @Piyush Sonawane & team 2026 OneMeal. All rights reserved
          </div>
          <div className="border-t border-gray-700 pt-8 text-gray-400 font-medium">
            Built with heart and code ❤️.
          </div>
        </div>
      </footer>

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
                <h3 className="text-2xl font-black">Pledge Support</h3>
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
                Payment integration is not live yet. This records a pledge only and does not count as a paid donation.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LandingPage;
