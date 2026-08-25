import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export default function SplashScreen({ isVisible }: { isVisible: boolean }) {
  const [shouldDisplay, setShouldDisplay] = useState(isVisible);

  useEffect(() => {
    if (isVisible) {
      setShouldDisplay(true);
      // Hard watchdog timeout: even if any parent component or context stalls,
      // force dismissal of splash screen after 1.2s max so the app is NEVER blocked.
      const timer = setTimeout(() => {
        setShouldDisplay(false);
      }, 1200);
      return () => clearTimeout(timer);
    } else {
      setShouldDisplay(false);
    }
  }, [isVisible]);

  return (
    <AnimatePresence>
      {shouldDisplay && (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-stone-50 pointer-events-none select-none"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center justify-center gap-4"
          >
            <img
              src="/splashscreen.svg"
              alt="Qfomeai"
              className="w-56 max-w-[75vw] h-auto object-contain drop-shadow-sm"
              onError={(e) => {
                // If splashscreen.svg fails, fallback to standard logo.png or icon
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
