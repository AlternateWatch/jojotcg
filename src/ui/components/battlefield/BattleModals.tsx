import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Coins, Gift, Map, RefreshCw, ShoppingBag } from 'lucide-react';
import { getCardById, getStandCard } from '../../../data/cardRegistry';
import type { BoosterPackDef } from '../../../data/progressionData';
import {
  getCharacterUnlockTurn,
  hasAnyTurnOneEligibleCharacter,
  hasValidStartingHand,
} from '../../../engine/helpers/cardStats';
import type { GameAction } from '../../../engine/types/actions';
import type { GameState, PlayerId } from '../../../engine/types/state';
import type { OpenPackOutcome } from '../../../services/progressionService';
import type { BattleMode } from '../../../store/useBattleStore';
import { CardView } from '../cards/CardView';

interface BattleModalsProps {
  gameState: GameState;
  mode: BattleMode;
  myId: PlayerId;
  isSpectator?: boolean;
  hotseatHandoffTo: PlayerId | null;
  battleReward?: { coins: number; label: string } | null;
  isCampaign?: boolean;
  isTutorial?: boolean;
  isRoguelike?: boolean;
  campaignPackReward?: { pack: BoosterPackDef; outcomes: OpenPackOutcome[] } | null;
  onOpenCampaignPacks?: () => void;
  onReturnToCampaign?: () => void;
  onReturnToTutorial?: () => void;
  onReturnToRoguelike?: () => void;
  onDispatch: (action: GameAction) => void;
  onConfirmHandoff: () => void;
  onRematch: () => void;
  onOpenShop?: () => void;
  onExitToMenu: () => void;
}

export function BattleModals({
  gameState,
  mode,
  myId,
  isSpectator = false,
  hotseatHandoffTo,
  battleReward,
  isCampaign = false,
  isTutorial = false,
  isRoguelike = false,
  campaignPackReward,
  onOpenCampaignPacks,
  onReturnToCampaign,
  onReturnToTutorial,
  onReturnToRoguelike,
  onDispatch,
  onConfirmHandoff,
  onRematch,
  onOpenShop,
  onExitToMenu,
}: BattleModalsProps) {
  const [setupActiveIdx, setSetupActiveIdx] = useState<number | null>(null);
  const [setupBenchIndices, setSetupBenchIndices] = useState<number[]>([]);

  useEffect(() => {
    setSetupActiveIdx(null);
    setSetupBenchIndices([]);
  }, [gameState.phase, myId]);

  const myPlayer = gameState.players[myId];
  const initialMaxDg = hasAnyTurnOneEligibleCharacter([...myPlayer.hand, ...myPlayer.deck])
    ? 4
    : null;
  const startingHandValid = hasValidStartingHand(myPlayer.hand, initialMaxDg, myPlayer.deck);

  return (
    <AnimatePresence>
      {/* SETUP MULLIGAN */}
      {!isSpectator &&
        gameState.phase === 'SETUP_MULLIGAN' &&
        !myPlayer.isAi &&
        !myPlayer.mulliganConfirmed && (
        <motion.div
          key="modal-mulligan"
          role="dialog"
          aria-modal="true"
          aria-label="Revisión de mano inicial"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#060508]/88 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="jojo-panel w-full max-w-3xl space-y-5 p-6 text-center"
          >
            <div className="inline-block -skew-x-10 border-2 border-[#060508] bg-[#f2c12e] px-3 py-0.5 font-jojo-heading text-xs tracking-[0.2em] text-[#0b090e] uppercase">
              <span className="inline-block skew-x-10">Revisión Inicial — {myPlayer.name}</span>
            </div>
            <h2 className="font-jojo-display text-3xl text-[#f5efe0] uppercase">
              Mano Inicial ({myPlayer.hand.length} cartas)
            </h2>

            <div
              className={`mx-auto max-w-xl border-2 border-[#060508] px-4 py-2 text-xs font-bold ${
                startingHandValid
                  ? 'bg-[#00b87c] text-[#0b090e]'
                  : 'bg-[#e6194b] text-white'
              }`}
            >
              {startingHandValid
                ? 'MANO VÁLIDA — Tienes un personaje inicial válido (sin DG o DG ≤ 4) listo para empezar.'
                : 'MANO INVÁLIDA — Necesitas un personaje inicial (sin DG o DG ≤ 4 autosuficiente, o Usuario DG ≤ 4 + Stand compatible). Debes hacer Mulligan.'}
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              {myPlayer.hand.map((cid, idx) => {
                const c = getCardById(cid);
                return c ? <CardView key={`${cid}-${idx}`} card={c} size="sm" /> : null;
              })}
            </div>

            <div className="flex justify-center pt-1">
              {startingHandValid ? (
                <button
                  type="button"
                  onClick={() => onDispatch({ type: 'CONFIRM_STARTING_HAND', playerId: myId })}
                  className="jojo-btn-primary px-8 py-3 font-jojo-heading text-lg tracking-[0.15em] uppercase"
                >
                  Confirmar Mano
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onDispatch({ type: 'PERFORM_MULLIGAN', playerId: myId })}
                  className="jojo-btn-crimson inline-flex items-center gap-2 px-8 py-3 font-jojo-heading text-lg tracking-[0.14em] uppercase"
                >
                  <RefreshCw size={17} /> Hacer Mulligan (Rival roba +1)
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* ONLINE WAITING FOR OPPONENT SETUP */}
      {mode === 'ONLINE' &&
        !isSpectator &&
        ((gameState.phase === 'SETUP_MULLIGAN' && myPlayer.mulliganConfirmed) ||
          (gameState.phase === 'SETUP_ACTIVE' && myPlayer.setupActiveChosen)) && (
          <motion.div
            key="modal-online-setup-wait"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-[#060508]/80 p-4"
          >
            <div className="jojo-panel max-w-md space-y-3 p-6 text-center">
              <div className="font-jojo-display text-2xl text-[#f2c12e] uppercase">
                ESPERANDO AL RIVAL ONLINE...
              </div>
              <p className="text-xs text-zinc-300">
                Tu rival está preparando su mano inicial o eligiendo su Personaje Activo. El duelo
                comenzará automáticamente en cuanto confirme.
              </p>
            </div>
          </motion.div>
        )}

      {/* SETUP STARTING ACTIVE */}
      {!isSpectator &&
        gameState.phase === 'SETUP_ACTIVE' &&
        !myPlayer.isAi &&
        !myPlayer.setupActiveChosen && (
        <motion.div
          key="modal-setup-active"
          role="dialog"
          aria-modal="true"
          aria-label="Elección de personaje activo inicial"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#060508]/88 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="jojo-panel w-full max-w-3xl space-y-5 p-6 text-center"
          >
            <div className="inline-block -skew-x-10 border-2 border-[#060508] bg-[#e6194b] px-3 py-0.5 font-jojo-heading text-xs tracking-[0.2em] text-white uppercase">
              <span className="inline-block skew-x-10">Colocación Inicial — {myPlayer.name}</span>
            </div>
            <h2 className="font-jojo-display text-3xl text-[#f5efe0] uppercase">
              Elige tu Activo y Banca Inicial
            </h2>
            <p className="text-xs text-zinc-400">
              1.º Haz clic en tu <strong className="text-[#f2c12e]">Personaje Activo</strong> (sin DG o DG ≤ 4).
              2.º Opcionalmente marca hasta <strong className="text-[#00e599]">{gameState.rules.maxBenchSize} personajes</strong> adicionales para empezar en tu <strong className="text-[#00e599]">Banca</strong> gratis (incluidos Usuarios de Stand de DG 5–6).
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {(() => {
                const availableStands = [...myPlayer.hand, ...myPlayer.deck]
                  .map(getStandCard)
                  .filter((s): s is NonNullable<typeof s> => Boolean(s));
                return myPlayer.hand.map((cid, idx) => {
                  const c = getCardById(cid);
                  if (!c) return null;
                  const isChar = c.type === 'CHARACTER';
                  const activeDgAllowed =
                    isChar && (initialMaxDg === null || c.dg === null || c.dg <= initialMaxDg);
                  const benchAllowed =
                    isChar && (c.categories.includes('STAND_USER') || activeDgAllowed);
                  const isSelectedActive = setupActiveIdx === idx;
                  const isSelectedBench = setupBenchIndices.includes(idx);
                  const isReady =
                    activeDgAllowed &&
                    (c.attacks.length > 0 ||
                      (c.dg !== null &&
                        availableStands.some(
                          (st) =>
                            c.dg! >= st.requiredDg &&
                            (!st.compatibleCharacterIds || st.compatibleCharacterIds.includes(c.id)),
                        )));

                  const canClick =
                    isSelectedActive ||
                    isSelectedBench ||
                    (setupActiveIdx === null
                      ? activeDgAllowed
                      : benchAllowed && setupBenchIndices.length < gameState.rules.maxBenchSize);

                  const badgeText = isSelectedActive
                    ? 'ACTIVO'
                    : isSelectedBench
                      ? 'BANCA'
                      : !isChar
                        ? undefined
                        : !activeDgAllowed
                          ? benchAllowed
                            ? 'SOLO BANCA (T1)'
                            : `TURNO ${getCharacterUnlockTurn(c.dg)} (DG${c.dg})`
                          : isReady
                            ? 'LISTO'
                            : 'SIN STAND';

                  const handleCardClick = () => {
                    if (isSelectedActive) {
                      setSetupActiveIdx(null);
                      return;
                    }
                    if (isSelectedBench) {
                      setSetupBenchIndices((prev) => prev.filter((i) => i !== idx));
                      return;
                    }
                    if (setupActiveIdx === null && activeDgAllowed) {
                      setSetupActiveIdx(idx);
                    } else if (
                      setupActiveIdx !== null &&
                      benchAllowed &&
                      setupBenchIndices.length < gameState.rules.maxBenchSize
                    ) {
                      setSetupBenchIndices((prev) => [...prev, idx]);
                    }
                  };

                  return (
                    <CardView
                      key={`${cid}-${idx}`}
                      card={c}
                      size="sm"
                      selected={isSelectedActive || isSelectedBench}
                      highlighted={isSelectedActive || isSelectedBench || (setupActiveIdx === null && isReady)}
                      disabled={!canClick}
                      badgeText={badgeText}
                      onClick={canClick ? handleCardClick : undefined}
                    />
                  );
                });
              })()}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                disabled={setupActiveIdx === null}
                onClick={() => {
                  if (setupActiveIdx === null) return;
                  onDispatch({
                    type: 'CHOOSE_STARTING_ACTIVE',
                    playerId: myId,
                    handIndex: setupActiveIdx,
                    benchHandIndices: setupBenchIndices.length > 0 ? setupBenchIndices : undefined,
                  });
                }}
                className="jojo-btn-primary px-8 py-3 font-jojo-heading text-lg tracking-[0.15em] uppercase disabled:opacity-35"
              >
                {setupActiveIdx === null
                  ? 'Selecciona tu Activo'
                  : `Confirmar Formación (${1 + setupBenchIndices.length} en campo)`}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* HOTSEAT PRIVACY CURTAIN */}
      {hotseatHandoffTo && mode === 'HOTSEAT' && (
        <motion.div
          key="modal-hotseat"
          role="dialog"
          aria-modal="true"
          aria-label="Cambio de jugador"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b090e] p-6"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="jojo-panel max-w-md space-y-5 p-8 text-center"
          >
            <div className="font-jojo-display text-4xl text-[#f2c12e] uppercase">
              TURNO DE {gameState.players[hotseatHandoffTo].name}
            </div>
            <p className="text-sm text-zinc-300">
              Pasa el control al siguiente jugador antes de revelar su mano.
            </p>
            <button
              type="button"
              onClick={onConfirmHandoff}
              className="jojo-btn-primary w-full py-3 font-jojo-heading text-lg tracking-widest uppercase"
            >
              Continuar
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* TO BE CONTINUED GAME OVER */}
      {gameState.phase === 'GAME_OVER' && gameState.winnerId && (
        <motion.div
          key="modal-gameover"
          role="dialog"
          aria-modal="true"
          aria-label="Resultado de la partida"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#18120a]/92 p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="jojo-panel max-w-xl space-y-6 p-8 text-center"
          >
            <div className="mx-auto flex items-center justify-center overflow-hidden">
              <motion.div
                initial={{ x: 110, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.14, type: 'spring', stiffness: 280, damping: 22 }}
                className="tbc-arrow bg-[#f5efe0] py-3 pr-14 pl-6 font-jojo-serif text-lg font-black tracking-wider text-[#0b090e] italic shadow-lg"
              >
                To Be Continued
              </motion.div>
            </div>

            <div>
              <div className="font-jojo-heading text-xs tracking-[0.28em] text-[#e6194b] uppercase">
                FIN DEL COMBATE · TURNO {gameState.turnNumber}
              </div>
              <h2 className="mt-1 font-jojo-display text-4xl text-[#f2c12e] uppercase">
                ¡VICTORIA DE {gameState.players[gameState.winnerId].name}!
              </h2>
              <p className="mt-2 text-sm text-zinc-300">{gameState.winReason}</p>
            </div>

            {battleReward && (
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.25, type: 'spring', stiffness: 360, damping: 22 }}
                className="mx-auto inline-flex items-center gap-2.5 border-2 border-[#060508] bg-[#f2c12e] px-5 py-2 text-[#0b090e] shadow-[4px_4px_0_#060508]"
              >
                <Coins size={20} />
                <div className="text-left">
                  <div className="font-jojo-display text-xl leading-none">
                    {battleReward.coins > 0 ? `+${battleReward.coins} MONEDAS` : 'RECOMPENSA YA RECOGIDA'}
                  </div>
                  <div className="font-mono text-[10px] font-bold uppercase opacity-80">
                    {battleReward.label}
                  </div>
                </div>
              </motion.div>
            )}

            {campaignPackReward && onOpenCampaignPacks && (
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.32, type: 'spring', stiffness: 360, damping: 22 }}
              >
                <button
                  type="button"
                  onClick={onOpenCampaignPacks}
                  className="jojo-btn-crimson inline-flex items-center gap-2 px-6 py-3 font-jojo-heading text-lg tracking-[0.14em] uppercase"
                >
                  <Gift size={18} />
                  Abrir ×{campaignPackReward.outcomes.length} {campaignPackReward.pack.name}
                </button>
              </motion.div>
            )}

            <div className="flex flex-wrap justify-center gap-3 pt-2">
              {isRoguelike && onReturnToRoguelike && (
                <button
                  type="button"
                  onClick={onReturnToRoguelike}
                  className="jojo-btn-primary inline-flex items-center gap-2 px-6 py-3 font-jojo-heading text-base tracking-[0.14em] uppercase"
                >
                  <Map size={16} /> Continuar Expedición Roguelike
                </button>
              )}
              {isTutorial && onReturnToTutorial && (
                <button
                  type="button"
                  onClick={onReturnToTutorial}
                  className="jojo-btn-primary inline-flex items-center gap-2 px-6 py-3 font-jojo-heading text-base tracking-[0.14em] uppercase"
                >
                  <Map size={16} /> Volver al Tutorial
                </button>
              )}
              {isCampaign && onReturnToCampaign && (
                <button
                  type="button"
                  onClick={onReturnToCampaign}
                  className="jojo-btn-primary inline-flex items-center gap-2 px-6 py-3 font-jojo-heading text-base tracking-[0.14em] uppercase"
                >
                  <Map size={16} /> Mapa de Campaña
                </button>
              )}
              {mode !== 'ONLINE' && !isRoguelike && (
                <button
                  type="button"
                  onClick={onRematch}
                  className={`${
                    isCampaign ? 'jojo-btn-ink' : 'jojo-btn-primary'
                  } inline-flex items-center gap-2 px-6 py-3 font-jojo-heading text-base tracking-[0.14em] uppercase`}
                >
                  <RefreshCw size={16} /> Revancha
                </button>
              )}
              {onOpenShop && (
                <button
                  type="button"
                  onClick={onOpenShop}
                  className="jojo-btn-crimson inline-flex items-center gap-2 px-5 py-3 font-jojo-heading text-base tracking-[0.14em] uppercase"
                >
                  <ShoppingBag size={16} /> Tienda
                </button>
              )}
              <button
                type="button"
                onClick={onExitToMenu}
                className="jojo-btn-ink px-5 py-3 font-jojo-heading text-base tracking-[0.14em] uppercase"
              >
                Menú Principal
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
