## V2.0

### Priorité
Migration Foundry v14:
- Ramener toutes les notes écrites
- Afficher les ressources FQ Directement dans la play dialog et dans la hand-container
- Mettre à jour avec les feuilles de persos dnd5 (5.3>)
- Revoir css, homogeneiser fonts...
- changer les noms des templates et supprimer l'inutile
- Déplacer les templates
- Repasser sur tous les TODO
- Faire un point sur todos.*
- Passage en typescript
- Couverture de test avec rapport > 80%
- Rajouter des règles d'architectures
- Passage sur tout le code inutile, redispatchable et ne plus cité d'autre nom - Refacto pour s'affranchir du code de
  fq-card-engine - Parcourir les attributs de FqCardEngineModule et enlever ce qui ne sert à rien
- Script de migration json a ajouter avec fq-eizh-assets (est ce qu'on commence a y mettre les cartes?)

### Fix:

- le hud ne fonctionne pas (render-token.js)
- Migration 14: Problématique au niveau de la génération des decks:
    - Problématique sur blank world ?
    - Ajout de macros GM de génération de cartes pour les tests
    - Ajout de test

### Feature:

- Comment faire en sorte que les jets de dés aillent plus vite avec dice so nice (module recommandé)

- Refonte des cartes : 
    - Nouveau générateur de cartes pour remplacer Word? (pas sur)
      - Possible de le faire directement avec le formulaire sur Foundry?
      - Ou simplement utiliser autre chose que Word
    - Faire des cartes qui coutent plus que 10 points d'actions, plus forte
    - Faire des synergies de cartes a faible cout 
    - Les spécificités des classes doivent être plus marqués et ne pas retrouvé trop les mêmes sorts pour chacunes des
  classes
    - Ajout des dégâts armes pour les cartes :
      - Ajouts des dégâts de l'arme équipé pour les sorts de CàC
      - Pouvoir choisir l'arme à utiliser pour le sort si utilisation de l'arme en mettant la première arme équipé en
           premier
      - Afficher sur la carte
- Prise en compte la classe d'armure de DND5E -> Est que l'esquive devient plus qu'une demi-esquive?
- Migrations objets dnd5e v FQ OU comment plus les mettre en avant?
- Gérer les passifs hors de la main, comme les pouvoirs ...
    - Carte Incantation et les passifs en général pas très claire, réécrire ptetre les règle (coute 0 après première
      utilisation), réécriture des passifs
    - Repasse sur toutes les cartes (orthographe, gras, @str ou @for, faire des cartes communes pour points
          d'actions/mana/pioches?)
- Ajout de spécialisation pour les 7 classes jusqu'au niveau 10
- Gérer les erreurs au niveau de la dialog directement plutôt qu'en message
- Prise en compte des resistances

### Chore:

- Mettre à jour readme et page Foundry
- Migration Eizh complète avec les niveaux
- Moulinette IA des visuels
- Gestions des principales Custom eval dans des méthodes

## Backlog

### High:

- Au choix du type de carte n'afficher ou pas les choix dans la dialog
- Se renseigner pour les problèmes d'audio de Foundry

### Medium:

- Gladiateur -> resource spécial pour les armes?, renommer en maître d'armes
- Gérer un nombre d'utilisation pour des armes.
- Gérer du ciblage speciale : Zone
- Ne pas utiliser de points d'actions quand hors combat
- Vérifier qu'un GM est connecté pour pouvoir lancer les cartes
- Lancer les sons des cartes sur un dossier plutôt qu'un fichier (lancer un fichier audio aléatoire d'un dossier)
- Rétrocompatibilité des feuilles : n'ajouter que la partie fq ou toute la feuille ?
- Permettre de remonter les points de vie/mana/zele courant même si éléments actifs
- Supprimer les familier en fin de combat
- Comment gérer les effets visuels si le fichier n'existe pas?
- Limiter la taille de la main? ne pas piocher si arriver à cette limite

### Low:
- Ajouter également une fleche raccourci pour passer une carte du spellbook vers le deck
- Que faire des cartes communes implémentés?
- Lancez différents sons ci plusieurs cibles touchés
- Logué ou trouver un moyen de logué tous les évenements de combat pour pouvoir les réutiliser dans les customEvals
- Améliorer certaines cartes de mage blanc: light energy (json après utilisation)
- Gérer les nb target infini et les portée infini?, les critique, els esquive? (light strike)
- Gérer les cartes chargées directement dans le code natif et pas en script
- Gérer les dissipations d'effet dans un select qui récupère tous les effets des cibles
- Gérer de l'aléatoire dans les cartes recues en montée de niveau à la manière de booster
- Gestion d'une monnaie entre le spellbook et le deck?

### Very Low:

- Gérer un forçage pour MJ des cartes si jamais il y a un problème d'implémentation dans la partie
- Possibilité de choisir des cartes dans un changement de niveau (Pour le moment impossible dans le advancement sans
  recreer une fenêtre )
