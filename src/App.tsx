import { lazy, Suspense, type ReactElement } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthLoadingScreen, BannedUserScreen } from './components/AuthScreens';
import { AuthProvider, useAuthSession } from './context/AuthContext';
import { getDashboardPath, type DashboardRole } from './lib/roles';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DonorDashboard = lazy(() => import('./pages/DonorDashboard'));
const RecipeHub = lazy(() => import('./pages/RecipeHub'));
const ReceiverDashboard = lazy(() => import('./pages/ReceiverDashboard'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const ChatBot = lazy(() => import('./components/ChatBot').then((module) => ({ default: module.ChatBot })));

export const RouteLoader = () => (
  <AuthLoadingScreen
    title="Loading page"
    message="OneMeal is preparing your page and checking your access."
  />
);

const getNonAdminRedirectPath = (role: DashboardRole | 'admin' | null | undefined) =>
  role === 'donor' || role === 'receiver' ? getDashboardPath(role) : null;

export const DashboardRoute = ({
  children,
  requiredRole,
}: {
  children: ReactElement;
  requiredRole: DashboardRole;
}) => {
  const { isAuthenticated, isBanned, loading, role } = useAuthSession();

  if (loading) return <RouteLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isBanned) return <BannedUserScreen />;
  if (role === requiredRole) return children;

  const redirectPath = getDashboardPath(role);
  if (redirectPath) return <Navigate to={redirectPath} replace />;
  return <Navigate to="/login" replace />;
};

export const AdminRoute = ({ children }: { children: ReactElement }) => {
  const { isAdmin, isAuthenticated, isBanned, loading, role } = useAuthSession();

  if (loading) return <RouteLoader />;
  if (!isAuthenticated) return <Navigate to="/admin" replace />;
  if (isBanned) return <BannedUserScreen />;
  if (isAdmin) return children;

  const redirectPath = getNonAdminRedirectPath(role);
  if (redirectPath) return <Navigate to={redirectPath} replace />;
  return <Navigate to="/admin" replace />;
};

export const LoginGuard = ({ children }: { children: ReactElement }) => {
  const { isAdmin, isAuthenticated, isBanned, loading, role } = useAuthSession();

  if (loading) return <RouteLoader />;
  if (isBanned) return <BannedUserScreen />;
  if (!isAuthenticated) return children;

  const redirectPath = isAdmin ? '/admin-dashboard' : getNonAdminRedirectPath(role);
  if (redirectPath) return <Navigate to={redirectPath} replace />;
  return children;
};

const AppShell = () => {
  const { isBanned } = useAuthSession();

  return (
    <Router>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            border: '2px solid #171717',
            padding: '16px',
            color: '#171717',
            fontWeight: 'bold',
            boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)',
          },
        }}
      />

      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/recipes" element={<RecipeHub />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route
            path="/admin-dashboard"
            element={(
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            )}
          />
          <Route
            path="/login"
            element={(
              <LoginGuard>
                <LoginPage />
              </LoginGuard>
            )}
          />
          <Route
            path="/donor"
            element={(
              <DashboardRoute requiredRole="donor">
                <DonorDashboard />
              </DashboardRoute>
            )}
          />
          <Route
            path="/receiver"
            element={(
              <DashboardRoute requiredRole="receiver">
                <ReceiverDashboard />
              </DashboardRoute>
            )}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      {!isBanned && (
        <Suspense fallback={null}>
          <ChatBot />
        </Suspense>
      )}
    </Router>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;
