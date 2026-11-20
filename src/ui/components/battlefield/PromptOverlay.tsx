import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Minus, Plus } from 'lucide-react';
import { getCardById } from '../../../data/cardRegistry';
import {
  getEffectiveCharacterProfile,
  getEffectiveStandProfile,
} from '../../../engine/helpers/cardStats';
import { getStatusLabel } from '../../../engine/statuses/statusSystem';
import type { PromptResponsePayload } from '../../../engine/types/actions';
import type { GameState, PlayerPrompt } from '../../../engine/types/state';
import { CardView } from '../cards/CardView';

interface PromptOverlayProps {
  state: GameState;
  prompt: PlayerPrompt;
  onRespond: (response: PromptResponsePayload) => void;
}

export function PromptOverlay({ state, prompt, onRespond }: PromptOverlayProps) {
  const player = state.players[prompt.playerId];
  const [allocation, setAllocation] = useState<Record<string, number>>({});
  const [pickedIndices, setPickedIndices] = useState<number[]>([]);
  const [reorderIndices, setReorderIndices] = useState<number[]>([]);

  useEffect(() => {
    if (prompt.kind === 'DISTRIBUTE_BENCH_DAMAGE') {
      const init: Record<string, number> = {};
      for (const id of prompt.eligibleInstanceIds) init[id] = 0;
      setAllocation(init);
    } else if (prompt.kind === 'SELECT_TOP_CARDS' || prompt.kind === 'SEARCH_DECK_CARDS') {
      setPickedIndices([]);
    } else if (prompt.kind === 'REORDER_OPPONENT_TOP_DECK') {
      setReorderIndices(prompt.cards.map((_, i) => i));
    }
  }, [prompt]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#060508]/85 p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 10 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        className="jojo-panel max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6"
      >
        <div className="mb-3 inline-block -skew-x-10 border-2 border-[#060508] bg-[#f2c12e] px-3 py-0.5 font-jojo-heading text-xs tracking-[0.18em] text-[#0b090e] uppercase shadow-[2px_2px_0_#060508]">
          <span className="inline-block skew-x-10">Decisión — {player.name}</span>
        </div>

        {/* 1. YARE YARE DAZE REACTION */}
        {prompt.kind === 'YARE_YARE_DAZE_REACTION' && (
          <div className="space-y-4">
            <h3 className="font-jojo-display text-3xl text-[#f5efe0] uppercase">
              ¡YARE YARE DAZE!{' '}
              <span className="text-[#e6194b]">({prompt.sourceLabel})</span>
            </h3>
            <div className="jojo-panel-cream p-3 text-sm font-medium">
              Jotaro Kujo va a sufrir{' '}
              <strong className="uppercase">{getStatusLabel(prompt.status)}</strong>. Elige una
              carta de tu mano para descartarla y anular el efecto elemental, o rechaza.
            </div>
            <div className="flex flex-wrap justify-center gap-3 py-1">
              {player.hand.map((cardId, idx) => {
                const card = getCardById(cardId);
                if (!card) return null;
                return (
                  <CardView
                    key={`${cardId}-${idx}`}
                    card={card}
                    size="sm"
                    highlighted
                    badgeText="DESCARTAR"
                    onClick={() =>
                      onRespond({
                        kind: 'YARE_YARE_DAZE_REACTION',
                        accept: true,
                        discardHandIndex: idx,
                      })
                    }
                  />
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => onRespond({ kind: 'YARE_YARE_DAZE_REACTION', accept: false })}
              className="jojo-btn-ink w-full py-2.5 font-jojo-heading text-sm tracking-widest uppercase"
            >
              No descartar (sufrir {getStatusLabel(prompt.status)})
            </button>
          </div>
        )}

        {/* 2. PROMOTE FROM BENCH / RETREAT */}
        {(prompt.kind === 'PROMOTE_FROM_BENCH' || prompt.kind === 'RETREAT_CHOOSE_NEW_ACTIVE') && (
          <div className="space-y-4">
            <h3 className="font-jojo-display text-2xl text-[#f5efe0] uppercase">
              Elige tu nuevo Personaje Activo
            </h3>
            <p className="text-sm text-zinc-300">
              {prompt.kind === 'PROMOTE_FROM_BENCH' ? prompt.reason : prompt.sourceLabel}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {player.bench.map((b) => {
                const prof = getEffectiveCharacterProfile(b);
                const card = getCardById(prof.currentCardId);
                if (!card) return null;
                return (
                  <div key={b.instanceId} className="flex flex-col items-center gap-1.5">
                    <CardView
                      card={card}
                      size="md"
                      highlighted
                      badgeText={`${b.currentHp} HP`}
                      onClick={() =>
                        onRespond({ kind: prompt.kind, benchInstanceId: b.instanceId })
                      }
                    />
                    <span className="font-jojo-heading text-sm tracking-wider text-[#f2c12e]">
                      {prof.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. DISTRIBUTE BENCH DAMAGE */}
        {prompt.kind === 'DISTRIBUTE_BENCH_DAMAGE' && (() => {
          const targetPlayer = state.players[prompt.targetPlayerId];
          const targets = [
            ...(targetPlayer.active ? [{ inst: targetPlayer.active, label: 'ACTIVO' }] : []),
            ...targetPlayer.bench.map((b, i) => ({ inst: b, label: `BANCA ${i + 1}` })),
          ].filter((t) => prompt.eligibleInstanceIds.includes(t.inst.instanceId));

          const allocated = Object.values(allocation).reduce((s, n) => s + n, 0);
          const remaining = prompt.totalDamage - allocated;

          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-jojo-display text-2xl text-[#f5efe0] uppercase">
                    Repartir Daño — {prompt.attackName}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Distribuye {prompt.totalDamage} puntos en bloques de {prompt.increment}.
                  </p>
                </div>
                <span
                  className={`border-2 border-[#060508] px-3 py-1 font-jojo-display text-base uppercase shadow-[3px_3px_0_#060508] ${
                    remaining === 0
                      ? 'bg-[#00b87c] text-[#0b090e]'
                      : 'bg-[#e6194b] text-white'
                  }`}
                >
                  Restante: {remaining}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {targets.map(({ inst, label }) => {
                  const prof = getEffectiveCharacterProfile(inst);
                  const val = allocation[inst.instanceId] ?? 0;
                  return (
                    <div
                      key={inst.instanceId}
                      className="flex items-center justify-between border-2 border-[#060508] bg-[#0e0b14] p-3 shadow-[3px_3px_0_#060508]"
                    >
                      <div>
                        <span className="font-jojo-heading text-[11px] tracking-widest text-[#f2c12e]">
                          {label}
                        </span>
                        <div className="font-bold text-[#f5efe0]">{prof.name}</div>
                        <div className="font-mono text-xs text-zinc-400">HP: {inst.currentHp}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={val < prompt.increment}
                          onClick={() =>
                            setAllocation((prev) => ({
                              ...prev,
                              [inst.instanceId]: Math.max(
                                0,
                                (prev[inst.instanceId] ?? 0) - prompt.increment,
                              ),
                            }))
                          }
                          className="jojo-btn-ink flex h-8 w-8 items-center justify-center disabled:opacity-30"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-10 text-center font-jojo-display text-xl text-[#e6194b]">
                          {val}
                        </span>
                        <button
                          type="button"
                          disabled={remaining < prompt.increment}
                          onClick={() =>
                            setAllocation((prev) => ({
                              ...prev,
                              [inst.instanceId]: (prev[inst.instanceId] ?? 0) + prompt.increment,
                            }))
                          }
                          className="jojo-btn-primary flex h-8 w-8 items-center justify-center disabled:opacity-30"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2.5">
                {targetPlayer.active && (
                  <button
                    type="button"
                    onClick={() => {
                      const allActive: Record<string, number> = {};
                      for (const id of prompt.eligibleInstanceIds) allActive[id] = 0;
                      allActive[targetPlayer.active!.instanceId] = prompt.totalDamage;
                      setAllocation(allActive);
                    }}
                    className="jojo-btn-ink px-4 py-2.5 font-jojo-heading text-xs tracking-wider uppercase"
                  >
                    Todo al Activo
                  </button>
                )}
                <button
                  type="button"
                  disabled={remaining !== 0}
                  onClick={() =>
                    onRespond({ kind: 'DISTRIBUTE_BENCH_DAMAGE', allocation })
                  }
                  className="jojo-btn-primary flex-1 py-2.5 font-jojo-heading text-base tracking-[0.12em] uppercase disabled:opacity-40"
                >
                  Confirmar Reparto
                </button>
              </div>
            </div>
          );
        })()}

        {/* 4. SELECT TOP CARDS */}
        {prompt.kind === 'SELECT_TOP_CARDS' && (
          <div className="space-y-4">
            <h3 className="font-jojo-display text-2xl text-[#f5efe0] uppercase">
              {prompt.sourceLabel} — Elige {prompt.pickCount} carta(s)
            </h3>
            <p className="text-xs text-zinc-300">
              Seleccionadas: <strong>{pickedIndices.length}/{prompt.pickCount}</strong>. El resto irá
              a la parte {prompt.restTo === 'TOP' ? 'superior' : 'inferior'} del mazo.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {prompt.cards.map((cardId, idx) => {
                const card = getCardById(cardId);
                if (!card) return null;
                const isSelected = pickedIndices.includes(idx);
                return (
                  <CardView
                    key={`${cardId}-${idx}`}
                    card={card}
                    size="sm"
                    selected={isSelected}
                    badgeText={isSelected ? 'ELEGIDA' : undefined}
                    onClick={() => {
                      setPickedIndices((prev) => {
                        if (prev.includes(idx)) return prev.filter((x) => x !== idx);
                        if (prev.length >= prompt.pickCount) return prev;
                        return [...prev, idx];
                      });
                    }}
                  />
                );
              })}
            </div>
            <button
              type="button"
              disabled={pickedIndices.length !== prompt.pickCount}
              onClick={() => onRespond({ kind: 'SELECT_TOP_CARDS', pickedIndices })}
              className="jojo-btn-primary w-full py-2.5 font-jojo-heading text-base tracking-widest uppercase disabled:opacity-40"
            >
              Confirmar Selección
            </button>
          </div>
        )}

        {/* 5. REORDER OPPONENT TOP DECK */}
        {prompt.kind === 'REORDER_OPPONENT_TOP_DECK' && (
          <div className="space-y-4">
            <h3 className="font-jojo-display text-2xl text-[#f5efe0] uppercase">
              {prompt.sourceLabel} — Reordena el mazo rival
            </h3>
            <div className="space-y-2">
              {reorderIndices.map((origIdx, pos) => {
                const card = getCardById(prompt.cards[origIdx]!);
                return (
                  <div
                    key={`${origIdx}-${pos}`}
                    className="flex items-center justify-between border-2 border-[#060508] bg-[#0e0b14] px-4 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="border border-[#060508] bg-[#f2c12e] px-2 py-0.5 font-mono text-xs font-bold text-[#0b090e]">
                        #{pos + 1}
                      </span>
                      <span className="font-bold text-[#f5efe0]">
                        {card?.name ?? prompt.cards[origIdx]}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={pos === 0}
                        onClick={() => {
                          setReorderIndices((prev) => {
                            const copy = [...prev];
                            const tmp = copy[pos - 1]!;
                            copy[pos - 1] = copy[pos]!;
                            copy[pos] = tmp;
                            return copy;
                          });
                        }}
                        className="jojo-btn-ink p-1.5 disabled:opacity-30"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={pos === reorderIndices.length - 1}
                        onClick={() => {
                          setReorderIndices((prev) => {
                            const copy = [...prev];
                            const tmp = copy[pos + 1]!;
                            copy[pos + 1] = copy[pos]!;
                            copy[pos] = tmp;
                            return copy;
                          });
                        }}
                        className="jojo-btn-ink p-1.5 disabled:opacity-30"
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() =>
                onRespond({ kind: 'REORDER_OPPONENT_TOP_DECK', orderedIndices: reorderIndices })
              }
              className="jojo-btn-primary w-full py-2.5 font-jojo-heading text-base tracking-widest uppercase"
            >
              Confirmar Orden
            </button>
          </div>
        )}

        {/* 6. CHOOSE ENEMY BENCH TARGET */}
        {prompt.kind === 'CHOOSE_ENEMY_BENCH_TARGET' && (
          <div className="space-y-4">
            <h3 className="font-jojo-display text-2xl text-[#f5efe0] uppercase">
              {prompt.sourceLabel} — Objetivo en Banca Rival
            </h3>
            <p className="text-sm text-zinc-300">
              {prompt.effect === 'APPLY_BURN'
                ? 'Selecciona qué personaje de la banca rival pasará a estar Quemado.'
                : 'Selecciona qué personaje de la banca rival será devuelto a su mazo.'}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {state.players[prompt.targetPlayerId].bench.map((b) => {
                const prof = getEffectiveCharacterProfile(b);
                const card = getCardById(prof.currentCardId);
                if (!card) return null;
                return (
                  <CardView
                    key={b.instanceId}
                    card={card}
                    size="md"
                    highlighted
                    badgeText={`${b.currentHp} HP`}
                    onClick={() =>
                      onRespond({ kind: 'CHOOSE_ENEMY_BENCH_TARGET', benchInstanceId: b.instanceId })
                    }
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* 7. CHOOSE ENEMY STAND ATTACK */}
        {prompt.kind === 'CHOOSE_ENEMY_STAND_ATTACK' && (() => {
          const enemyStand = state.players[prompt.targetPlayerId].active?.attachedStand;
          const attacks = enemyStand
            ? getEffectiveStandProfile(enemyStand).attacks.filter((a) =>
                prompt.availableAttackIds.includes(a.id),
              )
            : [];
          return (
            <div className="space-y-4">
              <h3 className="font-jojo-display text-2xl text-[#f5efe0] uppercase">
                {prompt.sourceLabel} — Copiar Ataque Rival
              </h3>
              <div className="space-y-2">
                {attacks.map((atk) => (
                  <button
                    key={atk.id}
                    type="button"
                    onClick={() =>
                      onRespond({ kind: 'CHOOSE_ENEMY_STAND_ATTACK', attackId: atk.id })
                    }
                    className="jojo-btn-ink flex w-full items-center justify-between p-3.5 text-left"
                  >
                    <div>
                      <div className="font-jojo-heading text-lg tracking-wider text-white">
                        {atk.name}
                      </div>
                      {atk.effectText && (
                        <div className="mt-0.5 text-xs text-zinc-300">{atk.effectText}</div>
                      )}
                    </div>
                    <span className="border-2 border-[#060508] bg-[#e6194b] px-2.5 py-0.5 font-jojo-display text-sm text-white">
                      {atk.damageLabel ?? atk.baseDamage}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* 8. RECOVER ITEM FROM DISCARD */}
        {prompt.kind === 'RECOVER_ITEM_FROM_DISCARD' && (
          <div className="space-y-4">
            <h3 className="font-jojo-display text-2xl text-[#f5efe0] uppercase">
              {prompt.sourceLabel} — Recuperar Objeto
            </h3>
            <p className="text-xs text-zinc-300">
              Volverá a tu {prompt.destination === 'HAND' ? 'mano' : 'mazo'}.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {player.discard.map((cardId, idx) => {
                const card = getCardById(cardId);
                if (!card || card.type !== 'ITEM') return null;
                return (
                  <CardView
                    key={`${cardId}-${idx}`}
                    card={card}
                    size="sm"
                    highlighted
                    onClick={() =>
                      onRespond({ kind: 'RECOVER_ITEM_FROM_DISCARD', discardIndex: idx })
                    }
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* 9. SEARCH DECK CARDS (¡Atracción entre usuarios de Stand! / Flecha de Stand / Flecha Réquiem) */}
        {prompt.kind === 'SEARCH_DECK_CARDS' && (() => {
          const eligible = player.deck
            .map((cardId, deckIdx) => ({ cardId, deckIdx, card: getCardById(cardId) }))
            .filter(
              (entry): entry is { cardId: string; deckIdx: number; card: NonNullable<typeof entry.card> } => {
                if (!entry.card) return false;
                if (prompt.filter === 'ENERGY') return entry.card.type === 'ENERGY';
                if (prompt.filter === 'STAND') return entry.card.type === 'STAND';
                if (prompt.filter === 'STAND_EVOLUTION') {
                  return entry.card.type === 'EVOLUTION' && entry.card.evolutionTarget === 'STAND';
                }
                return entry.card.type === 'CHARACTER' || entry.card.type === 'STAND';
              },
            )
            .sort((a, b) => {
              if (a.card.type !== b.card.type) {
                return a.card.type === 'STAND' ? -1 : 1;
              }
              return a.card.name.localeCompare(b.card.name);
            });

          const maxSelectable = Math.min(prompt.maxPickCount, eligible.length);

          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-jojo-display text-2xl text-[#f5efe0] uppercase">
                    {prompt.sourceLabel} — Buscar en el Mazo
                  </h3>
                  <p className="text-xs text-zinc-300">
                    Elige hasta <strong>{maxSelectable}</strong>{' '}
                    {prompt.filter === 'ENERGY'
                      ? 'carta(s) de Energía Básica'
                      : prompt.filter === 'STAND'
                        ? 'carta de Stand'
                        : prompt.filter === 'STAND_EVOLUTION'
                          ? 'carta de Evolución de Stand'
                          : 'carta de Stand o Personaje'}
                    . Tu mazo se barajará al terminar.
                  </p>
                </div>
                <span className="border-2 border-[#060508] bg-[#f2c12e] px-3 py-1 font-jojo-display text-sm text-[#0b090e] shadow-[3px_3px_0_#060508]">
                  {pickedIndices.length} / {maxSelectable}
                </span>
              </div>

              <div className="flex max-h-[52vh] flex-wrap justify-center gap-3 overflow-y-auto py-1">
                {eligible.map(({ card, deckIdx }) => {
                  const isSelected = pickedIndices.includes(deckIdx);
                  return (
                    <CardView
                      key={`${card.id}-${deckIdx}`}
                      card={card}
                      size="sm"
                      selected={isSelected}
                      highlighted={!isSelected && pickedIndices.length < maxSelectable}
                      badgeText={isSelected ? 'ELEGIDA' : undefined}
                      onClick={() => {
                        setPickedIndices((prev) => {
                          if (prev.includes(deckIdx)) return prev.filter((x) => x !== deckIdx);
                          if (prev.length >= maxSelectable) return prev;
                          return [...prev, deckIdx];
                        });
                      }}
                    />
                  );
                })}
              </div>

              <button
                type="button"
                disabled={pickedIndices.length === 0 && maxSelectable > 0}
                onClick={() =>
                  onRespond({ kind: 'SEARCH_DECK_CARDS', deckIndices: pickedIndices })
                }
                className="jojo-btn-primary w-full py-2.5 font-jojo-heading text-base tracking-widest uppercase disabled:opacity-40"
              >
                Añadir a la Mano ({pickedIndices.length}/{maxSelectable}) y Barajar
              </button>
            </div>
          );
        })()}

        {/* 10. RECOVER ENERGY FROM DISCARD (Impulso Espiritual) */}
        {prompt.kind === 'RECOVER_ENERGY_FROM_DISCARD' && (
          <div className="space-y-4">
            <h3 className="font-jojo-display text-2xl text-[#f5efe0] uppercase">
              {prompt.sourceLabel} — Recuperar Energía
            </h3>
            <p className="text-xs text-zinc-300">
              Elige 1 carta de Energía Básica de tu pila de descartes para devolverla a tu mano.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {player.discard.map((cardId, idx) => {
                const card = getCardById(cardId);
                if (!card || card.type !== 'ENERGY') return null;
                return (
                  <CardView
                    key={`${cardId}-${idx}`}
                    card={card}
                    size="sm"
                    highlighted
                    badgeText="RECUPERAR"
                    onClick={() =>
                      onRespond({ kind: 'RECOVER_ENERGY_FROM_DISCARD', discardIndex: idx })
                    }
                  />
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
