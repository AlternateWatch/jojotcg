# JoJo's Bizarre Adventure Custom TCG — Project Rules

## Repository & Deploy Workflow
- Active repository: `C:\Users\Basildo\Desktop\Proyectos\jojotcg` (`origin/main` = `https://github.com/AlternateWatch/jojotcg.git`).
- Always verify (`npm run typecheck`, `npm run test`, `npm run build`), commit, and push completed work to `origin/main`.
- After pushing, provide the server update command: `cd /var/www/jojotcg && git pull && npm run build` (add `&& pm2 restart jojo-tcg` only when `server.mjs` changes).

## Official Assets & Card Fidelity
- Never generate, download, or invent artwork for cards. User-provided card PNGs come from `C:\Users\Basildo\Downloads\CartasJoJo\` and are copied to `public/assets/cards/official/` (Characters/Stands/Evolutions) or `public/assets/cards/items/` (Items) and registered in `src/services/assetResolver.ts`.
- Menu music `.flac` files come from `C:\Users\Basildo\Downloads\`, copied to `public/assets/music/` and registered in `src/data/menuMusic.ts`.
- Never silently alter stats, energy costs, or printed effect texts on official cards; inspect the PNG before coding and ask if anything is ambiguous.

## New Card Integration Checklist (Mandatory)
Whenever adding a new official card (Character, Stand, Evolution, or Item):
1. Copy its PNG to the matching folder, register it in `src/services/assetResolver.ts`, and update asset count assertions in `src/tests/engine/edgeCasesAndCatalog.test.ts`.
2. Add its data & engine/AI/UI mechanics faithfully (with unit tests).
3. Assign its rarity and add it to its Part & Correlation booster packs in `src/data/progressionData.ts` and relevant thematic sets in `src/data/milestonesData.ts`.
4. **Campaign Integration**: Naturally integrate the new card into its Part's Campaign (`src/data/campaignData.ts`) — both in player story loaner decks and stage opponent decks/encounters. You may adjust existing stages or add new stages, **never exceeding a maximum of 20 stages per Part**.

## Confirmed Core Rules (`docs/REGLAMENTO_TECNICO.md`)
- **Deck Size & Prize Cards**: Strictly **46 cards** (`CHARACTER`/`STAND`/`EVOLUTION`: max 1 copy, `ITEM`: max 3 copies, `ENERGY`: unlimited). At game start, set aside **6 random face-down Prize Cards** while guaranteeing at least 1 Turn-1 playable starter (and any campaign featured card) stays in deck/hand. Eliminating an enemy character draws 1 Prize Card; taking all 6 wins immediately (alongside empty enemy field/bench or deck-out).
- **Setup & Mulligan**: Starting hand 5 cards; max bench 3 characters (never standalone Stands on bench). First player cannot attack on Turn 1. Progressive DG unlock: T1 max DG 3 (or `dg: null`), T2 DG 4, T3 DG 5, T4+ DG 6. On the 3rd mulligan, guarantee a valid Turn-1 starting hand.
- **Preparation Phase**: Equipping a compatible Stand onto Active or Bench is free (cannot replace an existing Stand unless revived from discard; Stray Cat is a Stand consumed from bench user when evolving *Killer Queen: Bites The Dust*). Basic Energy: 1/turn (unless boosted). Evolutions: 1/turn. Items: unlimited/turn, max **1 copy of each equippable item per character**; `ANY_ALLY` consumables target both Active and Bench in UI and AI. Manual bench actions end the turn immediately (except KO promotion, Part 2 Joseph's *Nigerundayo*, and *Cambio Táctico*).
- **Statuses**: Stunned allows retreating (unless locked by *Ataúd de DIO*) and grants 1-turn consecutive stun resistance after clearing (`preventConsecutiveStun`); Bleed stacks independently (3 turns × 10 dmg); Burn deals 10 fixed dmg and clears immediately on any heal, leaving Active, or promotion to Active.
- **Campaign & AI**: Stage 5 (1 pack) and Stage 10 (2 packs) are `HARD` bosses with strict one-time pickup rewards; mandatory themed Story Loaner Deck on 1st clear, Free Mode after clearing; AI featured card guaranteed in opening hand; `HARD` AI retains subtle human-like openings on non-lethal turns so fights reward skill rather than pure RNG.

## Persistence, Roguelike & Cosmetics Invariants
- **Dual Progression Normalizer (CRITICAL)**: Whenever adding any new persistent field to `PlayerProgression` (e.g., `foilCards`, `equippedFoilCardIds`, achievements, rankings), you MUST update **both** `normalizePlayerProgression()` in `src/services/progressionService.ts` **and** `normalizeProgression()` in `src/services/authService.ts`, plus add a regression test in `src/tests/services/progression.test.ts` verifying the field survives `authService.normalizeProgression` (otherwise `/api/auth/me` will strip the field on refresh and sync the wiped object back to MySQL).
- **Roguelike Constraints**: Every starter deck in `ROGUELIKE_STARTER_DECKS` must only include colored basic energies actually required by at least one attack in that deck. Campfire cloning is strictly restricted to `ITEM` and `ENERGY` cards (never `CHARACTER`, `STAND`, or `EVOLUTION`).
- **Holographic / Foil Cards**: Uniform drop rate is `0.1%` (`FOIL_DROP_RATE = 0.001`) across all rarities. Keep holo visuals off in general card grids unless explicitly equipped (`equippedFoilCardIds`); show the Inspector holo toggle/equip controls only for owned holographic cards.

## Verification
- After engine, deck, campaign, or UI changes, run `npm run typecheck`, `npm run test` (including `src/tests/engine/balanceSimulation.test.ts`), and `npm run build`.
