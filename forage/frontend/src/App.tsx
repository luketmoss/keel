import { useEffect } from 'preact/hooks';
import { AuthProvider } from './auth/auth-provider';
import { useAuth } from './auth/auth-context';
import { LoginScreen } from './auth/login-screen';
import { Shell } from './shell/shell';
import { followSystemTheme } from './theme';

/** Signed out, only the sign-in screen exists: no tab or tab bar is rendered. */
function AppContent() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Shell /> : <LoginScreen />;
}

export default function App() {
  useEffect(followSystemTheme, []);
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
