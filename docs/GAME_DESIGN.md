# Kingdoms Beneath - (Les Royaumes enfouis)

## Game Design Document — synthèse

## Promesse

Transformer un territoire sauvage en colonie qui résiste aux nuits dangereuses. Le joueur explore et agit directement dans un monde à blocs vu de profil, avec gameplay et physique entièrement en 2D; les habitants exécutent des ordres simples plutôt que de simuler des besoins complexes. La mort du joueur entraîne une réapparition, jamais une fin permanente. Les PNJ peuvent mourir définitivement.

Références d’intention : exploration et construction en sandbox, progression d’équipement, commandes de colonie lisibles et défense nocturne. Ce document décrit une direction de conception, pas une reproduction des systèmes ou contenus de jeux existants.

## Piliers

1. **Explorer** : progresser horizontalement dans des biomes reconnaissables, chercher des ressources et découvrir des lieux.
2. **Transformer** : creuser, miner, poser des blocs et fabriquer des bâtiments fonctionnels.
3. **Progresser** : convertir les ressources en outils, ateliers et capacités d’exploration.
4. **Déléguer** : recruter des PNJ et leur donner des ordres explicites, visibles et annulables.
5. **Se préparer** : exploiter le jour pour bâtir et défendre la colonie contre des menaces croissantes la nuit.

## Boucle de jeu

1. Observer le terrain, la météo, l’heure et les objectifs actifs.
2. Explorer à pied ou inspecter une zone de travail.
3. Récolter des blocs/objets et organiser les piles dans la barre rapide et l’inventaire.
4. Choisir entre fabriquer, construire, commercer ou assigner un ordre.
5. Préparer l’éclairage et les défenses avant le crépuscule.
6. Survivre à l’attaque, récupérer, réparer et étendre la colonie.

Les étapes doivent offrir un choix : progression personnelle plus rapide, ou investissement dans les habitants et la défense.

## Progression cible : première demi-heure

La cadence est une cible à tester avec des joueurs, pas un minutage imposé.

- **Départ** : déplacement, interface de survie et collecte guidée de bois/terre/pierre.
- **Installation** : premiers outils, petit abri, établi et torches.
- **Délégation** : rencontre/recrutement de deux mineurs; affectation d’une zone sûre et lisible.
- **Exploration profonde** : découverte du fer et accès à un atelier de traitement.
- **Première nuit majeure** : avertissement, choix tactique, première horde de zombies, puis retour à la récupération.

Le tutoriel doit enseigner les actions par le contexte et des objectifs courts; aucune ressource rare ne doit bloquer la première base.

## Systèmes de jeu visés

- **Monde** : terrain destructible, surface, couches souterraines, six biomes initiaux (forêt, plaine, montagne, désert, plage, neige), grottes, minerais et points d’intérêt. Les grands éléments peuvent occuper plusieurs cases de matériaux distincts, comme le bois, les branches et les feuilles d'un arbre.
- **Construction** : blocs utilitaires et décoratifs sur un premier plan et un arrière-plan; portes, sols, toits, fenêtres, escaliers, échelles, torches et ateliers. Valider placement, portée, collisions et ressources avant confirmation. Une pièce doit avoir un voisin cardinal sur son plan ou un support sur l'autre plan à la même case. Les cellules d'un objet composite gardent leurs propres propriétés et modifications; les règles de chute ou de disparition du reste de l'objet sont à définir.
- **Ressources** : terre, pierre, bois, puis charbon, cuivre, fer et or. Les blocs ont une durabilité par matériau; maintenir le minage applique un impact toutes les 0,25 seconde. Les fissures progressent depuis le centre, les dégâts partiels persistent et le butin n'est donné qu'à la destruction. La pioche en pierre retire 2 points par impact, possède 500 points de durabilité et s'use d'un point par coup réussi jusqu'à sa casse. Elle fonctionne sur les deux plans sans rendre les fonds naturels minables.
- **Inventaire/craft** : piles, barre rapide, dépôts au sol, recettes et stations (établi, four, forge), progression technologique.
- **Survie/combat** : déplacement, saut, escalade, interactions, armes/outils, santé, réapparition au lit ou au point de départ. La perte d’objets à la mort est un paramètre de difficulté.
- **Cycle et menaces** : aube, jour, crépuscule, nuit; zombies, squelettes, araignées et slimes. Apparition plafonnée et réglable.
- **Lumière et profondeur** : ambiances de jour/nuit, torches et autres sources; seuls les blocs de premier plan arrêtent ou atténuent la lumière et participent aux collisions. Les deux plans de construction suivent la même caméra; des décors 2D non interactifs en parallaxe donnent de la profondeur.
- **Colonie** : villageois et marchands; ordres miner, récolter, construire, transporter, défendre et suivre. Aucun besoin de faim, sommeil ou moral au MVP.
- **Faune/commerce/météo** : animaux apprivoisables; achats/ventes extensibles; clair, pluie, neige et orage d’abord visuels/sonores.
- **Sauvegarde** : sauvegarde automatique versionnée du monde, joueur, inventaire, constructions, PNJ, animaux, météo et progression.
- **Menu principal MVP** : nouvelle partie, reprise de la sauvegarde locale et import/export d'un fichier JSON. Valider les fichiers avant écriture et confirmer tout remplacement de l'emplacement existant.
- **Mode créatif** : option de partie désactivée par défaut, réglable à la création et en pause. Affiche un menu DEV d'ajout de ressources, toujours limité par la capacité de l'inventaire; l'option et les ressources sont sauvegardées. Il ne rend pas le minage instantané.

## Commandes et interface

L’interface est responsive et priorise l’espace de jeu sur téléphone, sans exclure tablette et bureau.

| Action | PC (proposition par défaut) | Mobile/tablette |
|---|---|---|
| Déplacement | A/Q/D ou flèches | Croix directionnelle à gauche |
| Saut / escalade | Espace / direction | Sauter à droite / haut-bas sur la croix |
| Course | Maj | Courrir à droite, maintenu |
| Miner | Clic gauche maintenu, raccourci vide ou outil de minage | Appui maintenu sur une case |
| Placer | Clic gauche, matériau sélectionné | Toucher une case, matériau sélectionné |
| Sélection rapide | 1–0 / clic sur la barre | Barre rapide tactile |
| Plan de construction | Bouton à deux carrés au-dessus de la barre, pour la sélection courante | Même bouton tactile |
| Rotation de pièce | Deux flèches autour de l'aperçu au-dessus de la barre | Mêmes flèches tactiles |
| Zoom | Molette | Pincement à deux doigts |

Les actions, raccourcis et boutons doivent être remappables; distinguer tap, maintien et geste multi-touch. Les contrôles tactiles ne doivent pas masquer la cible ni la barre rapide. Ajouter contraste, taille tactile suffisante et options de réduction des effets visuels.

L'aperçu suit la pièce, sa rotation et son plan; un raccourci vide montre des mains nues, sans rotation, mais conserve le choix du plan pour miner. Les objets fabriqués ou récoltés remplissent les piles correspondantes des raccourcis avant l'inventaire, sans créer de pile dans un raccourci vide. Les recettes peuvent consommer les matériaux de l'inventaire et de la barre.

## Direction artistique et audio

La cible est un pixel art avec des tuiles de base natives de **32 × 32 pixels**, filtrées en nearest-neighbor. Personnages, arbres, bâtiments et autres grands objets peuvent occuper plusieurs cases. La résolution des tuiles est distincte des unités logiques du monde : le prototype utilise actuellement 16 unités par case, ce qui ne doit pas imposer une conversion des sauvegardes pour améliorer le rendu.

Le rendu recherché associe surface et grottes, décors 2D en parallaxe, lumières locales et changements d'ambiance liés à l'heure et à la météo. Préserver une palette contrastée entre biomes et phases du jour; distinguer blocs interactifs, dangers et ordres actifs. Les effets météo, particules et niveaux de détail sont réglables; une qualité lumineuse simplifiée doit conserver la lisibilité et la cohérence de l'occlusion. Utiliser des sons courts et répétables avec variation pour éviter la fatigue.

Les images de référence guident l'ambiance sans être reprises directement comme ressources. Les créations originales du dossier `assets/` suivent la [licence CC BY-NC-SA 4.0](../assets/LICENSE); les ressources tierces conservent leurs licences et attributions.

## Périmètre actuel : premières tranches du MVP

Après le socle technique, les tranches livrées ajoutent le menu et les fichiers de sauvegarde, un terrain forêt/plaine seedé avec cavités, le déplacement/saut/escalade, le minage progressif, les fissures, le placement, 10 raccourcis à piles, un inventaire de 24 piles et des dépôts au sol. Le générateur v3 ajoute des fonds naturels indestructibles sous la surface et dans les grottes, ainsi que des troncs naturels traversables et récoltables en arrière-plan. Les pièces construites en arrière-plan sont plus sombres et récupérables; les torches et échelles restent au premier plan. Les anciennes parties conservent leur générateur. Des décors en parallaxe, un cycle lumineux et des torches à occlusion donnent une première profondeur au monde. La fabrication progressive couvre les torches, échelles, escaliers en bois ou pierre et la pioche en pierre (1 bois + 1 pierre). La catégorie Outils contient des exemplaires non empilables et non posables, déposables au sol; la durabilité propre à chaque exemplaire est conservée et affichée sur son icône. Le rendu utilise des tuiles originales 32 × 32 et une qualité lumineuse économique. L'interface dispose de contrôles clavier/souris, de boutons tactiles et d'un menu DEV conditionné par le Mode créatif.

Le reste du MVP demeure dans le backlog : joystick/remappage, conteneurs et organisation avancée de l'inventaire, système complet de craft et stations, PNJ et ordres, équipements et progression minière, santé/respawn et combat. Le cycle n'engendre pas encore de menaces nocturnes. Les graphismes actuels restent simples et principalement procéduraux; l'icône de la pioche est un pixel art 32×32 recréé d'après le dessin fourni; la météo complète est prévue en V1.
