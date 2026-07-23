import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

export default function SplashScreen({ isVisible }: { isVisible: boolean }) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white"
        >
          <motion.img
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            src="/splashscreen.svg"
            alt="Logo"
            className="w-64 h-auto object-contain"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
