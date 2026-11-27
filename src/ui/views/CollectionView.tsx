import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Hammer, Lock, Minus, Plus, Search, ShoppingBag, Sparkles, X } from 'lucide-react';
import { ALL_CARDS, CARD_SYNERGIES, getCardById } from '../../data/cardRegistry';
import {
  getCardRarity,
  RARITY_META,
  type CardRarity,
} from '../../data/progressionData';
import {
  CATEGORY_LABELS,
  type CardType,
  type CharacterCategory,
  type JoJoPart,
} from '../../data/schemas/cardTypes';
import { resolveCardAsset } from '../../services/assetResolver';
import {
  buildAutoCraftSelection,
  CRAFT_RECIPES,
  getCollectionProgress,
  getMaxCollectibleCopies,
  getOwnedCount,
  getRarityInventoryStats,
  isCardFoilOwned,
  isCardUnlocked,
  type CraftOutcome,
  type CraftRecipeId,
} from '../../services/progressionService';
import { useAppStore } from '../../store/useAppStore';
import { CardView } from '../components/cards/CardView';

const RECIPE_ORDER: CraftRecipeId[] = [
  'COMMON_TO_RARE',
  'RARE_TO_SUPER_RARE',
  'SUPER_RARE_TO_BIZARRE_RARE',
  'BIZARRE_RARE_TO_CHOSEN_UR',
];

export function CollectionView() {
  const openInspector = useAppStore((s) => s.openInspector);
  const setScreen = useAppStore((s) => s.setScreen);
  const overrides = useAppStore((s) => s.settings.customImageOverrides);
  const progression = useAppStore((s) => s.progression);
  const craftCard = useAppStore((s) => s.craftCard);

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<CardType | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<CharacterCategory | 'ALL'>('ALL');
  const [partFilter, setPartFilter] = useState<JoJoPart | 'ALL'>('ALL');
  const [rarityFilter, setRarityFilter] = useState<CardRarity | 'ALL'>('ALL');
  const [ownedFilter, setOwnedFilter] = useState<'ALL' | 'UNLOCKED' | 'LOCKED' | 'FOIL'>('ALL');
  const [onlySynergies, setOnlySynergies] = useState(false);

  const [showCraftPanel, setShowCraftPanel] = useState(false);
  const [activeRecipeId, setActiveRecipeId] = useState<CraftRecipeId>('COMMON_TO_RARE');
  const [craftSelection, setCraftSelection] = useState<Record<string, number>>(() =>
    buildAutoCraftSelection(progression, 'COMMON_TO_RARE'),
  );
  const [targetCraftCardId, setTargetCraftCardId] = useState<string>('');
  const [craftError, setCraftError] = useState<string | null>(null);
  const [craftOutcome, setCraftOutcome] = useState<CraftOutcome | null>(null);

  const activeRecipe = CRAFT_RECIPES[activeRecipeId];
  const inputRarityStats = useMemo(
    () => getRarityInventoryStats(progression, activeRecipe.inputRarity),
    [progression, activeRecipe.inputRarity],
  );
  const duplicateEligibleCards = useMemo(
    () => inputRarityStats.cards.filter((entry) => entry.surplusOne > 0),
    [inputRarityStats],
  );
  const selectableTargetCards = useMemo(() => {
    if (!activeRecipe.selectableTarget) return [];
    return ALL_CARDS.filter(
      (c) => c.type !== 'ENERGY' && getCardRarity(c.id) === activeRecipe.outputRarity,
    ).sort((a, b) => {
      const aOwned = getOwnedCount(progression, a.id) > 0 ? 1 : 0;
      const bOwned = getOwnedCount(progression, b.id) > 0 ? 1 : 0;
      if (aOwned !== bOwned) return aOwned - bOwned;
      return a.name.localeCompare(b.name, 'es');
    });
  }, [activeRecipe.outputRarity, activeRecipe.selectableTarget, progression]);
  const selectedTargetCard = useMemo(
    () => (targetCraftCardId ? getCardById(targetCraftCardId) : undefined),
    [targetCraftCardId],
  );

  const totalSelectedForCraft = useMemo(
    () => Object.values(craftSelection).reduce((sum, n) => sum + n, 0),
    [craftSelection],
  );

  const selectRecipe = (recipeId: CraftRecipeId) => {
    setActiveRecipeId(recipeId);
    setCraftError(null);
    setTargetCraftCardId('');
    setCraftSelection(buildAutoCraftSelection(progression, recipeId));
  };

  const handleAutoSelectDuplicates = () => {
    setCraftError(null);
    setCraftSelection(buildAutoCraftSelection(progression, activeRecipeId));
  };

  const adjustCraftCard = (cardId: string, delta: number) => {
    setCraftError(null);
    const owned = getOwnedCount(progression, cardId);
    const maxSacrificeable = Math.max(0, owned - 1);
    setCraftSelection((prev) => {
      const current = prev[cardId] ?? 0;
      const currentTotal = Object.values(prev).reduce((s, n) => s + n, 0);
      if (delta > 0 && currentTotal >= activeRecipe.inputCount) return prev;
      const nextCount = Math.max(0, Math.min(maxSacrificeable, current + delta));
      const copy = { ...prev };
      if (nextCount <= 0) delete copy[cardId];
      else copy[cardId] = nextCount;
      return copy;
    });
  };

  const handleExecuteCraft = () => {
    setCraftError(null);
    const outcome = craftCard(
      activeRecipeId,
      craftSelection,
      activeRecipe.selectableTarget ? targetCraftCardId : undefined,
    );
    if (!outcome.ok) {
      setCraftError(outcome.error ?? 'No se pudo completar el crafteo.');
      return;
    }
    setCraftOutcome(outcome);
    setCraftSelection(buildAutoCraftSelection(outcome.nextProgression, activeRecipeId));
  };

  const collProgress = useMemo(() => getCollectionProgress(progression), [progression]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_CARDS.filter((card) => {
      if (typeFilter !== 'ALL' && card.type !== typeFilter) return false;
      if (partFilter !== 'ALL' && card.part !== partFilter) return false;
      if (rarityFilter !== 'ALL') {
        if (card.type === 'ENERGY' || getCardRarity(card.id) !== rarityFilter) return false;
      }
      if (ownedFilter !== 'ALL') {
        const unlocked = isCardUnlocked(progression, card.id);
        if (ownedFilter === 'UNLOCKED' && !unlocked) return false;
        if (ownedFilter === 'LOCKED' && unlocked) return false;
        if (ownedFilter === 'FOIL' && !isCardFoilOwned(progression, card.id)) return false;
      }
      if (categoryFilter !== 'ALL') {
        if (card.type === 'CHARACTER' && !card.categories.includes(categoryFilter)) return false;
        if (card.type === 'EVOLUTION' && !card.categories?.includes(categoryFilter)) return false;
        if (card.type !== 'CHARACTER' && card.type !== 'EVOLUTION') return false;
      }
      if (onlySynergies && !CARD_SYNERGIES[card.id]) return false;

      if (q) {
        const haystack = [
          card.name,
          card.imageId,
          card.description ?? '',
          card.type === 'CHARACTER'
            ? card.signatureAbility.name + ' ' + card.signatureAbility.text
            : '',
          'attacks' in card
            ? card.attacks.map((a) => `${a.name} ${a.effectText ?? ''}`).join(' ')
            : '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [query, typeFilter, categoryFilter, partFilter, rarityFilter, ownedFilter, onlySynergies, progression]);

  return (
    <div
      className="relative min-h-[calc(100vh-56px)] py-6"
      style={{
        backgroundImage: 'url(/assets/patterns/pattern4.png)',
        backgroundSize: '340px',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[#0b090e]/92" />

      <div className="relative z-10 mx-auto max-w-[1440px] space-y-5 px-4">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#f2c12e]/30 pb-3">
          <div>
            <div className="font-jojo-heading text-xs tracking-[0.25em] text-[#e6194b] uppercase">
              ÁLBUM DE PROGRESIÓN · DESBLOQUEADAS: {collProgress.unlocked}/{collProgress.total} ({collProgress.percent}%)
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-jojo-display text-4xl text-[#f5efe0] uppercase">
                COLECCIÓN ({filtered.length}/{ALL_CARDS.length})
              </h1>
              <button
                type="button"
                onClick={() => setScreen('SHOP')}
                className="jojo-btn-primary inline-flex items-center gap-1.5 px-3 py-1 font-jojo-heading text-xs tracking-widest uppercase"
              >
                <ShoppingBag size={13} /> Conseguir en Tienda
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !showCraftPanel;
                  setShowCraftPanel(next);
                  if (next) {
                    setCraftSelection(buildAutoCraftSelection(progression, activeRecipeId));
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 font-jojo-heading text-xs tracking-widest uppercase ${
                  showCraftPanel ? 'jojo-btn-crimson' : 'jojo-btn-ink text-[#f2c12e]'
                }`}
              >
                <Hammer size={13} /> Forja / Crafteo de Cartas
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['ALL', 'Todas'],
                ['CHARACTER', 'Personajes'],
                ['STAND', 'Stands'],
                ['EVOLUTION', 'Evoluciones'],
                ['ITEM', 'Objetos'],
                ['LOCATION', 'Lugares'],
                ['ENERGY', 'Energías'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setTypeFilter(val)}
                className={`-skew-x-8 px-3 py-1 font-jojo-heading text-xs tracking-widest uppercase ${
                  typeFilter === val ? 'jojo-btn-primary' : 'jojo-btn-ink text-zinc-400'
                }`}
              >
                <span className="inline-block skew-x-8">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Crisp Filter Strip */}
        <div className="jojo-panel grid grid-cols-1 gap-2.5 p-3 md:grid-cols-[1fr_auto_auto_auto_auto_auto]">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar carta, ataque, habilidad insignia..."
              className="w-full border-2 border-[#060508] bg-[#0e0b14] py-2 pr-3 pl-9 text-xs text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
            />
          </div>

          <select
            value={ownedFilter}
            onChange={(e) => setOwnedFilter(e.target.value as typeof ownedFilter)}
            className="border-2 border-[#060508] bg-[#0e0b14] px-3 py-2 text-xs font-semibold text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
          >
            <option value="ALL">Estado: Todas</option>
            <option value="UNLOCKED">Desbloqueadas</option>
            <option value="FOIL">✦ Holográficas ({Object.keys(progression.foilCards ?? {}).length})</option>
            <option value="LOCKED">Bloqueadas</option>
          </select>

          <select
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value as CardRarity | 'ALL')}
            className="border-2 border-[#060508] bg-[#0e0b14] px-3 py-2 text-xs font-semibold text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
          >
            <option value="ALL">Rareza: Todas</option>
            <option value="BIZARRE_RARE">UR · Bizarre Rare (0.5%)</option>
            <option value="SUPER_RARE">SR · Súper Rara</option>
            <option value="RARE">R · Rara</option>
            <option value="COMMON">C · Común</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as CharacterCategory | 'ALL')}
            className="border-2 border-[#060508] bg-[#0e0b14] px-3 py-2 text-xs font-semibold text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
          >
            <option value="ALL">Categoría: Todas</option>
            {(Object.keys(CATEGORY_LABELS) as CharacterCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>

          <select
            value={partFilter}
            onChange={(e) =>
              setPartFilter(e.target.value === 'ALL' ? 'ALL' : (Number(e.target.value) as JoJoPart))
            }
            className="border-2 border-[#060508] bg-[#0e0b14] px-3 py-2 text-xs font-semibold text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
          >
            <option value="ALL">Parte: Todas</option>
            <option value="1">Parte 1</option>
            <option value="2">Parte 2</option>
            <option value="3">Parte 3</option>
            <option value="4">Parte 4</option>
            <option value="5">Parte 5</option>
          </select>

          <button
            type="button"
            onClick={() => setOnlySynergies((v) => !v)}
            className={`px-3 py-2 font-jojo-heading text-xs tracking-widest uppercase ${
              onlySynergies ? 'jojo-btn-crimson' : 'jojo-btn-ink text-zinc-300'
            }`}
          >
            Sinergias
          </button>
        </div>

        {/* CARD CRAFTING FORGE PANEL */}
        <AnimatePresence>
          {showCraftPanel && (
            <motion.div
              key="craft-forge-panel"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="jojo-panel space-y-4 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#060508] pb-3">
                <div>
                  <div className="font-jojo-heading text-xs tracking-[0.22em] text-[#e6194b] uppercase">
                    FORJA DE LA FUNDACIÓN SPEEDWAGON · CRAFTEO DE REPETIDAS
                  </div>
                  <h2 className="font-jojo-display text-2xl text-[#f2c12e] uppercase">
                    CRAFTEO DE CARTAS
                  </h2>
                  <p className="text-xs text-zinc-300">
                    Las cartas repetidas se guardan en tu colección. Combínalas para crear una carta
                    de rareza superior o elegir una UR concreta (5 Comunes → 1 Rara · 10 Raras → 1
                    Súper Rara · 15 Súper Raras → 1 UR · 5 UR → 1 UR a tu elección).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCraftPanel(false)}
                  className="jojo-btn-ink flex h-8 w-8 items-center justify-center"
                  title="Cerrar Forja"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Recipe Selector Cards */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                {RECIPE_ORDER.map((rid) => {
                  const rec = CRAFT_RECIPES[rid];
                  const stats = getRarityInventoryStats(progression, rec.inputRarity);
                  const inMeta = RARITY_META[rec.inputRarity];
                  const outMeta = RARITY_META[rec.outputRarity];
                  const isActive = activeRecipeId === rid;
                  const canAffordDuplicates = stats.surplusCopiesBeyondOne >= rec.inputCount;

                  return (
                    <button
                      key={rid}
                      type="button"
                      onClick={() => selectRecipe(rid)}
                      className={`flex flex-col justify-between border-2 p-3.5 text-left transition ${
                        isActive
                          ? 'border-[#f2c12e] bg-[#1f182d] shadow-[4px_4px_0_#060508]'
                          : 'border-[#060508] bg-[#0e0b14] hover:border-zinc-600'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`border border-[#060508] px-1.5 py-0.5 font-mono text-[10px] font-black uppercase ${inMeta.badgeClass}`}
                          >
                            {rec.inputCount}× {inMeta.short} Repetidas
                          </span>
                          <span className="font-mono text-xs text-zinc-400">➔</span>
                          <span
                            className={`border border-[#060508] px-1.5 py-0.5 font-mono text-[10px] font-black uppercase ${outMeta.badgeClass}`}
                          >
                            {rec.selectableTarget
                              ? `1× ${outMeta.short} (A elección)`
                              : `1× ${outMeta.short} (${outMeta.label})`}
                          </span>
                        </div>
                        <div className="font-jojo-display text-lg text-[#f5efe0] uppercase">
                          {rec.label}
                        </div>
                        <p className="text-[11px] leading-snug text-zinc-400">{rec.description}</p>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 font-mono text-[11px]">
                        <span className={canAffordDuplicates ? 'text-[#00e599]' : 'text-rose-400'}>
                          Repetidas {inMeta.short}:{' '}
                          <strong>
                            {stats.surplusCopiesBeyondOne}/{rec.inputCount}
                          </strong>
                        </span>
                        <span className="text-zinc-400">
                          Sobrantes mazo:{' '}
                          <strong className="text-[#f2c12e]">
                            {stats.surplusCopiesBeyondDeckLimit}
                          </strong>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Active Recipe Selection Controls */}
              <div className="border-2 border-[#060508] bg-[#0e0b14] p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-jojo-heading text-sm tracking-wider text-[#f2c12e] uppercase">
                      Repetidas {RARITY_META[activeRecipe.inputRarity].label} seleccionadas para
                      sacrificar:
                    </span>
                    <span
                      className={`border border-[#060508] px-2 py-0.5 font-mono text-xs font-black ${
                        totalSelectedForCraft === activeRecipe.inputCount
                          ? 'bg-[#00b87c] text-[#0b090e]'
                          : 'bg-[#1c1626] text-zinc-300'
                      }`}
                    >
                      {totalSelectedForCraft} / {activeRecipe.inputCount}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleAutoSelectDuplicates}
                      className="jojo-btn-ink px-2.5 py-1 font-jojo-heading text-xs tracking-wider text-[#f2c12e] uppercase"
                    >
                      Auto-seleccionar Repetidas ({activeRecipe.inputCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCraftError(null);
                        setCraftSelection({});
                      }}
                      className="jojo-btn-ink px-2.5 py-1 font-jojo-heading text-xs tracking-wider text-zinc-400 uppercase"
                    >
                      Limpiar
                    </button>
                    <button
                      type="button"
                      disabled={
                        totalSelectedForCraft !== activeRecipe.inputCount ||
                        (activeRecipe.selectableTarget && !targetCraftCardId)
                      }
                      onClick={handleExecuteCraft}
                      className="jojo-btn-primary inline-flex items-center gap-1.5 px-4 py-1.5 font-jojo-heading text-sm tracking-widest uppercase disabled:opacity-35"
                    >
                      <Hammer size={14} />{' '}
                      {activeRecipe.selectableTarget
                        ? selectedTargetCard
                          ? `Forjar ${selectedTargetCard.name}`
                          : 'Elige una UR objetivo'
                        : `Craftear 1× ${RARITY_META[activeRecipe.outputRarity].label}`}
                    </button>
                  </div>
                </div>

                {craftError && (
                  <div className="border-l-4 border-[#e6194b] bg-[#2a0c16] px-3 py-1.5 text-xs font-bold text-rose-200">
                    {craftError}
                  </div>
                )}

                {activeRecipe.selectableTarget && (
                  <div className="space-y-2 border-2 border-[#f2c12e]/40 bg-[#140f1e] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-jojo-heading text-xs tracking-wider text-[#f2c12e] uppercase">
                        <Sparkles size={12} className="mr-1 inline" />
                        Paso 1: Elige la carta {RARITY_META[activeRecipe.outputRarity].label} que
                        quieres obtener
                      </span>
                      {selectedTargetCard && (
                        <span className="border border-[#060508] bg-[#f2c12e] px-2 py-0.5 font-mono text-[11px] font-black text-[#0b090e]">
                          Objetivo: {selectedTargetCard.name}
                        </span>
                      )}
                    </div>
                    <div className="grid max-h-[220px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {selectableTargetCards.map((card) => {
                        const owned = getOwnedCount(progression, card.id);
                        const isPicked = targetCraftCardId === card.id;
                        const asset = resolveCardAsset(card.imageId, card.assetFolder, overrides);
                        return (
                          <div
                            key={card.id}
                            className={`flex items-center justify-between gap-2 border p-2 text-xs transition ${
                              isPicked
                                ? 'border-[#f2c12e] bg-[#241b35] shadow-[2px_2px_0_#060508]'
                                : 'border-[#060508] bg-[#0e0b14] hover:border-zinc-500'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setCraftError(null);
                                setTargetCraftCardId(card.id);
                              }}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              {asset.url && (
                                <img
                                  src={asset.url}
                                  alt={card.name}
                                  className="h-10 w-7 shrink-0 border border-[#060508] object-cover"
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-bold text-[#f5efe0]">{card.name}</div>
                                <div className="font-mono text-[10px]">
                                  {owned === 0 ? (
                                    <span className="font-bold text-[#00e599]">NO LA TIENES</span>
                                  ) : (
                                    <span className="text-zinc-400">En colección: ×{owned}</span>
                                  )}
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => openInspector(card.id)}
                              className="jojo-btn-ink shrink-0 px-1.5 py-1 font-mono text-[10px] text-zinc-300"
                              title="Inspeccionar carta"
                            >
                              Ver
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {duplicateEligibleCards.length === 0 ? (
                  <p className="py-4 text-center text-xs text-zinc-500">
                    No tienes cartas repetidas (&gt;1 copia) de rareza{' '}
                    {RARITY_META[activeRecipe.inputRarity].label}. Abre sobres en la Tienda para
                    acumular repetidas.
                  </p>
                ) : (
                  <div className="grid max-h-[260px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {duplicateEligibleCards.map((entry) => {
                      const card = getCardById(entry.cardId);
                      if (!card) return null;
                      const chosen = craftSelection[entry.cardId] ?? 0;
                      const deckMax = getMaxCollectibleCopies(entry.cardId);
                      return (
                        <div
                          key={entry.cardId}
                          className={`flex items-center justify-between gap-2 border p-2 text-xs ${
                            chosen > 0
                              ? 'border-[#f2c12e] bg-[#1e1729]'
                              : 'border-[#060508] bg-[#14101c]'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => openInspector(card.id)}
                              className="block w-full truncate text-left font-bold text-[#f5efe0] hover:text-[#f2c12e]"
                            >
                              {card.name}
                            </button>
                            <div className="font-mono text-[10px] text-zinc-400">
                              Repetidas: <strong className="text-[#00e599]">×{entry.surplusOne}</strong>{' '}
                              (Total: ×{entry.owned} · mazo máx: {deckMax})
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={chosen <= 0}
                              onClick={() => adjustCraftCard(entry.cardId, -1)}
                              className="jojo-btn-ink flex h-6 w-6 items-center justify-center disabled:opacity-30"
                            >
                              <Minus size={11} />
                            </button>
                            <span className="w-6 text-center font-mono text-xs font-black text-[#f2c12e]">
                              {chosen}
                            </span>
                            <button
                              type="button"
                              disabled={
                                chosen >= entry.surplusOne ||
                                totalSelectedForCraft >= activeRecipe.inputCount
                              }
                              onClick={() => adjustCraftCard(entry.cardId, 1)}
                              className="jojo-btn-primary flex h-6 w-6 items-center justify-center disabled:opacity-30"
                            >
                              <Plus size={11} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CRAFTED CARD REVEAL MODAL */}
        <AnimatePresence>
          {craftOutcome &&
            craftOutcome.ok &&
            craftOutcome.rewardCardId &&
            (() => {
              const rewardCard = getCardById(craftOutcome.rewardCardId);
              if (!rewardCard) return null;
              const rMeta = RARITY_META[craftOutcome.rewardRarity ?? getCardRarity(rewardCard.id)];
              return (
                <motion.div
                  key="craft-outcome-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Carta crafteada"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setCraftOutcome(null)}
                  className="fixed inset-0 z-50 flex items-center justify-center bg-[#060508]/90 p-4"
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.85, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 12 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                    onClick={(e) => e.stopPropagation()}
                    className="jojo-panel relative flex w-full max-w-md flex-col items-center gap-4 p-6 text-center"
                  >
                    <span
                      className={`-skew-x-10 border-2 border-[#060508] px-3 py-0.5 font-mono text-xs font-black uppercase shadow-[2px_2px_0_#060508] ${rMeta.badgeClass}`}
                    >
                      <span className="inline-block skew-x-10">
                        <Sparkles size={12} className="mr-1 inline" /> ¡CARTA FORJADA ·{' '}
                        {rMeta.label}!
                      </span>
                    </span>

                    <h3 className="font-jojo-display text-3xl text-[#f5efe0] uppercase">
                      {rewardCard.name}
                    </h3>

                    <div className="jojo-foil-shimmer relative overflow-hidden rounded-[8px]">
                      <CardView
                        card={rewardCard}
                        size="lg"
                        highlighted={rMeta.id === 'BIZARRE_RARE'}
                        badgeText={
                          craftOutcome.isNew ? '¡NUEVA!' : `×${craftOutcome.newOwnedCount}`
                        }
                        onClick={() => openInspector(rewardCard.id)}
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const cid = rewardCard.id;
                          setCraftOutcome(null);
                          openInspector(cid);
                        }}
                        className="jojo-btn-ink px-4 py-2 font-jojo-heading text-xs tracking-widest uppercase"
                      >
                        Ver Ficha
                      </button>
                      <button
                        type="button"
                        onClick={() => setCraftOutcome(null)}
                        className="jojo-btn-primary px-5 py-2 font-jojo-heading text-xs tracking-widest uppercase"
                      >
                        Continuar
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              );
            })()}
        </AnimatePresence>

        {/* Binder Card Grid with snappy filter transition */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${typeFilter}-${partFilter}-${categoryFilter}-${rarityFilter}-${ownedFilter}-${onlySynergies ? 'syn' : 'all'}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {filtered.length === 0 ? (
              <div className="jojo-panel py-16 text-center text-sm text-zinc-400">
                No se encontraron cartas con estos filtros.
              </div>
            ) : (
              <div className="grid grid-cols-2 justify-items-center gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {filtered.map((card) => {
                  const asset = resolveCardAsset(card.imageId, card.assetFolder, overrides);
                  const unlocked = isCardUnlocked(progression, card.id);
                  const owned = getOwnedCount(progression, card.id);
                  const rarityMeta = card.type === 'ENERGY' ? null : RARITY_META[getCardRarity(card.id)];
                  return (
                    <div key={card.id} className="group flex flex-col items-center gap-1.5">
                      <div
                        className={`relative transition-transform duration-150 group-hover:-translate-y-1.5 ${
                          !unlocked ? 'opacity-50 grayscale-[75%]' : ''
                        }`}
                      >
                        <CardView
                          card={card}
                          size="md"
                          onClick={() => openInspector(card.id)}
                          badgeText={
                            !unlocked
                              ? 'BLOQUEADA'
                              : card.type === 'ENERGY'
                                ? '∞'
                                : owned > 1
                                  ? `×${owned}`
                                  : !asset.url
                                    ? 'PENDIENTE'
                                    : undefined
                          }
                        />
                        {!unlocked && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <span className="flex h-9 w-9 items-center justify-center border-2 border-[#060508] bg-[#0b090e]/90 text-[#f2c12e] shadow-[3px_3px_0_#060508]">
                              <Lock size={16} />
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex w-[148px] items-center justify-between gap-1">
                        {rarityMeta && (
                          <span
                            className={`shrink-0 border border-[#060508] px-1.5 py-0.5 font-mono text-[9px] font-black uppercase ${rarityMeta.badgeClass}`}
                          >
                            {rarityMeta.short}
                          </span>
                        )}
                        <span className="truncate font-jojo-heading text-xs tracking-wider text-zinc-200 uppercase group-hover:text-[#f2c12e]">
                          {card.name}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
