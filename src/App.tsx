import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { AppLoadingProvider, useAppLoading } from './contexts/AppLoadingContext';
import AppInitializer from './components/AppInitializer';
import NavigationSplash from './components/NavigationSplash';
import SplashScreen from './components/SplashScreen';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/client/Home';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import RegisterRestaurant from './pages/auth/RegisterRestaurant';
import RestaurantPage from './pages/client/RestaurantPage';
import Cart from './pages/client/Cart';
import Checkout from './pages/client/Checkout';
import RestaurantDashboard from './pages/restaurant/Dashboard';
import AdminDashboard from './pages/admin/Dashboard';
import Profile from './pages/client/Profile';
import Orders from './pages/client/Orders';
import Favorites from './pages/client/Favorites';
import Services from './pages/client/Services';
import ServiceRequests from './pages/client/ServiceRequests';
import Onboarding from './pages/client/Onboarding';
import Termos from './pages/Termos';
import Privacidade from './pages/Privacidade';
import About from './pages/About';
import CitiesServed from './pages/CitiesServed';
import Support from './pages/Support';
import Consent from './pages/Consent';
import PartnerPage from './pages/PartnerPage';
import Footer from './components/Footer';
import { registerPushNotifications, setupForegroundNotificationListener } from './firebaseMessaging';
import NotificationGuideModal from './components/NotificationGuideModal';
import DriverDashboard from './pages/driver/DriverDashboard';

function ScrollToTop() {
  const { pathname } = useLocation();

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

const ProtectedRoute = ({ children, role }: { children: React.ReactNode, role?: 'admin' | 'restaurant' | 'driver' }) => {
  const { user, profile, isAdmin, isRestaurant, isDriver, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen font-sans">Carregando...</div>;
  if (!user) return <Navigate to="/login" />;

  if (isDriver) {
    if (role === 'driver') {
      return <>{children}</>;
    }
    return <Navigate to="/entregador" />;
  }
  
  // Check if onboarding is complete for clients
  if (!profile?.onboarding_completo && !isAdmin && !isRestaurant) {
    return <Navigate to="/onboarding" />;
  }

  // Check email verification for restaurants
  if (role === 'restaurant' && !user.emailVerified) {
    return <Navigate to="/profile" />;
  }

  if (role === 'admin' && !isAdmin) return <Navigate to="/" />;
  if (role === 'restaurant' && !isRestaurant) return <Navigate to="/" />;

  return <>{children}</>;
};

const ClientRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, isRestaurant, isDriver } = useAuth();
  
  if (isDriver) {
    return <Navigate to="/entregador" />;
  }

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (!isMobile && !isAdmin && !isRestaurant) {
    return <Navigate to="/seja-parceiro" />;
  }
  
  return <>{children}</>;
};

import IOSInstallBanner from './components/IOSInstallBanner';

function AppRoutes() {
  const { user, profile, isAdmin, isRestaurant, isDriver, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showGuide, setShowGuide] = React.useState(false);

  const registrationAttempted = React.useRef(false);

  React.useEffect(() => {
    if (loading || !user) return;

    if (location.pathname === '/' || location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/onboarding') {
      if (isRestaurant) {
        navigate('/restaurant', { replace: true });
      } else if (isDriver) {
        navigate('/entregador', { replace: true });
      }
    }
  }, [loading, user, isAdmin, isRestaurant, isDriver, location.pathname, navigate]);

  React.useEffect(() => {
    if (user && (profile?.onboarding_completo || isAdmin || isRestaurant) && !registrationAttempted.current) {
      registrationAttempted.current = true; // Set early to prevent double registration

      const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as any).standalone === true);

      // On iOS, Web Push is only supported if installed as PWA (standalone)
      if (isIOS && !isStandalone) {
        const alreadyShown = localStorage.getItem('@qfomeai:ios-pwa-guide-shown');
        if (!alreadyShown) {
          setShowGuide(true);
          localStorage.setItem('@qfomeai:ios-pwa-guide-shown', 'true');
        }
      } else if (!('Notification' in window)) {
        console.warn('Browser does not support notifications.');
      } else if (Notification.permission === 'denied' || Notification.permission === 'default') {
        const alreadyShown = localStorage.getItem(`@qfomeai:notification-guide-shown-${Notification.permission}`);
        if (!alreadyShown || Notification.permission === 'default') {
          setShowGuide(true);
          if (Notification.permission === 'denied') {
            localStorage.setItem(`@qfomeai:notification-guide-shown-${Notification.permission}`, 'true');
          }
        }
      } else {
        let unsubscribe: (() => void) | null = null;
        setupForegroundNotificationListener().then(unsub => {
          unsubscribe = unsub;
        });
        registerPushNotifications(user.uid);
        
        return () => {
          if (unsubscribe) unsubscribe();
        };
      }
    }
  }, [user, profile, isAdmin, isRestaurant]);

  React.useEffect(() => {
    if (loading || !user || !profile) return;

    const acceptedLocal = localStorage.getItem('lgpdAccepted') === 'true';

    if (!acceptedLocal && !profile.lgpdAccepted && 
        location.pathname !== '/consent' && 
        location.pathname !== '/termos' && 
        location.pathname !== '/privacidade') {
      navigate('/consent', { replace: true });
    }
  }, [loading, user, profile, location.pathname, navigate]);

  React.useEffect(() => {
    const handlePopState = () => {
      // Determine the correct "home" path based on user role
      let homePath = '/';
      if (isRestaurant) homePath = '/restaurant';

      // If we are not on the home path, navigate to it
      if (location.pathname !== homePath && isRestaurant) {
        navigate(homePath, { replace: true });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate, location.pathname, isRestaurant]);

  if (loading) {
    return <SplashScreen isVisible={true} />;
  }

  return (
    <>
      <IOSInstallBanner />
      {showGuide && <NotificationGuideModal onClose={() => setShowGuide(false)} />}
      <div className="flex-grow">
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />
          <Route path="/register-restaurant" element={<RegisterRestaurant />} />
          <Route path="/termos" element={<Termos />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/sobre" element={<About />} />
          <Route path="/cidades-atendidas" element={<CitiesServed />} />
          <Route path="/suporte" element={<Support />} />
          <Route path="/consent" element={user ? <Consent /> : <Navigate to="/login" />} />
          <Route path="/seja-parceiro" element={<PartnerPage />} />
          <Route path="/onboarding" element={user ? (profile?.onboarding_completo ? <Navigate to="/" /> : <Onboarding />) : <Navigate to="/login" />} />
          
          {/* Restaurant Routes */}
          <Route path="/restaurant/*" element={
            <ProtectedRoute role="restaurant">
              <RestaurantDashboard />
            </ProtectedRoute>
          } />

          {/* Entregador / Driver Routes */}
          <Route path="/entregador/*" element={
            <ProtectedRoute role="driver">
              <DriverDashboard />
            </ProtectedRoute>
          } />

          {/* Client Routes */}
          <Route path="/" element={
            <ClientRoute>
              {user && !profile?.onboarding_completo && !isAdmin && !isRestaurant 
                ? <Navigate to="/onboarding" /> 
                : <Home />}
            </ClientRoute>
          } />
          <Route path="/restaurantes" element={<Home />} />
          <Route path="/:slug" element={<RestaurantPage />} />
          <Route path="/:slug/cardapio" element={<RestaurantPage />} />
          <Route path="/:slug/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
          
          <Route path="/cart" element={
            user && !profile?.onboarding_completo && !isAdmin && !isRestaurant 
              ? <Navigate to="/onboarding" /> 
              : <Cart />
          } />
          <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
          <Route path="/favorites" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />
          <Route path="/servicos" element={<Services />} />
          <Route path="/servicos/solicitacoes" element={<ServiceRequests />} />

          {/* Admin Routes */}
          <Route path="/admin-dashboard/*" element={
            <ProtectedRoute role="admin">
              <AdminDashboard />
            </ProtectedRoute>
          } />
        </Routes>
      </div>
      {/* Footer is hidden on the main home page per user request */}
    </>
  );
}

function AppContent() {
  const { isVisible } = useAppLoading();
  return (
    <>
      <SplashScreen isVisible={isVisible} />
      <Router>
        <ScrollToTop />
        <NavigationSplash />
        <AppInitializer>
          <div className="min-h-screen bg-stone-50 text-stone-900 font-sans flex flex-col">
            <AppRoutes />
          </div>
        </AppInitializer>
      </Router>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <CartProvider>
          <AppLoadingProvider>
            <AppContent />
          </AppLoadingProvider>
        </CartProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
