## 1.0.0
- Traduction en anglais de toutes les cartes et items
- Règles du jeu et readme complété
- Implémentation des classes à revoir
- Création des personnages de bases
- Réduction aux 5 premières classes/decks

## 0.2.2
- Recette globale avec utilisateurs et MJs

## 0.2.1
- Suppression de tous les warnings/ tous les bugs pour 1.0.0 sans utilisateur

## 0.2.0

- Ne pas pouvoir modifier ou ajouter des cartes dans son deck pour les joueurs
- Macro pour piocher un booster et le mettre dans la bibliotheque du joueur
- Empêcher le drag and drop autre que d'un deck vers une bibliotheque
- Empêcher les joueurs de modifier des cartes d'un deck ou d'une bibliotheque (et de supprimer)

## 0.1.2
- Problématique de taille quand ajout d'une nouvelle main
- Problématique du hover sur les cartes
- MJ doit pouvoir créer les decks pour ses joueurs avec une meta macros
- Migration 12.330 - Enlever lew warnings
- Problématiques avec CardViewer (mettre en expérimentation ou corrigé)


~~Ne piochez ou déplacez que vers des stacks de type fqType~~

~~Macros qui affiche la bibliotheque et le deck côté à côte~~

~~Macros pour créer les deck, bibliothèque défausse et main pour FQ suivant la classe du joueur~~

~~Option pour ne pas défausser les cartes quand on les joue avec le MJ (débuguage)~~

~~Gestion de l'emplacement d'invocation d'un minion~~

~~Macro pour générer un deck à partir de sa classe si non créé~~

## Backlog

### High:
- Implémenter les cartes communes pour le niveau 6 + 4 Sorts Ultime par classes
- tagué les cartes et le nombre max
- affiché le nombre max dans les decks
- Migrations objets et sorts passifs dnd5e v FQ

### Medium:

- Ne pas utiliser de points d'actions quand hors combat
- Gestion de plusieurs modules pour les effets magiques de combat
- Vérifier qu'un GM est connecté pour pouvoir lancer les cartes
- Lancer les sons des cartes sur un dossier plutôt qu'un fichier (lancer un fichier audio aléatoire d'un dossier)

### Low:

- Macro 'Maîtriser' : il faut pouvoir lancer une macro qui ajout un effet à une autre cible sans les drotis comme avec game.dfreds
- Lancez des sons différents ci plusieurs cibles touchés

Clem problems non reproduit :

- Problème de range sur les token trop gros
- Probleme de decorerelation actor/token,

### Very Low:

- Effet de mort à appliquer automatiquement ---> Existe un module pour ça : Memento Mori
