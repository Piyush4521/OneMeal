import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, Wrench, Eye, EyeOff, Wifi, WifiOff } from 'lucide-react';
import { NeoButton } from '../components/ui/NeoButton';
import toast from 'react-hot-toast';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const AdminLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const OWNER_EMAIL = "missiononemeal@gmail.com";

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

  const safeEmail = email.trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail);
  const emailError =
    touched.email && !safeEmail ? 'Email is required.' : touched.email && !emailLooksValid ? 'Enter a valid email.' : '';
  const passwordError = touched.password && !password ? 'Password is required.' : '';
  const canSubmit = !loading && emailLooksValid && !!password;

  const getAuthErrorMessage = (error: any) => {
    const code = error?.code || '';
    switch (code) {
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/user-disabled':
        return 'This account is disabled.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Invalid email or password.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      default:
        return error?.message || 'Login failed. Please try again.';
    }
  };

  const handleResetPassword = async () => {
    const trimmed = email.trim();
    setTouched((prev) => ({ ...prev, email: true }));
    if (!trimmed) {
      toast.error('Enter your admin email to reset password.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Enter a valid email to reset password.');
      return;
    }
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      toast.success('Password reset email sent.');
    } catch (error: any) {
      toast.error(getAuthErrorMessage(error));
    } finally {
      setResetting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!isOnline) {
      toast.error('You appear to be offline.');
      return;
    }
    if (!safeEmail || !emailLooksValid || !password) {
      toast.error('Enter a valid email and password.');
      return;
    }
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, safeEmail, password);
      const user = userCredential.user;
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : null;
      const isAdmin = userData?.role === 'admin';
      const isOwner = user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
      if (isOwner) {
        if (!userSnap.exists() || !isAdmin) {
          toast.loading("Owner detected. Promoting to Admin...", { duration: 2000 });
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            name: "System Owner",
            role: "admin",
            createdAt: userData?.createdAt ?? serverTimestamp()
          }, { merge: true });

          toast.success("Database Fixed! You are now Admin.");
          navigate('/admin-dashboard');
          return;
        }
      }
      if (userSnap.exists() && isAdmin) {
        toast.success("Welcome, Boss!");
        navigate('/admin-dashboard');
      } else {
        await signOut(auth);
        toast.error("Database Error: You don't have 'Admin' role access.");
      }

    } catch (error: any) {
      console.error("Login Error:", error);
      toast.error(getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="bg-white border-4 border-dark rounded-3xl p-8 shadow-neo max-w-md w-full text-center relative overflow-hidden">

        <div className="absolute top-0 left-0 w-full h-2 bg-red-500"></div>

        <div className="bg-red-100 w-20 h-20 rounded-full border-2 border-dark flex items-center justify-center mx-auto mb-6 relative z-10">
          <ShieldCheck size={40} className="text-red-600" />
        </div>

        <h1 className="text-3xl font-black mb-2">Admin Access</h1>
        <p className="text-gray-600 font-bold mb-3 flex items-center justify-center gap-2">
          <Lock size={16} /> Owner Only Area
        </p>
        <div className={`mb-6 text-xs font-bold flex items-center justify-center gap-2 ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          {isOnline ? 'Online' : 'Offline'}
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1 text-left">
            <label htmlFor="admin-email" className="sr-only">Admin Email</label>
            <input
              id="admin-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Admin Email"
              className="w-full border-2 border-dark rounded-xl px-4 py-3 font-bold outline-none focus:bg-gray-50 focus:ring-4 ring-gray-200 transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'admin-email-error' : undefined}
              disabled={loading}
            />
            {emailError && (
              <div id="admin-email-error" className="text-xs font-bold text-red-600">
                {emailError}
              </div>
            )}
          </div>
          <div className="space-y-1 text-left">
            <label htmlFor="admin-password" className="sr-only">Password</label>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Password"
                className="w-full border-2 border-dark rounded-xl px-4 py-3 font-bold outline-none focus:bg-gray-50 focus:ring-4 ring-gray-200 transition-all pr-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => {
                  setTouched((prev) => ({ ...prev, password: true }));
                  setCapsLockOn(false);
                }}
                onKeyUp={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
                onKeyDown={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
                aria-invalid={!!passwordError}
                aria-describedby={passwordError ? 'admin-password-error' : undefined}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {capsLockOn && (
              <div className="text-xs font-bold text-yellow-700">Caps Lock is on.</div>
            )}
            {passwordError && (
              <div id="admin-password-error" className="text-xs font-bold text-red-600">
                {passwordError}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-xs font-bold">
            <button
              type="button"
              onClick={handleResetPassword}
              className="text-red-600 hover:text-red-700"
              disabled={resetting || loading}
            >
              {resetting ? 'Sending reset...' : 'Forgot password?'}
            </button>
            <span className="text-gray-400">Secure admin auth</span>
          </div>
          <NeoButton
            type="submit"
            className="w-full mt-4 bg-red-500 hover:bg-red-600 text-white border-red-900"
            disabled={!canSubmit}
            aria-busy={loading}
          >
            {loading ? "Verifying..." : "Unlock Dashboard"}
          </NeoButton>
        </form>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400 font-bold">
          <Wrench size={12} /> Auto-Fix Enabled for Owner
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
