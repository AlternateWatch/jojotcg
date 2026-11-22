import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export function RulesModal({ open, onClose }: RulesModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Guía rápida del reglamento"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#060508]/88 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="jojo-panel max-h-[88vh] w-full max-w-3xl space-y-4 overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
        <div className="flex items-center justify-between border-b-2 border-[#f2c12e]/30 pb-3">
          <div>
            <div className="font-jojo-heading text-xs tracking-[0.22em] text-[#e6194b] uppercase">
              REFERENCIA RÁPIDA
            </div>
            <h2 className="font-jojo-display text-3xl text-[#f5efe0] uppercase">
              REGLAMENTO OFICIAL
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar reglamento"
            className="jojo-btn-ink flex h-8 w-8 items-center justify-center"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="border-2 border-[#060508] bg-[#0e0b14] p-3.5">
            <h3 className="font-jojo-heading text-sm tracking-widest text-[#f2c12e] uppercase">
              Mazo y Setup Inicial
            </h3>
            <ul className="mt-1.5 space-y-1 text-xs text-zinc-300">
              <li>• Mazo de <strong>46 cartas</strong> (máx. 1 Personaje/Stand/Evo, 3 Objeto, <strong>4 Energía de Stand</strong>, Energías básicas libres).</li>
              <li>• Al empezar, se separan <strong>6 Cartas de Premio boca abajo</strong> (protegiendo tu titular de Turno 1 y evitando apartar cartas de Stand).</li>
              <li>• <strong>Condiciones de victoria</strong>: robar tus <strong>6 Cartas de Premio</strong> (robas 1 por cada personaje rival eliminado), dejar al rival sin personajes en campo/banca o sin cartas en el mazo.</li>
              <li>• Mano inicial de <strong>7 cartas</strong>; banca de hasta <strong>3 personajes</strong> (puedes colocar personajes en banca gratis durante la colocación inicial).</li>
              <li>• <strong>Mulligan</strong> si no tienes personaje inicial válido (sin DG o DG ≤ 4 autosuficiente, o Usuario DG ≤ 4 + Stand compatible); rival roba +1 y <strong>tras 3 mulligans se garantiza mano válida</strong>.</li>
              <li>• <strong>Desbloqueo progresivo de DG</strong>: Activo inicial Turno 1 máx. <strong>DG 4</strong> (o sin DG), Turno 2 <strong>DG 5</strong>, Turno 3+ <strong>DG 6</strong>. Los <strong>Usuarios de Stand</strong> de DG alto sí pueden bajarse a la <strong>banca</strong> desde el Turno 1.</li>
              <li>• En el <strong>Turno 1</strong> no puede atacar el primer jugador ni ningún personaje <strong>sin Stand</strong> (los Usuarios con Stand sí pueden atacar en T1 si salen 2.º).</li>
            </ul>
          </div>

          <div className="border-2 border-[#060508] bg-[#0e0b14] p-3.5">
            <h3 className="font-jojo-heading text-sm tracking-widest text-[#f2c12e] uppercase">
              Fases y Gestión de Banca
            </h3>
            <ul className="mt-1.5 space-y-1 text-xs text-zinc-300">
              <li>• Orden: <strong>Robo → Preparación → Combate → Fin de Turno</strong>.</li>
              <li>• Equipar Stand compatible (Activo o Banca): <strong>Gratis</strong> y otorga <strong>Resonancia (+1 energía adjuntable ese turno, máx. 1/turno)</strong>. Si el usuario es eliminado, su Stand <strong>vuelve barajado al mazo</strong>.</li>
              <li>• <strong>Llamada de Stand</strong>: en Preparación puedes elegir un Usuario en campo sin Stand para invocar y equipar automáticamente un <strong>Stand compatible aleatorio</strong> de tu mazo; <strong>finaliza el turno inmediatamente</strong> (como gestionar la banca).</li>
              <li>• Energías: <strong>1 por turno</strong>. Objetos: <strong>1 por turno</strong> (máx. <strong>1 copia de cada equipable por personaje</strong>). Evoluciones: <strong>1 por turno</strong>.</li>
              <li>• Cualquier acción de banca (bajar / cambiar / retirar) <strong>finaliza el turno inmediatamente</strong> (salvo promoción tras KO o <em>Nigerundayo</em>).</li>
            </ul>
          </div>

          <div className="jojo-panel-cream p-3.5">
            <h3 className="font-jojo-heading text-sm tracking-widest text-[#b3123a] uppercase">
              Estados Elementales
            </h3>
            <ul className="mt-1.5 space-y-1 text-xs font-medium text-[#0b090e]">
              <li>• <strong>Aturdido</strong>: impide atacar y usar habilidades el siguiente turno, pero permite retirar a banca (tras recuperarse otorga 1 turno de resistencia para evitar bloqueos infinitos).</li>
              <li>• <strong>Sangrado</strong>: acumulativo; cada stack inflige 10 de daño al final del turno afectado durante 3 turnos independientes.</li>
              <li>• <strong>Quemado</strong>: 10 de daño fijo al final del turno afectado; se elimina al curar, retirar o promover al Puesto Activo.</li>
            </ul>
          </div>

          <div className="border-2 border-[#060508] bg-[#0e0b14] p-3.5">
            <h3 className="font-jojo-heading text-sm tracking-widest text-[#00b87c] uppercase">
              Defensas y Evoluciones Clave
            </h3>
            <ul className="mt-1.5 space-y-1 text-xs text-zinc-300">
              <li>• <strong>Yare Yare Daze</strong>: descarta 1 carta para anular un estado elemental.</li>
              <li>• <strong>Intelecto Superior (Kars)</strong>: sobrevive a 1 HP ante cualquier KO (1 vez).</li>
              <li>• <strong>Sentido del Viento (Wamuu)</strong>: esquiva el primer ataque una vez por vida.</li>
              <li>• <strong>Tecnología Alemana (Stroheim)</strong>: reduce -10 solo a ataques.</li>
            </ul>
          </div>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
