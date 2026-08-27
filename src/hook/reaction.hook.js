import OpportunityAttack from "../domain/engine/reaction/opportunity-attack.js";

// Attaque d'opportunité : `moveToken` est le hook de déplacement de Foundry v14,
// appelé APRÈS application et diffusé sur tous les clients, avec le trajet
// réellement parcouru (`movement.passed.waypoints`). Un déplacement intégralement
// bloqué ne le déclenche pas, la détection ne voit donc jamais de mouvement
// fantôme. La garde du MJ désigné est dans le handler, pas ici.
Hooks.on("moveToken", (mover, movement) => OpportunityAttack.onMoveToken(mover, movement));
