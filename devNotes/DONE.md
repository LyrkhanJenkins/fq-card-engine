v1.1:

- Exposition des constantes à la racine de FqCardEngineModule
- Supprimer le repertoire d'assets et le gérer directement dans le module pour tout ce qui est sorts de base
- Gérer plusieurs sons pour chaque type de dégâts libre de droit
- Correction bug des passifs et carte rejouable qui traine depuis longtemps
- Gestion de modules optionnels pour les effets speciaux (Sequencer, j2ba, DAE, Card Viewer)
- Correction des familiers pour utiliser leurs attaques
- Ne plus commité les cartes générées
- Refacto : ne plus utiliser le script python pour générer les cartes
- Gérer l'invulnérabilité
- Implémenter des cartes utilisable hors des combats et qui ne se défausse jamais (1/2 par classe ? + les communs,
  les communs apparaissent avec un niveau d'attributs )
- Implémentation de deux nouvelles classes : Gardien et Sorcière
- Créer un sort passif qui sacrifie des squelettes, et gérer une bar spécial pour les squelettes?
- Gérer du ciblage speciale : Skeletons
- Droits joueurs limités
- Afficher le nombre max et les niveaux des cartes dans les decks
- tagué les cartes et le nombre max
- Ne pas pouvoir modifier ou ajouter des cartes dans son deck pour les joueurs
- Empêcher le drag and drop autre que d'un deck vers une bibliothèque
- Empêcher une carte d'une bibliothèque d'aller ailleurs que dans le deck
- Quand une carte va d'une bibliothèque à un deck, en créer une nouvelle à la place (sauf si on dépasse le nombre
  max)
- Créer une bibliothèque à partir du pattern et non pas du niveau 5.
- Empêcher les joueurs de modifier des cartes d'un deck ou d'une bibliothèque (et de supprimer)
- Automatiser la montée de niveau jusqu'au niveau 5 (utiliser la macro )
- Gestion d'animations speciales pour certaines cartes.
- CurrentDrop utilisable hors combat sans drop de card

v1.0:

- Protéger l'utilisation de carte si pas de token controlé par le joueur

v0.1: