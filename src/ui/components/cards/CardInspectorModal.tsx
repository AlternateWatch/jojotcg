import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight, Lock, ShoppingBag, Sparkles, X, ZoomIn } from 'lucide-react';
import {
  CARD_SYNERGIES,
  getCardById,
  getEvolutionsForBase,
} from '../../../data/cardRegistry';
import {
  getCardRarity,
  getPacksContainingCard,
  RARITY_META,
} from '../../../data/progressionData';
import { CATEGORY_LABELS } from '../../../data/schemas/cardTypes';
import { resolveCardAsset } from '../../../services/assetResolver';
import {
  getFoilCount,
  getMaxCollectibleCopies,
  getOwnedCount,
  isCardFoilEquipped,
} from '../../../services/progressionService';
import { useAppStore } from '../../../store/useAppStore';
import { CardArtwork } from './CardArtwork';
import { CardView } from './CardView';
import { EnergyBadge } from './EnergyBadge';

export function CardInspectorModal() {
  const inspectedCardId = useAppStore((s) => s.inspectedCardId);
  const closeInspector = useAppStore((s) => s.closeInspector);
  const openInspector = useAppStore((s) => s.openInspector);
  const setScreen = useAppStore((s) => s.setScreen);
  const progression = useAppStore((s) => s.progression);
  const toggleEquipFoilCard = useAppStore((s) => s.toggleEquipFoilCard);
  const [isHoveringCard, setIsHoveringCard] = useState(false);
  const [showFoilVariant, setShowFoilVariant] = useState(false);
  const [holoPointer, setHoloPointer] = useState({ x: 50, y: 40, rx: 0, ry: 0 });

  const card = inspectedCardId ? getCardById(inspectedCardId) : undefined;
  const foilCopies = card ? getFoilCount(progression, card.id) : 0;
  const hasFoilVariant = foilCopies > 0;
  const isEquippedFoil = card ? isCardFoilEquipped(progression, card.id) : false;

  useEffect(() => {
    setIsHoveringCard(false);
    setShowFoilVariant(card ? isCardFoilEquipped(progression, card.id) : false);
    setHoloPointer({ x: 50, y: 40, rx: 0, ry: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectedCardId]);

  useEffect(() => {
    if (!inspectedCardId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeInspector();
      if (hasFoilVariant && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        setShowFoilVariant((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [inspectedCardId, closeInspector, hasFoilVariant]);

  const handleCardPointerMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!showFoilVariant) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const py = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    const ry = ((px - 50) / 50) * 12;
    const rx = -((py - 50) / 50) * 10;
    setHoloPointer({ x: px, y: py, rx, ry });
  };

  const resetHoloPointer = () => {
    setIsHoveringCard(false);
    setHoloPointer({ x: 50, y: 40, rx: 0, ry: 0 });
  };

  const holoStyle = (showFoilVariant
    ? {
        '--holo-x': `${holoPointer.x}%`,
        '--holo-y': `${holoPointer.y}%`,
        transform: `perspective(900px) rotateX(${holoPointer.rx}deg) rotateY(${holoPointer.ry}deg)`,
        transition: 'transform 120ms ease-out',
      }
    : undefined) as CSSProperties | undefined;

  const asset = card ? resolveCardAsset(card.imageId, card.assetFolder) : null;
  const evolutions = card ? getEvolutionsForBase(card.id) : [];
  const synergy = card ? CARD_SYNERGIES[card.id] : undefined;
  const baseCard = card?.type === 'EVOLUTION' ? getCardById(card.baseCardId) : undefined;
  const rarityMeta = card && card.type !== 'ENERGY' ? RARITY_META[getCardRarity(card.id)] : null;
  const ownedCopies = card ? getOwnedCount(progression, card.id) : 0;
  const maxCopies = card ? getMaxCollectibleCopies(card.id) : 0;
  const sourcePacks = card && card.type !== 'ENERGY' ? getPacksContainingCard(card.id) : [];

  return (
    <AnimatePresence>
      {card && asset && (
        <motion.div
          key="card-inspector-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Ficha de ${card.name}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#060508]/85 p-4"
          onClick={closeInspector}
        >
          <motion.div
            key={card.id}
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="relative w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="jojo-panel relative grid max-h-[92vh] w-full grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-[260px_1fr]">
              <button
                type="button"
                onClick={closeInspector}
                aria-label="Cerrar ficha"
                className="jojo-btn-ink absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center"
              >
                <X size={16} />
              </button>

              {/* Left: Full-Res Card (hover to enlarge at the side + arrow to toggle Holographic variant) */}
              <div className="flex flex-col items-center gap-2.5">
                <div className="relative flex items-center justify-center">
                  <div
                    onMouseEnter={() => setIsHoveringCard(true)}
                    onMouseMove={handleCardPointerMove}
                    onMouseLeave={resetHoloPointer}
                    style={holoStyle}
                    className="group relative cursor-zoom-in"
                  >
                    <CardView
                      card={card}
                      size="lg"
                      foil={showFoilVariant}
                      showInspectButton={false}
                    />
                  </div>

                  {/* Right Arrow Toggle to inspect Holographic variant */}
                  {hasFoilVariant && (
                    <button
                      type="button"
                      onClick={() => setShowFoilVariant((v) => !v)}
                      title={
                        showFoilVariant
                          ? 'Volver a versión Normal'
                          : 'Ver versión Holográfica (✦ HOLO)'
                      }
                      aria-label={
                        showFoilVariant ? 'Ver versión Normal' : 'Ver versión Holográfica'
                      }
                      className={`absolute top-1/2 -right-4 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center border-2 border-[#060508] shadow-[3px_3px_0_#060508] transition hover:scale-110 ${
                        showFoilVariant
                          ? 'bg-[#1f182d] text-[#f2c12e] hover:bg-[#2c2240]'
                          : 'bg-gradient-to-br from-[#f2c12e] via-[#00e599] to-[#c084fc] text-[#0b090e]'
                      }`}
                    >
                      {showFoilVariant ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                    </button>
                  )}
                </div>

                {hasFoilVariant && (
                  <div className="flex flex-col items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowFoilVariant((v) => !v)}
                      className={`inline-flex items-center gap-1.5 border border-[#060508] px-2.5 py-0.5 font-mono text-[10px] font-black uppercase transition ${
                        showFoilVariant
                          ? 'bg-gradient-to-r from-[#f2c12e] via-[#00e599] to-[#c084fc] text-[#0b090e]'
                          : 'bg-[#1a1426] text-zinc-300 hover:border-[#f2c12e] hover:text-[#f2c12e]'
                      }`}
                    >
                      <Sparkles size={11} />
                      {showFoilVariant
                        ? `✦ Vista Holográfica (×${foilCopies})`
                        : `Normal · Pulsa ➔ para ver Holo`}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        toggleEquipFoilCard(card.id);
                        if (!isEquippedFoil) setShowFoilVariant(true);
                      }}
                      className={`w-full px-3 py-1.5 font-jojo-heading text-xs tracking-wider uppercase ${
                        isEquippedFoil
                          ? 'jojo-btn-ink border-[#00e599] text-[#00e599]'
                          : 'jojo-btn-primary'
                      }`}
                    >
                      {isEquippedFoil
                        ? '✓ Holográfica Equipada (Cambiar a Normal)'
                        : '✦ Equipar versión Holográfica'}
                    </button>
                  </div>
                )}

                <div className="pointer-events-none flex items-center justify-center gap-1 font-mono text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                  <ZoomIn size={11} />{' '}
                  {showFoilVariant ? 'Mueve el ratón para inclinar el brillo' : 'Pasa el ratón para ampliar'}
                </div>
              </div>

        {/* Right: Editorial JoJo Dossier */}
        <div className="space-y-4 pr-6">
          <div className="border-b-2 border-[#f2c12e]/30 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="border border-[#060508] bg-[#e6194b] px-2 py-0.5 font-jojo-heading text-xs tracking-widest text-white uppercase">
                Parte {card.part}
              </span>
              <span className="border border-[#060508] bg-[#f2c12e] px-2 py-0.5 font-jojo-heading text-xs tracking-widest text-[#0b090e] uppercase">
                {card.type}
              </span>
              {rarityMeta && (
                <span
                  className={`border border-[#060508] px-2 py-0.5 font-mono text-[11px] font-black uppercase ${rarityMeta.badgeClass}`}
                >
                  {rarityMeta.short} · {rarityMeta.label}
                  {rarityMeta.id === 'BIZARRE_RARE' ? ' (0.5%)' : ''}
                </span>
              )}
              {card.type !== 'ENERGY' && (
                <span
                  className={`inline-flex items-center gap-1 border border-[#060508] px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                    ownedCopies > 0
                      ? 'bg-[#00b87c] text-[#0b090e]'
                      : 'bg-[#1f192b] text-zinc-300'
                  }`}
                >
                  {ownedCopies > 0 ? (
                    `En colección: ×${ownedCopies} (máx. mazo: ${maxCopies})`
                  ) : (
                    <>
                      <Lock size={10} /> Bloqueada
                    </>
                  )}
                </span>
              )}
            </div>

            <h2 className="mt-2 font-jojo-display text-3xl tracking-wide text-[#f5efe0] uppercase">
              {card.name}
            </h2>

            {/* Bold stat tags */}
            <div className="mt-2.5 flex flex-wrap gap-2">
              {card.type === 'CHARACTER' && (
                <>
                  <span className="border-2 border-[#060508] bg-[#00b87c] px-2.5 py-0.5 font-jojo-heading text-sm text-[#0b090e]">
                    HP {card.maxHp}
                  </span>
                  {card.dg !== null && (
                    <span className="border-2 border-[#060508] bg-[#f2c12e] px-2.5 py-0.5 font-jojo-heading text-sm text-[#0b090e]">
                      DG {card.dg}
                    </span>
                  )}
                  {card.categories.map((cat) => (
                    <span
                      key={cat}
                      className="border border-zinc-600 bg-[#1e1829] px-2.5 py-0.5 text-xs font-bold text-[#f5efe0]"
                    >
                      {CATEGORY_LABELS[cat]}
                    </span>
                  ))}
                </>
              )}
              {card.type === 'STAND' && (
                <span className="border-2 border-[#060508] bg-[#f2c12e] px-2.5 py-0.5 font-jojo-heading text-sm text-[#0b090e]">
                  DG REQUERIDO: {card.requiredDg}
                </span>
              )}
              {card.type === 'EVOLUTION' && (
                <>
                  {card.maxHp && (
                    <span className="border-2 border-[#060508] bg-[#00b87c] px-2.5 py-0.5 font-jojo-heading text-sm text-[#0b090e]">
                      HP {card.maxHp}
                    </span>
                  )}
                  {card.dg !== undefined && card.dg !== null && (
                    <span className="border-2 border-[#060508] bg-[#f2c12e] px-2.5 py-0.5 font-jojo-heading text-sm text-[#0b090e]">
                      DG {card.dg}
                    </span>
                  )}
                  {card.requiredDg && (
                    <span className="border-2 border-[#060508] bg-[#f2c12e] px-2.5 py-0.5 font-jojo-heading text-sm text-[#0b090e]">
                      DG REQUERIDO: {card.requiredDg}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Signature Ability in Cream Manga Panel */}
          {((card.type === 'CHARACTER' && card.signatureAbility) ||
            (card.type === 'EVOLUTION' && card.signatureAbility)) && (
            <div className="jojo-panel-cream p-3.5">
              <div className="font-jojo-heading text-xs tracking-widest text-[#b3123a] uppercase">
                Habilidad Insignia — {card.signatureAbility.name}
              </div>
              <p className="mt-1 text-sm leading-snug font-medium text-[#0b090e]">
                {card.signatureAbility.text}
              </p>
            </div>
          )}

          {/* Evolution Requirements */}
          {card.type === 'EVOLUTION' && (
            <div className="border-2 border-[#060508] border-l-4 border-l-[#f2c12e] bg-[#1e1729] p-3.5">
              <div className="font-jojo-heading text-xs tracking-widest text-[#f2c12e] uppercase">
                Requisitos de Evolución
              </div>
              <p className="mt-1 text-sm text-[#f5efe0]">{card.requirementText}</p>
              {baseCard && (
                <button
                  type="button"
                  onClick={() => openInspector(baseCard.id)}
                  className="jojo-btn-ink mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold"
                >
                  Base: {baseCard.name} <ArrowRight size={12} />
                </button>
              )}
            </div>
          )}

          {/* Attacks List */}
          {'attacks' in card && card.attacks.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-jojo-heading text-sm tracking-widest text-[#f2c12e] uppercase">
                Movimientos y Ataques
              </h3>
              {card.attacks.map((atk) => (
                <div
                  key={atk.id}
                  className="border-2 border-[#060508] bg-[#0e0b14] p-3 shadow-[3px_3px_0_#060508]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-jojo-heading text-base tracking-wider text-white uppercase">
                        {atk.name}
                      </span>
                      <div className="flex items-center gap-1">
                        {atk.energyCost.map((e, i) => (
                          <EnergyBadge key={`${atk.id}-${i}`} type={e} size="sm" />
                        ))}
                      </div>
                    </div>
                    <span className="border border-[#060508] bg-[#e6194b] px-2 py-0.5 font-jojo-display text-sm text-white">
                      {atk.damageLabel ?? (atk.baseDamage > 0 ? atk.baseDamage : 'EFECTO')}
                    </span>
                  </div>
                  {atk.effectText && (
                    <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">{atk.effectText}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {(card.type === 'ITEM' || card.type === 'ENERGY' || card.type === 'LOCATION') &&
            card.description && (
            <div className="jojo-panel-cream p-3.5 text-sm font-medium">{card.description}</div>
          )}

          {evolutions.length > 0 && (
            <div className="space-y-1.5">
              <div className="font-jojo-heading text-xs tracking-widest text-[#f2c12e] uppercase">
                Evoluciones
              </div>
              <div className="flex flex-wrap gap-2">
                {evolutions.map((evo) => (
                  <button
                    key={evo.id}
                    type="button"
                    onClick={() => openInspector(evo.id)}
                    className="jojo-btn-primary inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold"
                  >
                    {evo.name} <ArrowRight size={13} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {synergy && (
            <div className="border-2 border-[#060508] border-l-4 border-l-[#00b87c] bg-[#161221] p-3">
              <div className="font-jojo-heading text-xs tracking-widest text-[#00b87c] uppercase">
                Sinergias
              </div>
              <p className="mt-1 text-xs text-zinc-200">{synergy.summary}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {synergy.partnerCardIds.map((pid) => {
                  const partner = getCardById(pid);
                  if (!partner) return null;
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => openInspector(pid)}
                      className="jojo-btn-ink px-2.5 py-0.5 text-[11px] font-semibold"
                    >
                      {partner.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {sourcePacks.length > 0 && (
            <div className="border-2 border-[#060508] bg-[#0e0b14] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-jojo-heading text-xs tracking-widest text-[#f2c12e] uppercase">
                  Disponible en Sobres
                </span>
                <button
                  type="button"
                  onClick={() => {
                    closeInspector();
                    setScreen('SHOP');
                  }}
                  className="jojo-btn-primary inline-flex items-center gap-1 px-2.5 py-0.5 font-jojo-heading text-[11px] tracking-wider uppercase"
                >
                  <ShoppingBag size={11} /> Ir a Tienda
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sourcePacks.map((pk) => (
                  <span
                    key={pk.id}
                    className="border border-[#060508] bg-[#1a1424] px-2 py-0.5 text-[10px] font-semibold text-zinc-200"
                  >
                    {pk.name} ({pk.price} 🪙)
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
            </div>

            {/* Enlarged Card Preview on Hover (appears cleanly beside the card on desktop) */}
            <AnimatePresence>
              {isHoveringCard && (
                <motion.div
                  key={`zoom-${card.id}`}
                  initial={{ opacity: 0, scale: 0.9, x: -14 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.92, x: -10 }}
                  transition={{ type: 'spring', stiffness: 440, damping: 30 }}
                  className="pointer-events-none absolute top-1/2 left-[292px] z-30 hidden -translate-y-1/2 md:block"
                >
                  <div
                    className={`relative aspect-[2.5/3.5] h-[min(90vh,700px)] overflow-hidden rounded-[12px] border-[3px] border-[#f2c12e] bg-[#0e0b14] shadow-[10px_10px_0_#060508,0_20px_50px_rgba(0,0,0,0.9)] ${
                      showFoilVariant ? 'jojo-foil-prismatic' : ''
                    }`}
                    style={
                      showFoilVariant
                        ? ({
                            '--holo-x': `${holoPointer.x}%`,
                            '--holo-y': `${holoPointer.y}%`,
                          } as CSSProperties)
                        : undefined
                    }
                  >
                    {asset.url ? (
                      <CardArtwork card={card} className="object-contain bg-[#0b090e]" />
                    ) : (
                      <div className="flex h-full w-full flex-col justify-between p-5">
                        <CardArtwork card={card} className="h-[64%] rounded-[6px] border-2 border-[#060508]" />
                        <div className="space-y-1.5 border-t-2 border-[#f2c12e]/40 pt-3">
                          <div className="font-jojo-display text-2xl text-[#f2c12e] uppercase">
                            {card.name}
                          </div>
                          {card.description && (
                            <p className="text-sm leading-snug text-zinc-200">{card.description}</p>
                          )}
                        </div>
                      </div>
                    )}
                    {showFoilVariant && (
                      <>
                        <div aria-hidden="true" className="jojo-holo-prism absolute inset-0 z-10" />
                        <div aria-hidden="true" className="jojo-holo-sparkle absolute inset-0 z-10" />
                        <div aria-hidden="true" className="jojo-holo-glare absolute inset-0 z-10 overflow-hidden" />
                        <div className="pointer-events-none absolute top-3 right-3 z-20 -skew-x-8 border-2 border-[#060508] bg-gradient-to-r from-[#f2c12e] via-[#00e599] to-[#c084fc] px-2.5 py-1 font-mono text-xs font-black tracking-wider text-[#0b090e] uppercase shadow-[3px_3px_0_#060508]">
                          <span className="inline-block skew-x-8">✦ HOLOGRÁFICA</span>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
