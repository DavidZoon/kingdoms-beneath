# Kingdoms Beneath — architecture technique

## Tranche actuellement implémentée

`Application` orchestre le menu DOM, la pause, les options de partie, les panneaux inventaire/DEV, les erreurs et les sauvegardes. `GameSession`, `WorldModel`, `WorldGenerator` et le contrôleur du joueur sont indépendants de Phaser. `WorldScene` compose les chunks visibles depuis un atlas procédural original 32 × 32 et libère leurs textures canvas à leur sortie du champ. `InputController` normalise clavier et boutons tactiles. Le ciblage et le maintien utilisent les événements de pointeur directs du canvas, pour ne pas déplacer la sélection en rejoignant un bouton DOM; le pincement reste un adaptateur Phaser.

`BlockInteraction` suit les gestes sur le monde : raccourci vide ou outil pour miner, objet constructible pour poser. La pose tactile attend le relâchement pour ne pas placer de bloc au début d'un pincement. Un second doigt annule l'action jusqu'au relâchement de tous les doigts, et changer de sélection, de rotation ou de plan, ou vider la pile, exige un nouveau geste. La souris conserve le placement maintenu, tout en prenant en compte les clics plus courts qu'une frame. Les commandes de déplacement forment une croix à gauche, avec course et saut séparés à droite.

La simulation actuelle est latérale et entièrement 2D. Une case occupe 16 unités de monde, les chunks font 32 × 32 cases, les textures sources restent en 32 × 32 pixels (échelle monde 0,5, zoom de référence 2). Le générateur v3 reprend le terrain v2, déplace les troncs naturels en arrière-plan et crée un fond indestructible sous la surface; dans les cavités, son matériau est celui du bloc de premier plan généré le plus proche, selon la distance euclidienne, avec départage par `y` puis `x`. Les générateurs v1 et v2 restent inchangés pour les anciennes parties et ne génèrent pas de fond naturel. Les décors visuels défilent en parallaxe; les deux plans de construction partagent exactement les coordonnées et la caméra. La météo reste une cible.

`parallax` fixe la hauteur de référence des reliefs lointains et de la forêt à la surface générée à l'origine du monde, indépendamment de la colonne sous la caméra. Chaque plante décorative échantillonne le sol à son ancrage logique fixe, avant décalage de parallaxe. Le défilement conserve ses facteurs horizontaux, sans saut vertical de décor aux changements de hauteur du terrain; la caméra suit toujours le joueur et les deux plans physiques restent alignés. Les profondeurs placent tous les décors derrière le jeu : paysage à -10, plantes à -3, blocs d'arrière-plan à -2, blocs de premier plan à 0, objets déposés à 3 et personnage à 4.

`camera` centre le personnage entre les bords réels des éléments DOM marqués `data-camera-edge`, sans inclure les panneaux et menus. `Application` mesure les éléments visibles, y compris le statut mobile sous l'en-tête; `WorldScene` convertit ce centre écran en décalage de monde corrigé du zoom. Le rendu, le ciblage et les chunks gardent la même caméra. Les petits écrans disposent d'un HUD compact pour préserver une zone de jeu libre.

Le stockage actuel utilise une transaction IndexedDB pour remplacer l'emplacement `active` de la base `kingdoms-beneath`. Le JSON porte `format: "kingdoms-beneath"`, `schemaVersion: 10` et `generatorVersion: 1 | 2 | 3 | 4 | 5`. Il contient métadonnées, seed, tick, joueur, inventaire, piles, sélection et plans des dix raccourcis, fabrication, modifications des deux plans avec rotations, objets au sol, `collectedNaturalPickups`, `collectedPlants`, `blockDamage` par plan, `creativeMode` et `lightingQuality`. Les schémas v1 à v9 sont migrés sans changer leur générateur; les formats antérieurs à v8 reçoivent une liste d'outils vide, ceux antérieurs à v10 une liste de plantes cueillies vide. `wood` devient `pine_log` dans les inventaires, raccourcis et dépôts des anciens formats, et le bloc numérique 4 garde son identité. Les formats antérieurs aux plans sont initialisés au premier plan et leurs rotations conservées. Pour les formats antérieurs aux raccourcis à piles, une pile au maximum de chaque ancien type est déplacée vers son raccourci d'origine; le surplus reste dans l'inventaire et l'excédent v1 devient des piles au sol. Le validateur rejette notamment les doublons sur un même plan, les fonds naturels ordinaires modifiés, les objets incompatibles et les dégâts ou collisions invalides. Chaque outil doit être un exemplaire unique doté d'une durabilité entière entre 1 et son maximum, dans l'inventaire, les raccourcis comme au sol. Limites : 10 Mo, 100 000 modifications partagées entre les deux plans, 100 000 entrées de dégâts, 100 000 ramassages naturels et 100 000 plantes cueillies. Un import valide requiert confirmation; un import rejeté ne touche pas à IndexedDB.

Le générateur v4 ajoute des bassins d'eau statiques et des ressources de forêt. `BiomeResources` conserve ses règles originales dans `V4_RESOURCE_RULES`; le générateur v5 réduit les probabilités de forêt de 30 % (65 % pour les rares) et ajoute la plaine via `RESOURCE_RULES`. La plaine privilégie herbes, fleurs et fibres, avec peu d'arbres et des minerais comparables. `grass` accepte l'herbe et la prairie comme support, sans traverser les frontières du biome. Une probabilité s'applique à chaque cellule de support éligible; une croissance cardinale produit un amas de taille variable autour de la moyenne, limitée par les supports et le biome. Les secteurs de 64 colonnes utilisent une marge de 24 colonnes couvrant les dépendances (granit/marbre, troncs/feuilles et coquillages/perles), puis ne conservent que leurs cellules centrales; le cache est borné à 16 secteurs. Les poissons et coquillages sont dérivés du générateur et affichés/ramassés localement, sans matérialiser tout le monde dans `groundDrops`; seuls leurs identifiants déjà ramassés sont persistés. Les constructions identiques au support généré conservent une édition explicite pour ne pas recréer sa récolte. Les produits animaux restent dans le catalogue sans génération.

`GameSession.plantsAt` dérive les plantes depuis leurs supports naturels, sur leur propre case visible, et exclut `collectedPlants`. Le ciblage réutilise le rayon de premier plan; la cueillette a priorité sur la pose ou le minage lors de l'appui initial. Un geste `harvest` utilise `MiningHold` (250 ms) mais ne retombe jamais sur le minage lorsque la plante disparaît. `harvestPlant` vérifie la portée et la capacité avant de marquer la plante cueillie, sans dégâts au support ni usure d'outil; l'excédent reste au sol. Les plantes ne sont plus des récompenses de minage du support; résine et sève le restent.

`BLOCKS.liquid` identifie les liquides. Le minage les refuse sans dégât, dépôt, édition ou usure, et les rayons les traversent pour atteindre les autres blocs. `playerInLiquid` examine uniquement les cellules de premier plan qui chevauchent le personnage; cet état est dérivé, non sauvegardé. La surface est le sommet des colonnes de liquide continues chevauchées. Dans l'eau, monter/descendre commande la vitesse verticale sans escalade; la remontée normale s'arrête au centre du personnage. Une immersion inférieure à la moitié du corps laisse agir la gravité. Sans commande, le personnage suffisamment immergé flotte. Le saut applique la même impulsion qu'à terre et conserve sa vitesse ascendante sous gravité tant qu'elle dépasse la vitesse de nage, pour permettre la sortie de l'eau sans nouvel état sauvegardé. Les collisions solides restent actives et la gravité reprend à la sortie. Les touches et boutons d'escalade servent aussi à nager.

`WorldModel` conserve séparément les éditions et les caches de chunks des deux plans, ainsi que l'origine de chaque fond : vide, naturel indestructible, tronc naturel ou construction du joueur. Les fonds naturels sont dérivés du générateur, sans remplissage de la sauvegarde; une édition d'air explicite conserve la récolte d'un tronc même après reconstruction et nouveau minage. `GameSession.place` exige une case libre, un support cardinal sur le même plan ou un bloc de l'autre plan dans la même case, et vérifie les ressources avant mutation. Le support n'est pas réévalué après la pose. L'arrière-plan ne participe ni aux collisions ni à l'occlusion lumineuse.

`WorldScene` dessine les deux plans aux mêmes coordonnées, l'arrière-plan sous le premier plan. Un second atlas ramène chaque composante RVB à 70 % tout en conservant l'alpha; seuls les troncs naturels utilisent l'atlas non assombri. Les blocs posés en bois utilisent l'atlas sombre, même à l'emplacement d'un ancien tronc. Les textures et caches des deux plans suivent le chargement et l'éviction des chunks.

`rendering/blockTextures.drawBlockTexture` dessine chaque tuile 32 × 32 de l'atlas du monde. `drawItemTexture` réutilise ce dessin pour les blocs et dessine les ressources sans bloc; `itemIconUrl` partage leurs icônes avec les objets déposés, le sac, les raccourcis et l'aperçu. Les rotations et l'assombrissement d'aperçu restent appliqués par l'interface. La pioche utilise la même image dédiée dans le monde et l'interface.

`MiningHold` accumule uniquement le temps de maintien sur une même cible : un impact toutes les 250 ms, sans impact immédiat. Relâchement, changement de case ou de plan ciblé, nouveau geste, pause, panneau ou pincement réinitialisent ce compteur. `GameSession.getMiningPlane` choisit le premier plan si la case visée contient un bloc, sinon l'arrière-plan. `getMiningTarget` parcourt ensuite les cellules du segment entre le centre réel du personnage et celui de cette case, dans l'ordre des intersections avec la grille (DDA). Il retient le premier bloc du même plan, ignore les fonds d'arrière-plan non minables et vérifie les deux cellules latérales lors d'un passage exact par un coin pour éviter de miner à travers une diagonale fermée. La case visée doit être à portée avant de parcourir le rayon. `mine` et `WorldScene` partagent cette cible effective pour les impacts, le maintien, le cadre de sélection, les messages de durabilité et le redessin du chunk modifié. Le plan de construction mémorisé par le raccourci n'intervient pas dans le minage. `GameSession.mine` applique la puissance de l'outil sélectionné, ou 1 à mains nues, conserve les dégâts par plan et cellule et ne retire le bloc/ne donne le butin qu'à épuisement de sa durabilité. La pioche en pierre inflige 2 dégâts et perd 1 point par impact réussi; le dernier coup est appliqué avant sa casse à zéro. Un échec n'use pas l'outil. Le fond naturel ordinaire ignore le minage silencieusement; les troncs naturels et les constructions du joueur restent récoltables sur le plan ciblé. Les fissures sont dérivées du ratio dégâts/durabilité et dessinées sur leur plan, sous le premier plan pour l'arrière-plan.

`GameSession.grantResources` vérifie le Mode créatif et une quantité entière positive avant toute mutation. Le menu DEV ne fait qu'appeler cette commande : masquer le bouton n'est pas l'unique garde. Le rangement respecte les 24 piles partagées et signale les ajouts partiels. Le Mode créatif ne change pas les règles de minage ou de placement.

L'inventaire stocke les matériaux sous forme de totaux et les exemplaires non empilables dans `tools`. `ItemStack` distingue les matériaux des outils, qui portent chacun `quantity: 1` et leur propre `durability`. Les deux catégories partagent 24 emplacements; les 10 raccourcis contiennent chacun une pile distincte, un outil ou `null`. `addItems` et `availableItemSpace` acceptent les raccourcis pour calculer la capacité et remplir d'abord leurs piles correspondantes, puis l'inventaire, sans utiliser les raccourcis vides. Minage, ramassage et production partagent ce rangement; les transferts explicites et le menu DEV conservent leur destination inventaire. Les transferts et le remplacement d'une pile sont atomiques : l'ancienne pile doit tenir dans l'inventaire après retrait de la nouvelle. Deux piles du même matériau fusionnent jusqu'à 99 et leur surplus retourne dans l'inventaire; les outils sont échangés sans fusion et conservent leur durabilité; le transfert est refusé sans perte si le surplus ne tient pas. L'interface n'autorise ces transferts que panneau ouvert et vérifie que la pile source n'a pas changé pendant le geste; souris, tactile et sélection en deux étapes utilisent les mêmes commandes. Inventaire ouvert, le dépôt utilise cette sélection explicite (sac ou raccourci), et non `selectedSlot`; `GameSession.dropStack` partage les validations et la création du dépôt avec `dropSelectedItem`, utilisé inventaire fermé. Le dépôt d'un outil conserve sa durabilité. La variable CSS `--hotbar-slot` définit la même taille de vignette pour le sac, les raccourcis de l'inventaire et la barre en jeu, selon les mêmes points de rupture. Pose, dépôt et réservation de matériaux vident un raccourci dès que sa quantité atteint zéro. Chaque emplacement garde son choix de plan de construction indépendamment de sa pile; les mains nues et les outils ne peuvent pas le modifier. Les restrictions du catalogue ramènent automatiquement une torche ou une échelle au premier plan. Les contrôles DOM communs au-dessus de chaque barre agissent sur la sélection courante, avec un aperçu orienté et assombri selon le plan, ou des mains pour une sélection vide.

`Recipes` définit rendement, ingrédients et durée par objet. `GameSession.startCraft` valide la quantité et réserve tous les ingrédients, d'abord dans l'inventaire puis dans les raccourcis, après simulation de la capacité du résultat dans l'inventaire et les piles correspondantes des raccourcis après consommation. Chaque objet est ensuite produit séparément à pas fixe; si les deux espaces se remplissent entre-temps, le travail reste en attente et reprend dès qu'une place se libère dans l'un des deux. L'état et la progression sont sauvegardés, la simulation s'arrête en pause et hors jeu; l'annulation d'un lot n'est pas encore implémentée. Les escaliers en bois et pierre sont des blocs minables à quatre marches; les collisions du joueur et la validation de sauvegarde partagent leur géométrie et leur rotation.

Le slider de fabrication limite les nouvelles sélections à `MAX_CRAFT_SELECTION` (99 objets), avec un pas égal au rendement de la recette. `clampCraftQuantity` ramène la sélection au nombre de lots complets permis par les ressources cumulées du sac et des raccourcis; le HUD réévalue cette limite à chaque rafraîchissement et avant le lancement. Sans ingrédients suffisants, la sélection est à zéro et les contrôles de fabrication sont désactivés. Cette limite d'interface ne modifie ni `MAX_CRAFT_QUANTITY` ni les lots déjà sauvegardés, qui peuvent dépasser 99 et continuent à afficher leur quantité réelle.

`WorldClock` déduit la phase et l'intensité solaire du tick persistant, sans avancement en pause. `LightField` calcule le soleil direct et diffus, puis les torches, sur la zone visible augmentée d'une marge de 10 cellules. Le soleil conserve sa diffusion cardinale; les sources locales utilisent la distance euclidienne et des rayons traversant la grille pour l'occlusion, avec contrôle des coins entre blocs opaques. Chaque source porte une position et une portée en blocs : une torche a une portée de 10, une intensité de 100 % jusqu'à 75 % de sa portée, puis une décroissance linéaire vers zéro à sa limite. Les faces opaques reçoivent la lumière sans la transmettre et les matériaux partiellement opaques atténuent les rayons. `WorldModel.foregroundRevision` invalide le champ statique après une modification réelle du premier plan, y compris aux frontières de chunks; une modification d'arrière-plan ne le recalcule pas. Une torche sélectionnée ajoute un champ temporaire centré sur le personnage; sa position exacte et sa sélection invalident le rendu sans recalculer le soleil et les sources fixes. Ce champ ne modifie pas le cache statique et disparaît à la sélection d'un autre objet. Le masque utilise des `Graphics` compatibles WebGL et Canvas; la qualité économique quantifie davantage la lumière et supprime la teinte chaude, sans modifier le champ ni la physique. Les mesures sur appareils réels restent nécessaires.

Les torches sont des blocs non solides persistés dans les éditions, et des ressources ordinaires dans l'inventaire et les dépôts. Le catalogue actuel comprend torches, échelles, escaliers en bois ou pierre et la pioche en pierre (1 bois + 1 pierre, 180 ticks par outil). Le catalogue `TOOLS` réserve la catégorie `tools`, les propriétés de durabilité et la puissance de minage; cette catégorie ne peut ni s'empiler, ni être posée, ni pivoter, mais se dépose au sol. L'icône pixel art 32×32 (fond transparent, recréée d'après le dessin fourni) est chargée depuis `public/assets/stone-pickaxe.png` et partagée par le HUD et les dépôts. Les stations et les autres recettes restent à réaliser.

Autosauvegarde toutes les cinq secondes, sauvegarde en pause et avant retour au menu. Les erreurs sont affichées et une autosauvegarde échouée peut être relancée manuellement. Aucun temps de jeu n'est ajouté durant la pause ou la fermeture. Le snapshot reprend l'état de la dernière écriture réussie, pas des actions postérieures à celle-ci.

Le jeu est une PWA installable depuis Chromium. `vite-plugin-pwa` génère `manifest.webmanifest` (`display: fullscreen` avec repli `standalone`, `orientation: any`, `start_url` et `scope` alignés sur la base Vite) et un service worker Workbox qui précache tout le build : HTML, bundle Phaser, CSS, icônes et images. Le jeu fonctionne donc hors ligne après le premier chargement; les sauvegardes restent dans IndexedDB, hors du cache. Les icônes de `public/icons/` sont produites par `scripts/generate-icons.mjs`, qui agrandit la pioche 32×32 sans lissage. Le module `src/pwa/` reste indépendant du domaine : `registerPwa` enregistre le service worker en mode `prompt` (vérification horaire); `Application` affiche alors une bannière, sauvegarde la partie active, puis active la nouvelle version et recharge. `InstallPrompt` conserve l'événement `beforeinstallprompt` pour le bouton **Installer l'application**. `orientation` mémorise dans `localStorage` un choix propre à l'appareil (automatique, paysage ou portrait) et l'applique avec `screen.orientation.lock`, au démarrage et à chaque entrée en plein écran. Si le navigateur refuse, le jeu suit l'orientation de l'appareil et `Phaser.Scale.RESIZE` adapte le canvas.

Le reste de ce document décrit l'architecture cible : sauvegardes multiples, copie de récupération, migrations entre futurs schémas, commandes PNJ, stations d'artisanat et combat ne sont pas encore implémentés.

## Principes

- **Domaine séparé du rendu** : Phaser affiche et relaie les entrées; les règles de monde, inventaire, craft, combat et ordres restent testables sans scène Phaser.
- **Données avant branches de code** : blocs, items, recettes, biomes, monstres et difficulté sont définis par des catalogues typés et validés au chargement.
- **Simulation déterministe** : seed, version du générateur et état RNG explicite; ne jamais dépendre de l’ordre de chargement des chunks.
- **Chargement progressif** : le monde persistant existe indépendamment des chunks actuellement matérialisés à l’écran.
- **Offline-first** : aucun service backend requis; IndexedDB est la source de sauvegarde.
- **Mesurer avant optimiser** : budgets et télémétrie de développement avant pooling ou workers prématurés.

## Stack proposée

- **Phaser 3** pour rendu 2D, scène, caméra, input de bas niveau et audio.
- **TypeScript strict** pour modèles et interfaces de modules; ne pas transformer chaque donnée de contenu en classe.
- **Vite** pour serveur de développement et bundle statique; build configuré pour le sous-chemin d’un dépôt GitHub Pages.
- **IndexedDB** pour les sauvegardes. Une petite couche repository encapsule les transactions; le moteur de stockage ne fuit pas dans les systèmes de jeu.
- **Tests** : logique pure testée unitairement, tests de contrats de sérialisation/génération, puis smoke test navigateur sur la build.

Le déplacement actuel utilise un contrôleur 2D à pas fixe et des collisions sur grille, sans moteur physique tiers. Le conserver tant qu'il répond aux besoins; comparer Phaser Arcade Physics uniquement avec des scénarios concrets de plateforme, saut et échelle. Aucune bibliothèque de pathfinding n'est encore choisie.

## Arborescence cible

```text
src/
├── main.ts
├── game/
│   ├── Game.ts
│   └── config/
├── core/                 # horloge, événements, identifiants, RNG, commandes
├── world/                # WorldModel, coordonnées, règles de modifications
├── generation/           # seed, terrain, biomes, cavernes, structures
├── chunks/               # ChunkStore, streaming, cache et état modifié
├── entities/             # composants/modèles communs
├── player/               # contrôleur, état, réapparition
├── npc/                  # recrutement, ordres, rôles
├── animals/
├── monsters/
├── combat/
├── inventory/            # piles, conteneurs, barre rapide
├── crafting/             # recettes, stations, progression
├── building/             # prévisualisation, validation, placement
├── rendering/            # atlas, couches 2D, chunks et parallaxe
├── lighting/             # sources, occlusion et carte de lumière
├── weather/
├── trading/
├── ai/                   # tâches, comportements, navigation
├── save/                 # schémas, migrations, repositories IndexedDB
├── input/                # clavier, souris, tactile, mapping configurable
├── ui/                   # HUD, menus et overlays accessibles
├── pwa/                  # service worker, installation, orientation
├── scenes/               # adaptateurs/scènes Phaser minces
├── assets/               # code de références/chargement d’assets
└── config/               # catalogues et paramètres typés

assets/
└── LICENSE               # ressources originales sous CC BY-NC-SA 4.0
public/
└── assets/               # éventuelles copies servies, avec leurs notices de licence
docs/
└── ...
```

Les tranches actuelles instancient `game`, `world`, `generation`, `player`, `inventory`, `lighting`, `rendering`, `input`, `save`, `ui`, `pwa` et `scenes`; créer les autres domaines au fur et à mesure qu'un incrément les utilise. Les ressources originales placées dans `assets/` relèvent de la licence CC BY-NC-SA 4.0; leurs éventuelles copies servies conservent cette licence et leurs mentions d'attribution. Le code et la documentation sont sous MIT; les composants tiers gardent leurs propres licences.

## Responsabilités principales

| Élément | Responsabilité | Ne doit pas |
|---|---|---|
| `Game` / scène Phaser | Créer jeu, caméra, surface de rendu et cycle de vie | Porter les règles de craft ou de monde |
| `GameSession` | Orchestrer horloge, systèmes, commandes et cycle de vie d’une partie | Connaître les détails DOM du HUD |
| `WorldModel` | Exposer lecture/écriture des cellules, seed et version de génération | Dépendre de Phaser |
| `ChunkManager` | Calculer région active, charger/décharger et signaler changements | Être l’autorité de persistance |
| `WorldGenerator` | Produire données pures d’un chunk depuis seed/coordonnées/version | Lire l’état global aléatoire |
| `EntityStore` | Identifiants et états sérialisables d’entités | Contenir objets graphiques Phaser |
| `CommandBus` | Valider/dispatcher ordres joueurs et tâches colonie | Modifier directement un canvas |
| `InventoryService` / `CraftingService` | Valider transactions d’items et recettes | Implémenter l’interface des menus |
| `SaveRepository` | Lire/écrire des enregistrements versionnés en transaction | Sérialiser des instances Phaser |
| `InputRouter` | Normaliser clavier/souris/tactile en commandes de jeu | Être lu directement par tous les systèmes |

Utiliser des événements de domaine ciblés (par exemple `TileChanged`, `ItemStackChanged`, `OrderStatusChanged`) pour mettre à jour les vues; éviter un bus global non typé.

## Modèles de données

Modèles indicatifs, à valider au moment d’implémenter chaque système :

```ts
type ItemId = string;
type EntityId = string;

interface ItemStack {
  itemId: ItemId;
  quantity: number;
}

interface ChunkCoord {
  x: number;
  y: number;
}

interface WorldHeader {
  worldId: string;
  seed: string;
  generatorVersion: number;
  saveSchemaVersion: number;
  simulationTick: number;
}

interface NpcOrder {
  id: string;
  kind: "mine" | "harvest" | "build" | "transport" | "defend" | "follow";
  target: { x: number; y: number };
  priority: number;
  status: "queued" | "active" | "blocked" | "complete" | "cancelled";
  assignedEntityIds: EntityId[];
}
```

Un chunk contient des cellules générées et un overlay de modifications du joueur; il ne stocke pas de sprites. Un item est défini dans un catalogue (identifiant stable, catégorie, empilabilité, limites, tags), une recette référence des identifiants et une station requise. Les données sauvegardées référencent ces identifiants, jamais des copies de définitions.

## Monde, génération et streaming

- **Grille** : coordonnées de cellules entières; prévoir explicitement les coordonnées négatives (division/plancher cohérente). Les chunks actuels font **32 × 32 cellules** et chaque cellule occupe 16 unités logiques, soit 512 × 512 unités par chunk. La cible artistique est une tuile source de **32 × 32 pixels** par cellule; distinguer résolution de texture et coordonnées du monde.
- **Étendue** : viser un monde infini horizontalement par génération à la demande, sous réserve des limites inhérentes aux coordonnées numériques. Le prototype est actuellement limité à ±1 000 000 cellules sur X et à 96 cellules de hauteur; ses limites numériques et sa profondeur restent à faire évoluer explicitement, plutôt que de le présenter comme littéralement infini.
- **Déterminisme** : `generateChunk(seed, generatorVersion, coord)` utilise un RNG dérivé de la seed et des coordonnées. Les biomes résultent d’un champ à grande échelle; cavernes/minerais/structures sont décidés avec des sous-graines stables.
- **État** : séparer les cellules de base générées, l’overlay modifié et les entités du monde. Le chunk est dirty lorsque son overlay ou contenu persistant change.
- **Streaming** : charger autour de la caméra/joueur avec hystérésis, puis décharger hors rayon; ne garder en scène que la région active. Recommandation à profiler : 3×3 chunks près du joueur, extension à 5×3 si mémoire et mobile le permettent.
- **Structures** : dériver leurs identifiants et emplacements de seed/coordonnées afin qu’une frontière de chunk ne génère pas deux fois un même village ou donjon. Les structures multi-chunks sont découpées en contributions idempotentes. Un grand objet peut être constitué de cellules de matériaux différents : bois, branches et feuilles pour un arbre, par exemple. Propriétés, interactions et modifications restent attachées aux cellules; ne pas supposer de chute ou de disparition automatique des autres cellules sans règle de gameplay définie.
- **Rendu** : agréger le terrain en couches de tuiles par chunk; overlays de sélection, dégâts et objets interactifs distincts. Limiter les objets Phaser à ceux nécessitant animation/interactivité.

Ne pas générer par « prochain nombre aléatoire » global : l’ordre de chargement des chunks doit être sans effet sur la carte.

## Rendu 2D, parallaxe et éclairage

- Prévoir des couches distinctes pour le ciel, les paysages en parallaxe, les murs d'arrière-plan, les blocs interactifs, les entités, le premier plan décoratif et l'interface. Les décors de parallaxe n'ajoutent pas de collisions et ne requièrent pas de 3D.
- Charger des atlas de tuiles 32 × 32 avec filtrage nearest-neighbor; vérifier espacements et bords. À la taille de référence, le pipeline doit préserver les 32 pixels sources au lieu de les réduire d'abord à 16 avant agrandissement. Garder le zoom/pincement actuel et tester les échelles fractionnaires ainsi que la lisibilité sur différents écrans.
- L'heure du monde pilote la lumière ambiante; les torches et autres sources alimentent une lumière locale. Les matériaux possèdent une opacité : un bloc peut arrêter ou atténuer la lumière. Recalculer les régions affectées lorsqu'un bloc ou une source change, y compris aux frontières de chunks.
- Prototyper une carte de lumière 2D par cellules ou régions actives, puis comparer les solutions de masque et de rendu sur appareils réels. Le pipeline Phaser `Light2D`, uniquement WebGL, peut dessiner des lumières mais ne calcule pas à lui seul l'occlusion par le terrain; il ne s'applique pas aux objets `Graphics` et son nombre de lumières est limité par la configuration.
- Prévoir des niveaux de qualité et un rendu lisible lorsque WebGL est indisponible : simplifier la finesse de la lumière et des effets, tout en conservant la cohérence de l'occlusion et les mêmes règles de physique/interactions.

## Simulation, entités et IA

Le domaine expose des états sérialisables, pas des instances Phaser. Pour une première version, un registre d’entités typé avec systèmes de mise à jour par lot est plus simple à maintenir qu’un framework ECS générique. Extraire un ECS seulement si le profilage et la complexité des compositions le justifient.

- `SimulationClock` avance à pas fixe pour les règles et le combat; le rendu interpole si nécessaire. Suspendre ou réduire la simulation quand l’onglet est masqué, sans faire avancer arbitrairement des jours entiers au retour.
- PNJ : ordre du joueur → planificateur de tâches (priorité, portée, outils, accessibilité) → état actif/raison de blocage → progression → résultat. Les ordres doivent pouvoir être annulés et réassignés.
- Monstres : machine à états limitée (veille, poursuite, attaque, retour) avec perception et cadence de décision plafonnées.
- Animaux : comportements simples (errance, suivre, rester, production) et ordres distincts des PNJ.
- Pathfinding : A* sur grille locale pour le MVP, calcul plafonné par frame et invalidation ciblée à la modification du terrain. Ajouter une hiérarchie de portails entre chunks ou un worker si les profils montrent des pics; éviter un A* illimité par acteur à chaque frame.
- Comportements et statistiques viennent de données; les transitions importantes restent du code typé et testable.

## Temps, météo et combat

Un `WorldClock` piloté par ticks fournit phase du jour et événements. Les systèmes d’apparition consultent difficulté, biome, lumière, distance aux zones protégées et plafond global d’ennemis. La météo cible ciel clair, pluie, neige et orage, avec un état sauvegardable; elle influence d’abord ambiance, particules et audio. Les effets de gameplay restent une décision ultérieure et une extension de données distincte. Séparer dégâts, résistances, cooldowns et drops des animations.

## Entrées et interface

Les adaptateurs clavier/souris/tactile produisent les mêmes commandes sémantiques (`Move`, `Jump`, `Mine`, `Place`, `Interact`, `SelectSlot`, `Zoom`). Un profil de contrôles configurable mappe périphérique → commande. Le maintien d’une action répète avec cadence et portée validées côté domaine; le pincement fournit un delta de zoom, sans construire des gestes spécifiques à un système de jeu.

Le HUD est en overlays Phaser ou DOM selon les besoins d’accessibilité; décider par composant, pas globalement. Les menus, inventaire, configuration de difficulté et commerce partagent des composants de sélection et une navigation clavier/tactile.

## Sauvegarde et reprise

- IndexedDB, base versionnée par partie; tables/logical stores pour en-tête, chunks dirty, entités et progression.
- En-tête : identifiant, seed, versions de sauvegarde et générateur, tick, emplacement de réapparition.
- Sauvegarder overlay des chunks, joueur, inventaire, constructions, état et ordres des PNJ, animaux apprivoisés, météo, progression et RNG déterministe nécessaire.
- Autosave sur dirty state avec debounce, transaction cohérente par lot et indicateur d’état; sauvegarde explicite aux transitions importantes. `pagehide` n’est qu’une dernière tentative, jamais l’unique stratégie.
- À l’ouverture : valider schéma, appliquer migrations successives, détecter version générateur, puis reconstruire l’état dérivé. Les textures, chemins calculés et objets de rendu sont reconstruits, non sauvegardés.
- Erreurs de quota/corruption présentées au joueur; proposer une copie/export de sauvegarde avant migration destructive. Garder un emplacement de récupération précédent jusqu’à validation de l’écriture.
- La résolution artistique 32 × 32 ne doit pas modifier à elle seule les coordonnées enregistrées. Si les unités évoluent, migrer explicitement les positions, vitesses et autres données concernées; tester reprise IndexedDB ainsi qu'export/import.
- Pour ajouter grottes ou structures à la génération, conserver le générateur v1 des mondes existants ou fournir une migration validée. Ne jamais régénérer silencieusement une ancienne seed avec de nouvelles règles; étendre le schéma versionné quand temps, météo et entités deviennent persistants.

La promesse « reprendre exactement » exige de tester les ticks, RNG, ordre des systèmes et migrations; elle n’est pas garantie par le simple choix d’IndexedDB.

## Performances et budgets de départ

- Cibles initiales à confirmer : 60 FPS sur appareils récents et au moins 30 FPS sur mobile modeste; choisir des appareils de référence et mesurer le temps de frame ainsi que son 95e percentile.
- Culling par caméra et activation par chunks; limiter les animations et particules hors écran.
- Atlases d’images, nearest-neighbor et tailles de texture adaptées aux limites GPU; ne pas conserver plusieurs copies de tuiles sous forme d’objets individuels.
- Mettre à jour uniquement les chunks dirty; garder les collisions simples et ne recalculer la navigation que localement.
- Réduire fréquences de décision IA loin de la caméra; plafond d’entités actif configurable.
- Pooling uniquement si allocations/GC mesurés comme problème; workers pour génération/navigation seulement après preuve d’un blocage du thread de rendu.
- Mesurer temps de frame, mémoire, nombre de chunks visibles/actifs, entités et temps de sauvegarde. Tester sur Android/iOS de gamme basse et médiane.

Avec une texture RGBA par chunk, 32 × 32 cellules de 32 × 32 pixels produisent une texture de 1024 × 1024, soit environ 4 Mio bruts par couche et par chunk, avant copies CPU/GPU. Ce calcul est un budget indicatif, pas une mesure : comparer atlas, cache de chunks et mises à jour partielles avant de choisir.

Le bundle Phaser initial dépasse le seuil d’avertissement Vite de 500 kB (environ 1,24 MB minifié et 343 kB gzip au build de la première tranche). Suivre le temps de téléchargement/démarrage sur mobile; envisager le chargement différé et une réduction de modules seulement si les mesures l’exigent.

## Flux utilisateur

1. **Nouvelle partie** : choix seed/difficulté → création header → premier chunk → point de départ → tutoriel.
2. **Session** : HUD (santé, heure, météo, barre rapide) → action → validation domaine → événement → rendu/HUD.
3. **Ordre PNJ** : sélection → choix ordre/zone → prévisualisation portée et ressources → confirmation → suivi d’état, pause ou annulation.
4. **Construction** : sélectionner item → fantôme valide/invalide → vérifier portée, collision et coût → confirmer transaction atomique → modifier chunk et marquer dirty.
5. **Mort** : état de mort → pénalité selon difficulté → respawn valide → restauration d’équipement selon règle, sans reset de monde.
6. **Charger** : liste locale des parties → migration/validation → restaurer modèle → créer scènes et vues.
7. **Importer (MVP)** : sélectionner un fichier local → vérifier taille/JSON/schéma → confirmer le remplacement → écrire en transaction → activer Reprendre. Une erreur ou une annulation laisse la partie existante intacte.
8. **Exporter (MVP)** : lire la dernière sauvegarde validée → sérialiser le fichier JSON versionné → déclencher un téléchargement local.

## Conventions de code

- `strict` TypeScript; éviter `any`, assertions non justifiées et import circulaires.
- Noms de types/classes en PascalCase, fonctions/variables en camelCase, constantes de configuration en UPPER_SNAKE_CASE uniquement quand elles sont globales.
- Modules de domaine sans dépendance vers Phaser; dépendances orientées vers les abstractions et injectées à l’initialisation.
- Fonctions pures pour génération, calcul de coût, validation de recette et migrations.
- Entrées utilisateur validées au point de frontière; échecs de sauvegarde/chargement visibles, jamais de fallback silencieux.
- Catalogues validés au démarrage (références d’items/biomes inexistantes, doublons, limites invalides).
- Tests déterministes avec seed fixe; nommer les tests par comportement attendu.
- Documenter seulement les décisions non évidentes; petites fonctions et messages d’erreur précis.

## Risques principaux

| Risque | Conséquence | Réduction |
|---|---|---|
| Streaming de monde gourmand en mémoire | Chutes de FPS ou crash mobile | Chunk dirty, activation locale, profilage appareil réel |
| Générateur modifié après sortie de sauvegarde | Incohérences à l’exploration | `generatorVersion`, migrations et compatibilité explicite |
| Éclairage trop coûteux ou incohérent aux frontières | Torches illisibles et baisse de fluidité | Carte de lumière locale, tests d'occlusion inter-chunks et niveaux de qualité mesurés |
| Réduction involontaire des textures 32 × 32 | Perte de détails malgré le nouvel atlas | Séparer résolution des assets et unités logiques; captures aux zooms de référence |
| Ordres PNJ qui se bloquent | Perte de confiance dans la colonie | Statut/raison visible, annulation et tests de tâches |
| Gestes tactiles en conflit | Actions manquées ou zoom navigateur involontaire | Routeur d’input unifié et tests sur appareil |
| Sauvegarde partielle ou quota plein | Perte de progression | Transactions atomiques, récupération et alertes utilisateur |
| Portée MVP trop large | Jeu jamais jouable | Tranches verticales, priorités et exclusions ci-dessous |
| Dépendance excessive aux objets Phaser | Logique difficile à tester/versionner | Modèle domaine pur et scènes adaptatrices |
