import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Lock, Minus, Play, Plus, Save, Search, ShoppingBag, Trash2, Upload, Wand2 } from 'lucide-react';
import { ALL_CARDS, getCardById } from '../../data/cardRegistry';
import { DEFAULT_RULES_CONFIG } from '../../data/rulesConfig';
import type { CardType } from '../../data/schemas/cardTypes';
import { autoCompleteDeck } from '../../services/deckAutoComplete';
import { validateDeck } from '../../services/deckValidator';
import {
  getMissingCardsForDeck,
  getOwnedCount,
  isCardUnlocked,
} from '../../services/progressionService';
import { useAppStore } from '../../store/useAppStore';
import { CardView } from '../components/cards/CardView';

const TYPE_LEFT_BAR: Record<CardType, string> = {
  CHARACTER: 'border-l-[#f2c12e]',
  STAND: 'border-l-[#e6194b]',
  EVOLUTION: 'border-l-yellow-300',
  ITEM: 'border-l-[#00b87c]',
  ENERGY: 'border-l-[#f5efe0]',
};

export function DeckBuilderView() {
  const allDecks = useAppStore((s) => s.allDecks);
  const progression = useAppStore((s) => s.progression);
  const setScreen = useAppStore((s) => s.setScreen);
  const saveDeck = useAppStore((s) => s.saveDeck);
  const deleteDeck = useAppStore((s) => s.deleteDeck);
  const openInspector = useAppStore((s) => s.openInspector);
  const openBattleSetup = useAppStore((s) => s.openBattleSetup);

  const [selectedDeckId, setSelectedDeckId] = useState(allDecks[0]?.id ?? '');
  const activeSaved = allDecks.find((d) => d.id === selectedDeckId);

  const [deckName, setDeckName] = useState(activeSaved?.name ?? 'Mi Mazo JoJo');
  const [cardIds, setCardIds] = useState<string[]>(activeSaved?.cardIds ?? []);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(
    activeSaved && !activeSaved.isPreset ? activeSaved.id : null,
  );
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [deckNotice, setDeckNotice] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<CardType | 'ALL'>('ALL');

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const id of cardIds) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [cardIds]);

  const validation = useMemo(() => validateDeck(cardIds), [cardIds]);
  const missingOwned = useMemo(
    () => getMissingCardsForDeck(progression, cardIds),
    [progression, cardIds],
  );
  const [onlyUnlocked, setOnlyUnlocked] = useState(false);

  const loadDeckIntoEditor = (deckId: string) => {
    const found = allDecks.find((d) => d.id === deckId);
    if (!found) return;
    setSelectedDeckId(found.id);
    setDeckName(found.isPreset ? `${found.name} (Copia)` : found.name);
    setCardIds([...found.cardIds]);
    setEditingCustomId(found.isPreset ? null : found.id);
    setSaveFeedback(null);
  };

  const createEmptyDeck = () => {
    setSelectedDeckId('');
    setEditingCustomId(null);
    setDeckName('Nuevo Mazo');
    setCardIds([]);
    setSaveFeedback(null);
  };

  const addCard = (cardId: string) => {
    const card = getCardById(cardId);
    if (!card) return;
    const ruleLimit =
      card.type === 'ENERGY' && card.energyType === 'STAND'
        ? DEFAULT_RULES_CONFIG.maxStandEnergyCopies
        : DEFAULT_RULES_CONFIG.maxCopiesByType[card.type];
    const owned = getOwnedCount(progression, cardId);
    const effectiveLimit =
      ruleLimit === null ? owned : Math.min(ruleLimit, owned);
    const current = counts.get(cardId) ?? 0;
    if (cardIds.length >= DEFAULT_RULES_CONFIG.maxDeckSize) {
      setDeckNotice(
        `El mazo ya está completo (${cardIds.length}/${DEFAULT_RULES_CONFIG.maxDeckSize}). Quita primero alguna carta de la lista derecha para añadir a ${card.name}.`,
      );
      return;
    }
    if (current >= effectiveLimit) {
      setDeckNotice(
        `Ya llevas el máximo disponible de ${card.name} en este mazo (${current}/${effectiveLimit}).`,
      );
      return;
    }
    setCardIds((prev) => [...prev, cardId]);
    setSaveFeedback(null);
    setDeckNotice(null);
  };

  const removeCard = (cardId: string) => {
    const idx = cardIds.lastIndexOf(cardId);
    if (idx === -1) return;
    setCardIds((prev) => {
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
    setSaveFeedback(null);
    setDeckNotice(null);
  };

  const handleAutoComplete = () => {
    if (cardIds.length >= DEFAULT_RULES_CONFIG.maxDeckSize) {
      setDeckNotice(
        `El mazo ya tiene ${cardIds.length}/${DEFAULT_RULES_CONFIG.maxDeckSize} cartas. Quita cartas si quieres rellenar huecos automáticamente.`,
      );
      return;
    }
    const result = autoCompleteDeck(cardIds, progression);
    setCardIds(result.cardIds);
    setDeckNotice(null);
    setSaveFeedback(
      result.addedCount > 0
        ? `¡Mazo rellenado! Se añadieron ${result.addedCount} carta(s) de tu colección (sinergias, Stands, objetos y energías). Pulsa Guardar para conservarlo.`
        : 'No se pudieron añadir más cartas automáticamente.',
    );
  };

  const handleSave = (): string => {
    const id = editingCustomId ?? `custom-deck-${Date.now()}`;
    saveDeck({
      id,
      name: deckName.trim() || 'Mazo sin nombre',
      cardIds,
    });
    setEditingCustomId(id);
    setSelectedDeckId(id);
    setSaveFeedback('Mazo guardado.');
    setDeckNotice(null);
    return id;
  };

  const handleTestDeck = () => {
    const matchesSaved =
      activeSaved &&
      activeSaved.cardIds.length === cardIds.length &&
      activeSaved.cardIds.every((id, i) => id === cardIds[i]) &&
      activeSaved.name === deckName.trim();
    const deckIdToUse = matchesSaved ? activeSaved.id : handleSave();
    openBattleSetup('VS_AI', deckIdToUse);
  };

  const handleDelete = () => {
    if (!editingCustomId) return;
    deleteDeck(editingCustomId);
    const fallback = allDecks[0];
    if (fallback) loadDeckIntoEditor(fallback.id);
  };

  const handleExportDeck = () => {
    const payload = JSON.stringify({ name: deckName, cardIds }, null, 2);
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(payload);
      setSaveFeedback('JSON del mazo copiado al portapapeles.');
    } else {
      setImportJson(payload);
      setShowImportModal(true);
    }
  };

  const handleImportDeck = () => {
    try {
      const parsed = JSON.parse(importJson) as { name?: string; cardIds?: unknown };
      if (!Array.isArray(parsed.cardIds)) {
        setImportError('El JSON debe contener un array "cardIds".');
        return;
      }
      const validIds = parsed.cardIds.filter(
        (id): id is string => typeof id === 'string' && Boolean(getCardById(id)),
      );
      if (validIds.length === 0) {
        setImportError('No se encontraron IDs de cartas válidos.');
        return;
      }
      setDeckName(typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Mazo Importado');
      setCardIds(validIds);
      setEditingCustomId(null);
      setSelectedDeckId('');
      setShowImportModal(false);
      setImportJson('');
      setImportError(null);
      setSaveFeedback(`Mazo importado (${validIds.length} cartas). Pulsa Guardar para persistirlo.`);
    } catch {
      setImportError('JSON inválido. Revisa la sintaxis e inténtalo de nuevo.');
    }
  };

  const catalogFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ALL_CARDS.filter((c) => {
      if (typeFilter !== 'ALL' && c.type !== typeFilter) return false;
      if (onlyUnlocked && !isCardUnlocked(progression, c.id)) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [search, typeFilter, onlyUnlocked, progression]);

  const groupedDeckEntries = useMemo(() => {
    const entries: { cardId: string; count: number; name: string; type: CardType }[] = [];
    for (const [id, count] of counts.entries()) {
      const card = getCardById(id);
      if (card) entries.push({ cardId: id, count, name: card.name, type: card.type });
    }
    const order: Record<CardType, number> = {
      CHARACTER: 1,
      STAND: 2,
      EVOLUTION: 3,
      ITEM: 4,
      ENERGY: 5,
    };
    entries.sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name));
    return entries;
  }, [counts]);

  return (
    <div
      className="relative min-h-[calc(100vh-56px)] py-5"
      style={{
        backgroundImage: 'url(/assets/patterns/pattern1.png)',
        backgroundSize: '340px',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[#0b090e]/92" />

      <div className="relative z-10 mx-auto max-w-[1440px] space-y-4 px-4">
        {/* Top Deck Bar */}
        <div className="jojo-panel flex flex-wrap items-center justify-between gap-3 p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedDeckId}
              onChange={(e) => loadDeckIntoEditor(e.target.value)}
              className="border-2 border-[#060508] bg-[#0e0b14] px-3 py-2 text-xs font-bold text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
            >
              <option value="" disabled>
                — Elegir mazo —
              </option>
              {allDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.isPreset ? '★ ' : '♦ '}
                  {d.name} ({d.cardIds.length}/{DEFAULT_RULES_CONFIG.maxDeckSize})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={createEmptyDeck}
              className="jojo-btn-ink px-3 py-2 font-jojo-heading text-xs tracking-widest uppercase"
            >
              + Mazo Vacío
            </button>
            <button
              type="button"
              onClick={handleAutoComplete}
              disabled={cardIds.length >= DEFAULT_RULES_CONFIG.maxDeckSize}
              title="Rellena automáticamente el mazo hasta 46 cartas con sinergias, objetos y energías usando solo tus cartas desbloqueadas"
              className="jojo-btn-crimson inline-flex items-center gap-1.5 px-3 py-2 font-jojo-heading text-xs tracking-wider uppercase disabled:opacity-35"
            >
              <Wand2 size={13} /> Rellenar ({cardIds.length}/{DEFAULT_RULES_CONFIG.maxDeckSize})
            </button>
            <button
              type="button"
              onClick={handleExportDeck}
              title="Exportar mazo en JSON"
              className="jojo-btn-ink inline-flex items-center gap-1 px-2.5 py-2 font-jojo-heading text-xs tracking-wider uppercase"
            >
              <Download size={13} /> Exportar
            </button>
            <button
              type="button"
              onClick={() => {
                setImportError(null);
                setShowImportModal(true);
              }}
              title="Importar mazo desde JSON"
              className="jojo-btn-ink inline-flex items-center gap-1 px-2.5 py-2 font-jojo-heading text-xs tracking-wider uppercase"
            >
              <Upload size={13} /> Importar
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="Nombre del mazo..."
              className="border-2 border-[#060508] bg-[#0e0b14] px-3 py-1.5 text-sm font-bold text-[#f2c12e] focus:border-[#f2c12e] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSave}
              className="jojo-btn-primary inline-flex items-center gap-1.5 px-4 py-2 font-jojo-heading text-xs tracking-widest uppercase"
            >
              <Save size={13} /> Guardar
            </button>
            {editingCustomId && (
              <button
                type="button"
                onClick={handleDelete}
                className="jojo-btn-crimson p-2"
                title="Eliminar mazo"
              >
                <Trash2 size={14} />
              </button>
            )}
            {validation.valid && missingOwned.length === 0 && (
              <button
                type="button"
                onClick={handleTestDeck}
                className="jojo-btn-ink inline-flex items-center gap-1.5 px-3.5 py-2 font-jojo-heading text-xs tracking-widest text-[#00e599] uppercase"
              >
                <Play size={13} /> Probar
              </button>
            )}
          </div>
        </div>

        {saveFeedback && (
          <div className="border-2 border-[#060508] bg-[#00b87c] px-4 py-1.5 text-xs font-bold text-[#0b090e]">
            {saveFeedback}
          </div>
        )}
        {deckNotice && (
          <div className="border-2 border-[#060508] bg-[#f2c12e] px-4 py-1.5 text-xs font-bold text-[#0b090e]">
            {deckNotice}
          </div>
        )}

        {/* Main Split: Catalog vs Deck Sheet */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          {/* Left: Card Catalog */}
          <div className="jojo-panel space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar carta para añadir..."
                  className="w-full border-2 border-[#060508] bg-[#0e0b14] py-1.5 pr-3 pl-9 text-xs text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
                />
              </div>

              {(['ALL', 'CHARACTER', 'STAND', 'EVOLUTION', 'ITEM', 'ENERGY'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`px-2.5 py-1.5 font-jojo-heading text-xs tracking-wider uppercase ${
                    typeFilter === t ? 'jojo-btn-primary' : 'jojo-btn-ink text-zinc-400'
                  }`}
                >
                  {t === 'ALL' ? 'Todos' : t.slice(0, 5)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOnlyUnlocked((v) => !v)}
                className={`px-2.5 py-1.5 font-jojo-heading text-xs tracking-wider uppercase ${
                  onlyUnlocked ? 'jojo-btn-crimson' : 'jojo-btn-ink text-zinc-300'
                }`}
              >
                Solo mías
              </button>
            </div>

            <div className="grid max-h-[68vh] grid-cols-2 justify-items-center gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {catalogFiltered.map((card) => {
                const count = counts.get(card.id) ?? 0;
                const ruleLimit =
      card.type === 'ENERGY' && card.energyType === 'STAND'
        ? DEFAULT_RULES_CONFIG.maxStandEnergyCopies
        : DEFAULT_RULES_CONFIG.maxCopiesByType[card.type];
                const owned = getOwnedCount(progression, card.id);
                const unlocked = owned > 0;
                const effectiveLimit =
                  ruleLimit === null ? owned : Math.min(ruleLimit, owned);
                const atLimit = !unlocked || count >= effectiveLimit;

                return (
                  <div key={card.id} className="flex flex-col items-center gap-1.5">
                    <div className={`relative ${!unlocked ? 'opacity-45 grayscale-[75%]' : ''}`}>
                      <CardView
                        card={card}
                        size="sm"
                        selected={count > 0}
                        badgeText={!unlocked ? 'BLOQ.' : count > 0 ? `×${count}` : undefined}
                        onClick={() => (unlocked ? addCard(card.id) : openInspector(card.id))}
                      />
                      {!unlocked && (
                        <span className="pointer-events-none absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center border border-[#060508] bg-[#0b090e]/90 text-[#f2c12e]">
                          <Lock size={10} />
                        </span>
                      )}
                    </div>
                    <div className="flex w-[108px] items-center justify-between gap-1">
                      <button
                        type="button"
                        disabled={count === 0}
                        onClick={() => removeCard(card.id)}
                        className="jojo-btn-ink flex h-6 w-6 items-center justify-center disabled:opacity-30"
                      >
                        <Minus size={11} />
                      </button>
                      <span
                        title={
                          unlocked
                            ? card.type === 'ENERGY'
                              ? card.energyType === 'STAND'
                                ? `Energía especial de Stand (máx. ${DEFAULT_RULES_CONFIG.maxStandEnergyCopies} por mazo)`
                                : 'Energías ilimitadas'
                              : `Tienes ${owned} copia(s) en tu colección`
                            : 'Carta bloqueada — consíguela en la Tienda'
                        }
                        className={`font-mono text-[11px] font-bold ${
                          unlocked ? 'text-[#f2c12e]' : 'text-zinc-500'
                        }`}
                      >
                        {count}/{ruleLimit === null ? '∞' : effectiveLimit}
                      </span>
                      <button
                        type="button"
                        disabled={atLimit}
                        onClick={() => addCard(card.id)}
                        className="jojo-btn-primary flex h-6 w-6 items-center justify-center disabled:opacity-30"
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Deck Sheet */}
          <div className="jojo-panel flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between border-b-2 border-[#060508] pb-2.5">
              <div>
                <h2 className="font-jojo-display text-xl tracking-wide text-[#f5efe0] uppercase">
                  LISTA ({cardIds.length}/{DEFAULT_RULES_CONFIG.maxDeckSize})
                </h2>
              </div>
              <span
                className={`border-2 border-[#060508] px-2.5 py-0.5 font-jojo-heading text-xs tracking-widest uppercase ${
                  validation.valid
                    ? 'bg-[#00b87c] text-[#0b090e]'
                    : 'bg-[#e6194b] text-white'
                }`}
              >
                {validation.valid ? 'LEGAL' : 'INCOMPLETO'}
              </span>
            </div>

            {/* Composition Bar */}
            <div className="grid grid-cols-5 border-2 border-[#060508] bg-[#0e0b14] text-center">
              {[
                ['PER', validation.stats.byType.CHARACTER, 'text-[#f2c12e]'],
                ['STD', validation.stats.byType.STAND, 'text-[#e6194b]'],
                ['EVO', validation.stats.byType.EVOLUTION, 'text-yellow-300'],
                ['OBJ', validation.stats.byType.ITEM, 'text-[#00b87c]'],
                ['ENE', validation.stats.byType.ENERGY, 'text-[#f5efe0]'],
              ].map(([lbl, num, cls]) => (
                <div key={String(lbl)} className="border-r border-white/10 py-1.5 last:border-r-0">
                  <div className={`font-jojo-display text-base leading-none ${cls}`}>{num}</div>
                  <div className="mt-0.5 font-mono text-[9px] text-zinc-500">{lbl}</div>
                </div>
              ))}
            </div>

            {(validation.errors.length > 0 ||
              validation.warnings.length > 0 ||
              missingOwned.length > 0) && (
              <div className="space-y-1 text-[11px]">
                {missingOwned.length > 0 && (
                  <div className="flex flex-col gap-1.5 border-l-4 border-[#e6194b] bg-[#2a0c16] px-2.5 py-2 text-rose-200">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        Te faltan <strong>{missingOwned.length}</strong> carta(s) por desbloquear en
                        este mazo:
                      </span>
                      <button
                        type="button"
                        onClick={() => setScreen('SHOP')}
                        className="shrink-0 border border-[#060508] bg-[#f2c12e] px-2 py-0.5 font-jojo-heading text-[10px] tracking-wider text-[#0b090e] uppercase"
                      >
                        <ShoppingBag size={10} className="mr-1 inline" /> Tienda
                      </button>
                    </div>
                    <div className="text-[10px] text-rose-300">
                      {missingOwned
                        .map((m) => {
                          const c = getCardById(m.cardId);
                          return `${c?.name ?? m.cardId} (${m.owned}/${m.needed})`;
                        })
                        .join(' · ')}
                    </div>
                  </div>
                )}
                {validation.errors.map((e, i) => (
                  <div
                    key={`err-${i}`}
                    className="border-l-4 border-[#e6194b] bg-[#2a0c16] px-2.5 py-1.5 text-rose-200"
                  >
                    {e.message}
                  </div>
                ))}
                {validation.warnings.map((w, i) => (
                  <div
                    key={`warn-${i}`}
                    className="border-l-4 border-[#f2c12e] bg-[#241c0d] px-2.5 py-1.5 text-amber-200"
                  >
                    {w.message}
                  </div>
                ))}
              </div>
            )}

            <div className="max-h-[48vh] flex-1 space-y-1 overflow-y-auto pr-1">
              {groupedDeckEntries.length === 0 ? (
                <p className="py-8 text-center text-xs text-zinc-500">
                  Haz clic en las cartas de la izquierda para añadirlas al mazo.
                </p>
              ) : (
                groupedDeckEntries.map((entry) => {
                  const ownedEntry = getOwnedCount(progression, entry.cardId);
                  const isMissingCopy = entry.count > ownedEntry;
                  return (
                    <div
                      key={entry.cardId}
                      className={`flex items-center justify-between gap-2 border border-[#060508] border-l-4 px-2.5 py-1.5 text-xs ${
                        isMissingCopy ? 'bg-[#2a0c16]' : 'bg-[#0e0b14]'
                      } ${TYPE_LEFT_BAR[entry.type]}`}
                    >
                      <button
                        type="button"
                        onClick={() => openInspector(entry.cardId)}
                        className="min-w-0 flex-1 truncate text-left font-semibold text-[#f5efe0] hover:text-[#f2c12e]"
                      >
                        {entry.name}
                        {isMissingCopy && (
                          <span className="ml-1.5 border border-[#060508] bg-[#e6194b] px-1 py-0.2 font-mono text-[9px] font-bold text-white uppercase">
                            Falta ({ownedEntry}/{entry.count})
                          </span>
                        )}
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => removeCard(entry.cardId)}
                          className="border border-[#060508] bg-[#1e1829] px-1.5 text-zinc-300 hover:bg-[#e6194b] hover:text-white"
                        >
                          −
                        </button>
                        <span className="w-5 text-center font-mono font-bold text-[#f2c12e]">
                          {entry.count}
                        </span>
                        <button
                          type="button"
                          onClick={() => addCard(entry.cardId)}
                          className="border border-[#060508] bg-[#1e1829] px-1.5 text-zinc-300 hover:bg-[#f2c12e] hover:text-[#0b090e]"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showImportModal && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Importar mazo JSON"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#060508]/85 p-4"
            onClick={() => setShowImportModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 10 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              className="jojo-panel w-full max-w-lg space-y-4 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-jojo-display text-2xl text-[#f2c12e] uppercase">
                Importar Mazo (JSON)
              </h3>
              <p className="text-xs text-zinc-300">
                Pega el JSON exportado de un mazo con formato{' '}
                <code className="text-[#f2c12e]">{'{"name":"...","cardIds":[...]}'}</code>.
              </p>
              <textarea
                rows={7}
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder='{"name": "Mi Mazo", "cardIds": ["char-jotaro-kujo", ...]}'
                className="w-full border-2 border-[#060508] bg-[#0e0b14] p-2.5 font-mono text-xs text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
              />
              {importError && (
                <div className="border-l-4 border-[#e6194b] bg-[#2a0c16] px-3 py-1.5 text-xs text-rose-200">
                  {importError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="jojo-btn-ink px-4 py-2 font-jojo-heading text-xs tracking-wider uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleImportDeck}
                  className="jojo-btn-primary px-5 py-2 font-jojo-heading text-xs tracking-wider uppercase"
                >
                  Cargar Mazo
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
