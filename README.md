# JoJo's Bizarre Adventure — Custom TCG

Videojuego de cartas coleccionables (TCG) por turnos basado en el universo de JoJo's Bizarre Adventure, con motor de combate determinista separado de la interfaz, 57 cartas oficiales integradas y soporte completo para 1v1 Local (Hotseat) y 1v1 contra IA Táctica.

## Cómo ejecutar

```bash
npm install
npm run dev
```

## Scripts disponibles

- `npm run dev` — Inicia el servidor de desarrollo local (Vite).
- `npm run typecheck` — Verificación estricta de TypeScript (`tsc --noEmit`).
- `npm run test` — Ejecuta la suite completa de pruebas en Vitest (motor, reglas, casos límite e IA).
- `npm run build` — Compila y empaqueta la versión de producción en `dist/`.

## Cómo añadir nuevas cartas e ilustraciones

1. Coloca la imagen `.png` o `.jpg` en `public/assets/cards/official/` (o `items/` / `energies/`).
2. Registra su `imageId` en `src/services/assetResolver.ts` (o cárgalo directamente desde el **Inspector de Carta** dentro del juego).
3. Añade su definición declarativa en `src/data/cards/` (`characters.ts`, `stands.ts`, `evolutions.ts` o `items.ts`).

Consulta `docs/REGLAMENTO_TECNICO.md` para el detalle completo de reglas y mecánicas implementadas.
