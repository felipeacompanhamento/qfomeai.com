import React from 'react';
import { resolveUserDestination } from './utils/authResolution';
import { AccountType, UserRole } from './types';
import { auth } from './firebase';

import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { AppLoadingProvider, useAppLoading } from './contexts/AppLoadingContext';
import { ConnectivityProvider } from './contexts/ConnectivityContext';
import AppInitializer from './components/AppInitializer';
import NavigationSplash from './components/NavigationSplash';
import SplashScreen from './components/SplashScreen';
import ErrorBoundary from './components/ErrorBoundary';
import Footer from './components/Footer';
import { registerPushNotifications, setupForegroundNotificationListener } from './firebaseMessaging';
import NotificationGuideModal from './components/NotificationGuideModal';
import { lazyWithRetry } from './utils/lazyWithRetry';
import IOSInstallBanner from './components/IOSInstallBanner';

const Home = lazyWithRetry(() => import('./pages/client/Home'), 'Home');
const Login = lazyWithRetry(() => import('./pages/auth/Login'), 'Login');
const Register = lazyWithRetry(() => import('./pages/auth/Register'), 'Register');
const RegisterRestaurant = lazyWithRetry(() => import('./pages/auth/RegisterRestaurant'), 'RegisterRestaurant');
const RestaurantPage = lazyWithRetry(() => import('./pages/client/RestaurantPage'), 'RestaurantPage');
const Cart = lazyWithRetry(() => import('./pages/client/Cart'), 'Cart');
const Checkout = lazyWithRetry(() => import('./pages/client/Checkout'), 'Checkout');
const RestaurantDashboard = lazyWithRetry(() => import('./pages/restaurant/Dashboard'), 'RestaurantDashboard');
const AdminDashboard = lazyWithRetry(() => import('./pages/admin/Dashboard'), 'AdminDashboard');
const Profile = lazyWithRetry(() => import('./pages/client/Profile'), 'Profile');
const Orders = lazyWithRetry(() => import('./pages/client/Orders'), 'Orders');
const Favorites = lazyWithRetry(() => import('./pages/client/Favorites'), 'Favorites');
const Services = lazyWithRetry(() => import('./pages/client/Services'), 'Services');
const ServiceRequests = lazyWithRetry(() => import('./pages/client/ServiceRequests'), 'ServiceRequests');
const Onboarding = lazyWithRetry(() => import('./pages/client/Onboarding'), 'Onboarding');
const Termos = lazyWithRetry(() => import('./pages/Termos'), 'Termos');
const Privacidade = lazyWithRetry(() => import('./pages/Privacidade'), 'Privacidade');
const About = lazyWithRetry(() => import('./pages/About'), 'About');
const CitiesServed = lazyWithRetry(() => import('./pages/CitiesServed'), 'CitiesServed');
const Support = lazyWithRetry(() => import('./pages/Support'), 'Support');
const Consent = lazyWithRetry(() => import('./pages/Consent'), 'Consent');
const PartnerPage = lazyWithRetry(() => import('./pages/PartnerPage'), 'PartnerPage');
const DriverDashboard = lazyWithRetry(() => import('./pages/driver/DriverDashboard'), 'DriverDashboard');
const WaiterLoginPage = lazyWithRetry(() => import('./pages/waiter/WaiterLoginPage'), 'WaiterLoginPage');
const WaiterDashboardPage = lazyWithRetry(() => import('./pages/waiter/WaiterDashboardPage'), 'WaiterDashboardPage');

function ScrollToTop() {
  const { pathname } = useLocation();

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

const ProtectedRoute = ({ children, role }: { children: React.ReactNode, role?: 'admin' | 'restaurant' | 'driver' | 'waiter' }) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isWaiterRoute = location.pathname.startsWith('/garcom');

  if (!user || !profile) {
    const redirectPath = isWaiterRoute ? "/garcom/login" : "/login";
    return <Navigate to={redirectPath} state={{ from: location }} replace />;
  }

  const resolution = resolveUserDestination(profile);
  
  if (!resolution.isValid) {
     setTimeout(() => auth.signOut(), 0);
     if (isWaiterRoute || role === 'waiter') {
       let errorType = 'invalid';
       const status = String(profile?.status || '').toUpperCase();
       const isWaiter = profile?.role === 'WAITER';
       const hasRestaurant = typeof profile?.restaurantId === 'string' && profile.restaurantId.trim().length > 0;

       if (!isWaiter) {
         errorType = 'not_waiter';
       } else if (status === 'BLOCKED') {
         errorType = 'blocked';
       } else if (status === 'INACTIVE' || profile?.active === false) {
         errorType = 'inactive';
       } else if (!hasRestaurant) {
         errorType = 'unconfigured';
       }
       return <Navigate to={`/garcom/login?error=${errorType}`} replace />;
     }
     return <Navigate to={`/login?error=invalid`} replace />;
  }

  if (role === 'admin' && resolution.destination !== '/admin-dashboard') return <Navigate to="/" replace />;
  if (role === 'driver' && resolution.destination !== '/entregador') return <Navigate to="/" replace />;
  if (role === 'waiter' && resolution.destination !== '/garcom') return <Navigate to="/" replace />;
  
  // Para 'restaurant', ele pode ter vários destinos dentro de /restaurant, então checamos se começa com /restaurant
  if (role === 'restaurant' && !resolution.destination?.startsWith('/restaurant')) return <Navigate to="/" replace />;

  return <>{children}</>;
};

const ClientRoute = ({ children }: { children: React.ReactNode }) => {
  const { profile, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  
  if (profile) {
    const resolution = resolveUserDestination(profile);
    if (!resolution.isValid) {
       setTimeout(() => auth.signOut(), 0);
       return <Navigate to="/login?error=invalid" replace />;
    }
    if (resolution.isValid && resolution.destination && resolution.destination !== '/') {
       return <Navigate to={resolution.destination} replace />;
    }
  }
  
  return <>{children}</>;
};

function AppRoutes() {
  const { user, profile, isAdmin, isRestaurant, isDriver, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showGuide, setShowGuide] = React.useState(false);

  const registrationAttempted = React.useRef(false);

  React.useEffect(() => {
    if (loading || !user || !profile) return;

    if (location.pathname === '/' || location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/profile') {
      const resolution = resolveUserDestination(profile);
      
      if (!resolution.isValid) {
         setTimeout(() => auth.signOut(), 0);
         if (location.pathname !== '/login') navigate(`/login?error=invalid`, { replace: true });
         return;
      }
      
      if (resolution.isValid && resolution.destination) {
        // Preservar rotas permitidas e evitar loop
        // Para /profile, só redireciona se for um funcionário/entregador (onde /profile não faz sentido)
        // ou se o destino for diferente da raiz '/' para clientes.
        if (location.pathname === '/profile' && resolution.destination === '/') {
           return; // Cliente acessando profile
        }
        
        if (location.pathname !== resolution.destination && resolution.destination !== '/') {
           navigate(resolution.destination, { replace: true });
        }
      }
    }
  }, [loading, user, profile, location.pathname, navigate]);

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

  return (
    <>
      <IOSInstallBanner />
      {showGuide && <NotificationGuideModal onClose={() => setShowGuide(false)} />}
      <div className="flex-grow">
        <React.Suspense fallback={
          <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-stone-400 font-medium">Carregando...</span>
          </div>
        }>
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

            {/* Garçom / Waiter Routes */}
            <Route path="/garcom/login" element={<WaiterLoginPage />} />
            <Route path="/garcom/*" element={
              <ProtectedRoute role="waiter">
                <WaiterDashboardPage />
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
        </React.Suspense>
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
            <ConnectivityProvider>
              <AppContent />
            </ConnectivityProvider>
          </AppLoadingProvider>
        </CartProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
