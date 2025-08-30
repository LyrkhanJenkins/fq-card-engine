# Réalisations :

## Saison 1:

- Score de défausse de carte à utiliser. réinitialiser à chaque round.
- Ajouter d'autres consommations dans les sorts passifs de Foundry (comme la défausse)
- Notamment pour les cartes qu'il faut uniquement révélé (cf White-Mage) -> Ne pas défausser la carte mais appliquer les
  effets
- Portée gérée cartes + sorts passifs
- Permettre d'appliquer un effet directement au joueur
- Permettre d'appliquer un effet directement à la cible d'un joueur
- Gestion de la fatigue et des repos
- Permettre de lancer des effets depuis les cartes
- Permettre de lancer des macros depuis les objets
- Implémentation de tous les objets D&D pour les butins
- Déplacement limité par tour (sauf familiers)

## Saison 2:

- Ajout de messages dans le chat pour les repos
- Les repos rendent l'intégralité des points de vie max + temporaires max
- Les items ne donnent plus de points de vie max, mais des points de vie temporaires max
- La duplication de carte force la nouvelle carte à avoir comme origine le deck en duquel on a dupliqué
- Tous les effets des cartes se réinitialisent à la fin du combat
- Gestion des cartes passives ou réutilisables + cout différent quand elles sont utilisés une première fois
- Gérer le fait qu'une carte passive ne peut être jouée qu'une fois par tour
- Définition des sorts D&D accessibles pour toutes les classes
- Possibilité d'implémenter du code spécifique dans une carte
- Gestion des bonus de dégâts/heal globaux
- Gérer les conditions spéciales pour lancer les sorts, macro intégré au Json? (la cible est maudite, à un effet de
  brulure ...etx)
- Gérer les DOTS et HOTS en début de tour --> Réécriture de l'élémentaliste
- Version simplifiée des personnages jusqu'au niveau 5
- Cartes communes du niveau 6
- Les cartes peuvent chacune avoir du code spécifique et des contraintes spécifiques.
- Création dynamique des familiers et serviteurs
- La plupart des conditions particulières des cartes sont vérifié (sauf La cible qui a subi des dégâts )
- 5 Classes implémentées jusqu'au niveau 5
- Ajout des bruitages suivant le type de dégâts
- Dégâts typés (feu, froid, acid...etc)
- Pioche aléatoire corrigée
- Découpage et rajout de musique suivant les régions
- 5 Sorts de bases pour tous les personnages: Dégainer, Rengainer, Courir, Bousculer ou Maîtriser (Macros)


## Développement Foundry :

- Mettre la vie au max si elle est au dessus du max à la fin d'un combat? ou à la fin du buff?
- ulti?
- Implémentez les cartes communes du niveau 6

- Passage en version 11 :
    - Ajout de la documentation du code
    - Quels sont les refactos possibles
        - plan des changements à faire, et qu'est ce qui peut être placé en module
        - Modules de compendium? ( voir les cartes )
        - vidéos de passage d'une version à l'autre
        - 1er Test
- Faire les autres cartes des classes niveau 5

- Création des familiers avec les droits MJs (temporaires: dossier non recréé et droits donnés pour la création)
- Est-ce que les armes ne doivent pas être limité en nombre d'utilisations ?
- Limité les déplacements / tour des familiers
- Finir les derniers loots D&D5
- Entrer dans les logs de toutes les autres actions et pas seulement celles des cartes -> Permettra de savoir si des
  dégâts ont été infligés sur une cible par n'importe quelle source par exemple
- Gérer les différents types de dégâts par carte
- Ajoutez des effets spéciaux suivant le type de dégâts
- Ajoutez la prise en compte des resistances/absorption/vulnérabilité dans les types de dégâts
- Ajouter des sons et effets speciaux custom par carte
- Faire une passe pour le coût des objets?
- Gérer un peu mieux les DOT/HOT/effets pour les ennemis
- Division par 20 des coût des objets?
- Rééquilibrer les objets +1 ou alors augmente tous les dégâts (à voir)
- Faire en sorte de pouvoir lancer des macros de partir de leurs noms avec les cartes.
- Ajouter une valeur xmin et ymin dans les cartes
- Comment faire le gladiateur ?
- Comment copier des cartes facilement d’un deck a un autre !!!?
- Comment gérer l'XP?
- Gérer les murs et les contraintes avec les cartes

### Bugs mineurs détéctés
- Pluie de flèches (image à refaire)
- Message d'erreur lorsque la dernière charge du sort est lancé
- Mauvais libelle effet 'Salto Arrière': Le déplacement de la cible

## Cartes :

Les numéros de versions correspondent à l'avancée déjà réalisé sur les cartes des persos
8.0.1 - Jouable sur Foundry (sauf mecha, guerrier runique) + Illusionist

+ Augmenté (X2) toutes les portées/déplacement
+ Correction de vieux sorts
+ Changement de sorts guerrier runique sur sort de base

8.0.2 Adaptation avant import Foundry :

+ Passes pour donner le type de dégâts
+ Augmenter les dégâts de 10 - 15%.
+ Augmenter les dégâts un peu plus pour les sorts des boosters

8.0.3

+ Passes pour diviser en premiers niveaux
+ Ajouter l'abilité qui modifie les dégâts/soins + rééquilibrage
+ Récupération de mana et pioche ont un chiffre indiquant le niveau de la carte

8.0.3 - Import sur Foundry
Plusieurs sorts de base ( voir quoi faire pour le guerrier runique)

+ Essayer d'harmoniser certains effets d'état

8.0.4 - Premier Rééquilibrage terminé

Récupération de mana -> pas une potion de mana
Ne faudrait-il pas augmenté les dégâts des DOTs
Développements des cartes Succion de mana et passage vers le plan éthéré avec xValue et xMAx

## Personnages :

Illusionist :
Joue sur la portée, faible portée augmentable, plus de portée = plus de dégâts, possibilités d'affecter toutes les
cibles dans un rayon autour de lui (effets benefiques et nefastes)
De base plus aléatoire que les autres (plus de dé que de dégâts bruts
Classes de soutien
Trapper :

- Sacrifiez un point de zèle, le sort s’active et vous gagnez 1 critique par carte jouée jusqu’à que vous critiquiez.
  OU
- Sacrifiez une carte, le sort s’active et vous gagnez 1 critique par carte jouée jusqu’à que vous critiquiez.
  OU
- Chaque fois que vous critiquez, vous pouvez gagner un point de zèle
  Illusionist :
- Si vous faites un critique, vous pouvez augmenter votre bonus de portée de 1. ?
- Si vous faites une esquive, vous pouvez augmenter votre bonus de portée de 1. ?
- Sort d’assistances : (2 de portée) (Coût : 1 point de zèle ou 1 carte défaussée)
  o Peut agripper quelqu’un pour le ramener sur une case adjacente, lui rend 1d4 points de vie.
  o Peut pousser quelqu’un de X cases dans un sens (X étant le bonus de portée), lui rend 1d4 points de vie.
  o Peut se téléporter vers une case adjacente d’un allié (2 de portée), lui rend 1d4 point de vie.
  A la saison 2 de FQ :
  Règles sur les repos:
  Après un repos long, la constitution ajoute X points de vie temporaire (X = (niveau * bonus de constitution)) ? (A
  tester)
  La constitution doit augmenter la récupération des points de vie directement à la fin d’un combat (niveau +
  constitution) ou pendant un repos court (niveau + 1d(2* constitution))
  La sagesse augmente le nombre de points de mana récupéré pendant un repos court (minimum 1) ?

Bien noté qu’au niveau 2 : +1/2 sorts de classes, + 2 dans une caractéristique intermédiaire, niveau3 : un sort parmi
les sorts commun FQ, +1 sort commun 5e ? niveau 4 : +1 dans deux caractéristiques au choix + 2/3 sorts communs D&D (
ajouter les niveau 2 ?), niveau 5 : ½ sorts de classes rang 2 ?
Bien noté ce que Maktry sait de la guilde de Ras Shamra.
Faire des potions de mana
Faire des lootables
Ajouter des notions de charges à ces pouvoirs :
Supprimer le zèle à la fin d’un combat, et remontez les points d’actions aux max
White-Mage :

- Soins mineurs (2 pts de zèle ou 2 défausse ou 2 mana, 1 fois par tour) : 2+1d6 points de vie
- Rituel lumineux : Chercher dans votre deck une carte de soins ou de bouclier et mettez la dans votre main (5 points
  d’actions ou 1 point de zèle, 1 fois par tour)
- Rituel sombre : Chercher dans votre cimetière une carte de soins ou de bouclier et mettez la dans votre main (5 points
  d’actions ou 1 point de zèle, 1 fois par tour)
  Gardien :
- Posture Offensive/Défensive (1 de zèle ou défausse) : Transforme tout le critique en esquive ou inversement*
- Posture de Berzerk (1 de zèle ou défausse): Transforme 7 points de vie et en 1 dégât global de plus.
- Posture de Protecteur (1 de zèle ou défausse): Transforme 1 dégât global en moins en 7 points de vie en plus.
  Monk :
- Uppercut (2 points d’action, 1 fois par tour) : Inflige 1+X points de dégâts, X étant le nombre de carte joué ce
  tour-ci. Piochez une carte.
- Crochet (X point d’action, 3 charges): Inflige X points de dégâts incritiquable.
- Recul (X point de zèle, 1 charge, Xmax=4): Piochez X cartes. Regagnez X points d’action.

Sorcière :

- Fusion de squelette (rang 1) (3 pa) : Sacrifiez 2 squelettes à 2 cases d’écart max et transformez-le en squelette de
  niveau supérieur

Rang 2 :

- Entrainement de squelette (rang1) (1 point de zèle ou défausse) : Transformer 1 squelette de niveau 1 en un squelette
  de niveau 2
- Fusion de squelette (rang 2) (3 pa ou 1 défausse) : Sacrifiez 3 squelettes de niveau 1 à 2 cases d’écart max et
  transformez-le un squelette de niveau 3.
- Entrainement de squelette (rang1) (1 point de zèle ou défausse) : Transformer 1 squelette de niveau 2 en un squelette
  de niveau 3

Gladiateur :

- Ferronnerie : 1 pt de zèle, ou 1 de défausse : Allez chercher dans votre cimetière une carte d’arme et mettez la dans
  votre main (1 fois par tour)
- Forgeron : 1 pt de zèle, ou 1 de défausse : Allez chercher dans votre déck une carte d’arme et mettez là dans votre
  main.
- Artisan émérite : Vos armes ont +1 en durabilité.

Elementalist rang2 :

- 1 des contrôles des élements améliorer : si même élément, apprend un deuxième contrôle des éléments rang 1
- +1 sort d’application direct d’un élément

Trapper rang2 :
Cartes supplémentaires : Mettre un Xmin pour les pioches spécifiques + Permettre de récupérer les flèches directement
sur les ennemis au CàC (si cible morte : 0 pa, si cible vivante, 2 pa et inflige 2 points de dégâts).

- Critique enchaînée : Au lieu de faire un critique, vous pouvez choisir de regagnez tous vos points d’actions (1 fois
  par combat)
- Critique de restauration : Au lieu de faire un critique, vous pouvez choisir de regagnez la moitié de vos points de
  mana maximum (1 fois par combat)
- Critique d’inspiration : Au lieu de faire un critique, vous pouvez choisir de gagner 3 points de zèle (1 fois par
  combat)
  Illusionist rang2 :
- Bloc Illusoire : Place des formes géométrique de la texture de l’environnement, qui sorte de terre et bloque la
  vision, le son et le passage: ((1 point de zèle ou 1 de défausse), 1 de mana)
  o Pavés : de largeur maximale de 2 et de longueur maximale de 3, elles disposent de 10 points de vie et dure 2 tours
- Plaque Illusoire (dure 2 tours, max 2 à la fois) : La cible se voit attribuer un bouclier en forme de plaque qui est
  indestructible et infranchissable qui protège 1 et 1 seul côté de la cible (N/E/O/S): ((1 point de zèle ou 1 de
  défausse), 1 de mana) -> Rappel de règle si on peut tirer un trait invisible entre les 2 milieux des cibles sans
  rencontrer d’obstacles, alors les cibles peuvent s’atteindre !
  o

## Idées en vrac :

- Sort Elementalist ou White-Mage: Augmente les dots en cours de X?
- Aura possible?
- Augmenté la portée avec le zèle
- Augmente le critique/esquive aux alliés adjacents
- Brulure/gel/terre/air/malediction?
- Leurre ? refaire joué une cible morte un tour

- White-Mage Niveau 5 + cartes
- Gardien Niveau 5 + cartes
- Sorcière Niveau 5 + cartes

- Pour gérer le gladiateur, il faut qu’il ait toutes ses armes de base avec lui, les cartes gèrent des charges
- Toutes les armes ont des charges ? (Zelda)
- Est-ce qu’on revoit les caractéristiques ? Est-ce qu’elles augmentent la force des cartes ?
- Faire une feuille de personnage générale et la décliner dans des personnages de niveaux 5 de D&D ?
- Est-ce possible d’augmenter des caractéristiques avec d’autres pour certains personnages uniquement ?
- Peut on mettre des valeurs max de caractéristiques par niveau ?
- Traduire tous les sorts
- Traduire tous les objets
- Revoir prix et natures objets


