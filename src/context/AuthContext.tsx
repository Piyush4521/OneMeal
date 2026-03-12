import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getIdTokenResult, onAuthStateChanged, type IdTokenResult, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { isAppRole, type AppRole } from '../lib/roles';

type UserProfile = {
  uid: string;
  name?: string | null;
  email?: string | null;
  role?: AppRole | null;
  banned?: boolean;
};

type AuthSession = {
  user: User | null;
  profile: UserProfile | null;
  role: AppRole | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  claims: IdTokenResult['claims'] | null;
  refreshClaims: () => Promise<void>;
};

const AuthContext = createContext<AuthSession | undefined>(undefined);

type SessionState = Omit<AuthSession, 'refreshClaims'>;

const defaultState: SessionState = {
  user: null,
  profile: null,
  role: null,
  loading: true,
  isAuthenticated: false,
  isAdmin: false,
  isBanned: false,
  claims: null,
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<SessionState>(defaultState);

  const refreshClaims = async () => {
    if (!auth.currentUser) return;
    try {
      const tokenResult = await getIdTokenResult(auth.currentUser, true);
      setSession((prev) => ({
        ...prev,
        claims: tokenResult.claims,
        isAdmin: Boolean(tokenResult.claims.admin),
      }));
    } catch (error) {
      console.error('Failed to refresh auth claims:', error);
    }
  };

  useEffect(() => {
    let unsubscribeProfile: () => void = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      unsubscribeProfile();

      if (!currentUser) {
        setSession({
          ...defaultState,
          loading: false,
        });
        return;
      }

      setSession((prev) => ({
        ...prev,
        user: currentUser,
        loading: true,
      }));

      let claims: IdTokenResult['claims'] | null = null;
      try {
        const tokenResult = await getIdTokenResult(currentUser, true);
        claims = tokenResult.claims;
      } catch (error) {
        console.error('Failed to load auth claims:', error);
      }

      unsubscribeProfile = onSnapshot(
        doc(db, 'users', currentUser.uid),
        (snapshot) => {
          const data = snapshot.data();
          const role = isAppRole(data?.role) ? data.role : null;
          const profile: UserProfile = {
            uid: currentUser.uid,
            name: typeof data?.name === 'string' ? data.name : currentUser.displayName,
            email: typeof data?.email === 'string' ? data.email : currentUser.email,
            role,
            banned: Boolean(data?.banned),
          };

          setSession({
            user: currentUser,
            profile,
            role,
            loading: false,
            isAuthenticated: true,
            isAdmin: Boolean(claims?.admin),
            isBanned: profile.banned ?? false,
            claims,
          });
        },
        (error) => {
          console.error('Failed to load user profile:', error);
          setSession({
            user: currentUser,
            profile: null,
            role: null,
            loading: false,
            isAuthenticated: true,
            isAdmin: Boolean(claims?.admin),
            isBanned: false,
            claims,
          });
        }
      );
    });

    return () => {
      unsubscribeProfile();
      unsubscribeAuth();
    };
  }, []);

  const value = useMemo<AuthSession>(
    () => ({
      ...session,
      refreshClaims,
    }),
    [session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthSession = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthSession must be used within an AuthProvider');
  return context;
};
