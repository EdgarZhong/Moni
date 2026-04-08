import { motion } from 'framer-motion';

export const SplashScreen = () => {
  return (
    <motion.div 
      className="fixed inset-0 z-[9999] bg-zinc-950 flex flex-col items-center justify-center"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
    >
      <motion.div 
        className="flex flex-col items-center"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
         {/* App Icon */}
         <img src="/icon.svg" className="w-24 h-24 mb-6" alt="Moni Logo" />
         
         {/* Brand Text */}
         <div className="flex items-baseline space-x-2">
           <span className="font-pixel text-zinc-100 text-sm tracking-widest">PIXEL</span>
           <span className="font-pixel text-emerald-500 text-sm tracking-widest">BILL</span>
         </div>
      </motion.div>
    </motion.div>
  );
};