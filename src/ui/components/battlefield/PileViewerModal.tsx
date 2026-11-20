import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { getCardById } from '../../../data/cardRegistry';
import { CardView } from '../cards/CardView';

interface PileViewerModalProps {
  title: string;
  cardIds: string[];
  onClose: () => void;
}

export function PileViewerModal({ title, cardIds, onClose }: PileViewerModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#060508]/85 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 10 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        className="jojo-panel max-h-[85vh] w-full max-w-3xl overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b-2 border-[#f2c12e]/25 pb-2">
          <h3 className="font-jojo-display text-xl tracking-wide text-[#f2c12e] uppercase">
            {title} ({cardIds.length})
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="jojo-btn-ink flex h-8 w-8 items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>
        {cardIds.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-400">
            No hay cartas en esta pila todavía.
          </p>
        ) : (
          <div className="flex flex-wrap justify-center gap-3">
            {cardIds.map((id, idx) => {
              const card = getCardById(id);
              if (!card) return null;
              return <CardView key={`${id}-${idx}`} card={card} size="sm" />;
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
