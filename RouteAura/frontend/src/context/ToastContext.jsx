import { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };
const TONE = { success: 'text-teal-dark', error: 'text-coral-aura', info: 'text-slate-aura' };

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => setItems((s) => s.filter((t) => t.id !== id)), []);
  const push = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s.slice(-3), { id, type, message }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);
  const api = { success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 sm:w-96 pointer-events-none" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => {
            const Icon = ICONS[t.type];
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }}
                className="pointer-events-auto flex items-start gap-3 rounded-xl bg-white shadow-lg ring-1 ring-black/5 p-3.5">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${TONE[t.type]}`} />
                <p className="text-sm flex-1">{t.message}</p>
                <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-slate-aura hover:text-midnight"><X className="h-4 w-4" /></button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
