# JoJo's Bizarre Adventure Custom TCG — Project Rules

## Official Assets & Card Fidelity
- Never generate, download, or invent artwork for cards. Official full-card PNGs live in `public/assets/cards/official/` and patterns in `public/assets/patterns/`.
- Missing cards (Items, Basic Energies, Stray Cat) must keep neutral, clearly identifiable placeholders until official artwork is provided.
- Never silently alter stats or attack texts printed on the 57 official cards; ask the user before changing any official card's printed values.

## Confirmed Core Rules (`docs/REGLAMENTO_TECNICO.md`)
- Deck size: 40 cards (`CHARACTER`/`STAND`/`EVOLUTION`: max 1 copy, `ITEM`: max 3 copies, `ENERGY`: unlimited).
- Starting hand: 5 cards; max bench: 3 characters (never standalone Stands on bench). First player cannot attack on Turn 1.
- Preparation Phase: Equipping a compatible Stand onto Active OR Bench is free (cannot replace an existing Stand unless revived from discard). Basic Energy: 1/turn (unless boosted by an Item). Evolutions: 1/turn. Any manual bench management ends the turn immediately (except KO promotion, Part 2 Joseph's *Nigerundayo*, and *Cambio Táctico*).
- Statuses: Stunned allows retreating and grants 1-turn consecutive stun resistance after clearing (`preventConsecutiveStun`); Bleed stacks independently (3 turns × 10 dmg); Burn deals 10 fixed dmg and clears immediately on any heal, leaving Active, or promotion to Active.

## Verification
- After engine, deck, or UI changes, run `npm run typecheck`, `npm run test` (including `src/tests/engine/balanceSimulation.test.ts`), and `npm run build`.
