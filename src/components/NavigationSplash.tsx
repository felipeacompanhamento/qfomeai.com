import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppLoading } from '../contexts/AppLoadingContext';

export default function NavigationSplash() {
  const location = useLocation();
  const { triggerSplash } = useAppLoading();

  useEffect(() => {
    // Trigger splash on location change
    triggerSplash();
  }, [location, triggerSplash]);

  return null;
}
