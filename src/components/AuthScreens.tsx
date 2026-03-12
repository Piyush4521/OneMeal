import { useState } from 'react';
import { LoaderCircle, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { NeoButton } from './ui/NeoButton';
import { auth } from '../firebase';

export const AuthLoadingScreen = ({
  title = 'Checking access',
  message = 'Please wait while OneMeal verifies your session.',
}: {
  title?: string;
  message?: string;
}) => (
  <div className="min-h-screen bg-bg flex items-center justify-center p-6">
    <div className="max-w-md w-full bg-white border-4 border-dark rounded-3xl p-8 shadow-neo text-center">
      <div className="mx-auto mb-4 w-16 h-16 rounded-full border-2 border-dark bg-primary/20 flex items-center justify-center">
        <LoaderCircle size={30} className="animate-spin" />
      </div>
      <h1 className="text-3xl font-black">{title}</h1>
      <p className="mt-3 text-sm font-bold text-gray-600">{message}</p>
    </div>
  </div>
);

export const BannedUserScreen = () => {
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut(auth);
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border-4 border-dark rounded-3xl p-8 shadow-neo text-center">
        <div className="mx-auto mb-4 w-16 h-16 rounded-full border-2 border-dark bg-red-100 flex items-center justify-center">
          <ShieldAlert size={30} className="text-red-700" />
        </div>
        <h1 className="text-3xl font-black">Account blocked</h1>
        <p className="mt-3 text-sm font-bold text-gray-600">
          This account has been banned. You can sign out now and contact OneMeal support if you think this is a mistake.
        </p>
        <NeoButton
          onClick={handleLogout}
          variant="danger"
          className="mt-6 w-full justify-center"
          disabled={loggingOut}
        >
          {loggingOut ? 'Signing out...' : 'Sign out'}
        </NeoButton>
      </div>
    </div>
  );
};
