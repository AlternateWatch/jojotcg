# Reglamento Técnico — JoJo's Bizarre Adventure Custom TCG

Documento técnico de referencia que consolida el Reglamento Oficial, las 57 cartas oficiales y todas las resoluciones de reglas confirmadas para el motor de combate (`src/engine/`).

## 1. Construcción de Mazo (`rulesConfig.ts`)
- **Tamaño de mazo**: 40 cartas (configurable).
- **Límites de copias**:
  - Personajes: máximo **1** copia por carta.
  - Stands: máximo **1** copia por carta.
  - Evoluciones: máximo **1** copia por carta.
  - Objetos: máximo **3** copias por carta.
  - Energías básicas: **sin límite** (estilo Pokémon TCG clásico).
- **Mano inicial**: 5 cartas.
- **Banca**: máximo 3 personajes (nunca Stands independientes).

## 2. Inicio de Partida y Mulligan
- Al robar la mano inicial de 5 cartas, cada jugador debe cumplir al menos una condición:
  - Tener un personaje autosuficiente (**Vampiro**, **Hombre del Pilar**, **Usuario de Hamon** o **Luchador Convencional**), **O**
  - Tener un **Usuario de Stand** + un **Stand compatible** en mano (`personaje.dg >= stand.requiredDg` y compatibilidad de personaje si aplica).
- Si no cumple, el jugador realiza **Mulligan**: devuelve la mano al mazo, baraja y roba 5 cartas nuevas. Por cada mulligan, el oponente roba **+1 carta** adicional.
- Ambos jugadores colocan 1 personaje inicial en su **Puesto Activo**.
- **Primer turno (regla Pokémon TCG)**: El Jugador 1 **no puede atacar en su primer turno**.

## 3. Fases del Turno
1. **Fase de Robo (`DRAW`)**: Robo obligatorio de la carta superior del mazo. Si el mazo está vacío al robar, el jugador pierde por deck-out.
2. **Fase de Preparación (`PREPARATION`)**:
   - **Equipar Stand** desde mano a un usuario compatible en el Puesto Activo o en la Banca (gratuito, no consume acción de turno; nunca de forma independiente en un espacio vacío de banca). Requiere `personaje.dg >= stand.requiredDg`. No se puede sustituir un Stand ya equipado (salvo evolución o tras revivir al personaje desde descartes sin su Stand anterior).
   - **Adjuntar Energía** desde mano a cualquier personaje en campo (máximo **1 energía por turno**, estilo Pokémon TCG clásico; no consume la acción principal).
   - **Jugar Objetos**: sin límite por turno (consumibles o equipables).
   - **Evolucionar**: máximo **1 evolución por turno** (incluye cadenas multi-acto como Echoes o Tusk).
   - **Activar Habilidades de Preparación**: habilidades activas de utilidad/robo (ej. *Recursos de la Fundación Speedwagon*, *Solo de Guitarra*, *Dinero Dinero Dinero*, *Leer las Cartas*, etc.).
   - **Gestión de Banca** (bajar personaje a banca, intercambiar activo con banca, o retirar): **consume y finaliza inmediatamente el turno**, saltando directamente a la **Fase de Fin de Turno (`END_TURN`)**. Si el personaje activo tenía Stand y energías/objetos, lo acompañan a la banca (el Stand permanece inactivo allí). La única excepción gratuita es la **promoción obligatoria** cuando el personaje activo cae KO.
3. **Fase de Combate (`COMBAT`)**:
   - El personaje activo (o su Stand equipado) ejecuta **1** ataque o habilidad pagando/verificando las energías adjuntas requeridas (las energías Incoloras se cubren con cualquier tipo de energía).
   - Efectos como *Za Warudo* (máx. 1 vez por turno) conceden habilidades adicionales en la misma Fase de Combate sin finalizar el turno.
4. **Fase de Fin de Turno (`END_TURN`)**:
   - Se resuelven los efectos del jugador cuyo turno termina:
     - **Sangrado**: cada stack activo inflige `10` de daño, reduce su contador (3 turnos consecutivos independientes) y expira al llegar a `0`.
     - **Quemado**: inflige `10` de daño fijo.
     - **Regeneración Vampírica / pasivas de fin de turno**: ej. DIO, Dio Brando, Vanilla Ice curan `10 HP` si no recibieron daño durante el turno.
     - **Aturdido**: si el personaje activo estuvo aturdido durante su turno, se limpia al concluir el turno.

## 4. Estados Alterados (Elementales)
- **Aturdido (`STUNNED`)**: Impide atacar o usar habilidades activas del personaje durante su siguiente turno, pero **permite retirarlo / intercambiarlo** desde la banca (consumiendo el turno). Tras recuperarse de Aturdido, el personaje obtiene **1 turno de resistencia** contra Aturdido consecutivo (configurable en `rulesConfig.ts: preventConsecutiveStun`) para evitar stun-locks infinitos.
- **Sangrado (`BLEED`)**: Acumulativo con stacks independientes de `3` turnos (`10` daño por stack al final del turno del jugador afectado).
- **Quemado (`BURN`)**: `10` de daño fijo al final del turno del jugador afectado (no acumulable). Se elimina inmediatamente al recibir **cualquier curación**, **salir del campo / retirarse** o ser **promovido al Puesto Activo**.

## 5. Defensas, Inmunidades y Casos Límite Confirmados
- **Inmunidad elemental** (*Yare Yare Daze*, *Se te ve la ropa interior*, *Evolución Instantánea*): Aplica exclusivamente a **estados elementales** (Aturdido, Sangrado, Quemado).
- **Yare Yare Daze**: Reacción interactiva; descartar 1 carta de mano anula cualquier estado elemental entrante sobre Jotaro.
- **Control del Agua (N'Doul)**: Inmunidad total contra ataques de energía/elemento Agua (`WATER`).
- **Sentido del Viento (Wamuu)**: Esquiva el primer ataque lanzado en su contra una vez por vida (NO se reinicia al pasar por banca; SÍ se reinicia al ser revivido desde descartes).
- **Intelecto Superior (Kars)**: Evita **todo tipo de KO** (ataques, KO instantáneo, Sangrado/Quemado letal) una vez por partida, dejándolo con `1 HP`.
- **Tecnología Alemana Superior (Stroheim)**: Reduce `-10` de daño recibido **solo de ataques** (no de estados).
- **Intercambio de Almas (Silver Chariot Requiem)**: Intercambia los HP actuales permitiendo sobrepasar el `maxHp`.
- **Distribución de daño a banca**: En incrementos de `10` (o bloques del ataque según texto de carta).
- **No Quedará Nada... (Kosaku Kawajiri)**: Al eliminar a un oponente con objetos equipados activos, los roba a su mano en lugar de descartarlos.
