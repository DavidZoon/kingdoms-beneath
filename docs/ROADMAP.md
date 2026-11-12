# Kingdoms Beneath — backlog et roadmap

Le menu d'accueil propose **Roadmap et nouveautés** : une synthèse en frise de ces jalons et les
12 derniers commits au maximum, intégrés au build pour rester consultables hors ligne.
La synthèse et ses statuts sont maintenus dans `src/ui/roadmap.ts` et doivent suivre les évolutions de ce document.
Les commits sont extraits automatiquement de Git ; ils ne comprennent pas les modifications non commitées.

## Vision cible

Un jeu de profil entièrement en **2D**, avec physique 2D et monde en blocs modifiable. La direction artistique vise des tuiles pixel art natives de **32 × 32 pixels**, une surface et des grottes détaillées, des décors en parallaxe, un éclairage dynamique et des effets météo. Les références visuelles servent de direction artistique, pas de ressources à copier.

Les grands éléments peuvent occuper plusieurs cases et combiner des matériaux : un arbre, par exemple, est composé de bois, de branches et de feuilles. La lumière doit être bloquée ou atténuée par les blocs. La vision conserve un monde infini horizontalement par génération à la demande, sous réserve des limites techniques des coordonnées. Le jeu reste mobile-first, jouable au clavier/souris et déployable sans backend.

## Jalon 0 — fondations (réalisé)

- [x] Architecture, GDD et roadmaps définis.
- [x] Projet Phaser 3 + TypeScript + Vite qui démarre.
- [x] Build statique et workflow GitHub Pages.
- [x] Contrôle de type et build reproductibles.

Le socle initial validait le pipeline, pas le gameplay.

## Tranche 01 — premier monde jouable

Implémentation : menu principal (nouvelle partie, reprise, import/export JSON), confirmation de remplacement, autosauvegarde IndexedDB, pause, terrain seedé forêt/plaine avec chunks, déplacement/saut et collisions 2D, minage et pose de terre/pierre/bois, barre rapide et contrôles clavier/souris/boutons tactiles.

Le terrain utilise maintenant un atlas procédural original 32 × 32, séparé de la grille logique de 16 unités. Le générateur v2 différencie forêt/plaine et ajoute des cavités; le v3 ajoute les fonds naturels de construction et les troncs d'arrière-plan. Les parties v1/v2 conservent leur générateur. L'escalade sur échelles, l'inventaire en piles et les objets au sol sont disponibles. Le prototype actuel est borné verticalement et horizontalement; l'extension horizontale du monde reste une cible.

**Minage et outils de développement livrés :** durabilité par matériau, maintien avec impacts toutes les 0,25 seconde, fissures partant du centre et dégâts partiels persistants. Le Mode créatif se règle par partie et ouvre un menu DEV d'ajout de ressources, sans dépasser la capacité de l'inventaire. Le schéma v3 migre les sauvegardes v1/v2. Les futurs outils plus efficaces restent dans la progression P1; le domaine accepte déjà une puissance de minage par impact.

## Tranche 02 — profondeur et lumière

Première version jouable : couches de paysage et forêt en parallaxe, premier plan décoratif et fond souterrain; cycle jour/nuit dérivé du tick; torches plaçables et récupérables; lumière du soleil et des torches propagée par cases avec occlusion par matériau. La qualité économique réduit la finesse du masque sur mobile sans changer les règles d'occlusion. Quatre torches sont fournies aux nouvelles parties et une recette limitée transforme 1 bois en 2 torches. Le schéma v4 migre les sauvegardes v1 à v3.

**Inventaire et fabrication ajoutés :** 10 raccourcis à piles déplaçables, recettes de torches, échelles et escaliers, fabrication progressive avec matériaux réservés et reprise après chargement. Les escaliers se montent et se descendent. Le schéma v5 migre les sauvegardes v1 à v4.

**Rotation et construction sur deux plans ajoutées :** rotation par quarts de tour, fusion de piles avec surplus dans l'inventaire, choix du plan par raccourci et appuis cardinaux ou sur l'autre plan. L'arrière-plan est traversable, transparent à la lumière et assombri, sauf les troncs naturels récoltables. Les fonds naturels de grotte et de sous-sol sont indestructibles. Le schéma v7 conserve plans, rotations et dégâts séparés et migre les formats précédents sans modifier leur générateur.

**Premier outil livré :** pioche en pierre non empilable, non posable, déposée et ramassée avec sa durabilité propre. Elle mine les deux plans, inflige 2 dégâts par impact et possède 500 points d'usure, affichés sur son icône. Une recette de 1 bois + 1 pierre la produit en 3 secondes. La catégorie Outils est réutilisable; le schéma v8 conserve chaque exemplaire et migre les formats précédents.

Le contenu artistique, les mesures sur appareils mobiles réels et la météo restent à approfondir. Ce catalogue n'est pas le système complet d'artisanat; les stations, PNJ, santé, combat et menaces nocturnes restent à réaliser.

Les éléments ci-dessous restent les critères de sortie du **MVP complet**; une tranche implémentée ne signifie pas que l'ensemble de la ligne est terminé.

## Étapes visuelles et techniques

Ces étapes complètent le backlog de gameplay ci-dessous. Elles doivent produire des tranches jouables et sauvegardables, plutôt que repousser tout le gameplay jusqu'à la fin du travail artistique.

1. **Charte artistique et scène de référence — MVP, P0.** Définir palette, contraste et style de blocs 32 × 32; créer une petite scène de forêt et de grotte avec un personnage et une torche. Vérifier la lisibilité sur PC et téléphone avant d'étendre les assets. Les ressources doivent être originales ou utilisées avec autorisation et attribution.
2. **Atlas et rendu 32 × 32 — MVP, P0.** Séparer la résolution des tuiles des unités logiques du monde; conserver si possible les unités existantes pour préserver les parties. Créer un atlas avec variantes et bords, rendu nearest-neighbor et gestion des chunks. **Critère :** à la taille de référence, les 32 pixels sources restent visibles et les blocs sont toujours minables et plaçables.
3. **Monde et objets multi-cases — MVP, P0–P1.** Consolider les collisions 2D, l'escalade et les couches souterraines; générer les grottes de façon déterministe. Modéliser les grands objets comme des ensembles de cases et matériaux distincts, y compris aux frontières de chunks. **Critère :** un arbre partiellement miné et une construction multi-matériaux restent cohérents après déchargement et reprise.
4. **Parallaxe et profondeur — MVP, P1.** Ajouter ciel, montagnes, forêt lointaine et premier plan sur des couches 2D distinctes, puis adapter le décor au passage surface/grotte. **Critère :** les plans défilent à des vitesses différentes sans coutures et les décors non interactifs ne gênent ni ciblage ni déplacement.
5. **Cycle lumineux et occlusion — MVP, P1.** Ajouter l'éclairage ambiant jour/nuit et des torches, puis choisir une technique 2D après prototype. **Critère :** dans une grotte, un mur bloque ou atténue la lumière d'une torche et la modification du mur actualise l'éclairage, y compris entre deux chunks.
6. **Météo et ambiance — prototype MVP, ensemble V1.** Introduire une pluie simple, puis ciel clair, pluie, neige et orage avec effets visuels et sonores; prévoir un état sauvegardable et des réglages d'intensité. Les effets de gameplay restent une décision ultérieure.
7. **Tranche de gameplay intégrée — MVP, P1.** Faire fonctionner ensemble forêt, grotte, construction, torche, ressources, craft, deux mineurs et première nuit. **Critère :** le parcours MVP peut être joué, sauvegardé, exporté puis repris, même si les graphismes ne sont pas encore aussi détaillés que les références.
8. **Contenu et interface — V1.** Enrichir les six biomes, les bâtiments et les animations; rapprocher progressivement le menu, la carte, les objectifs et le HUD de la référence, sans retirer l'import/export ni compromettre la lisibilité tactile.
9. **Polissage et extensibilité — V2–V3.** Affiner transitions, effets et eau décorative après profilage; améliorer les outils de contenu et la compatibilité des versions. Une simulation complète des liquides, la 3D et un backend ne sont pas requis pour cette cible visuelle.

## MVP jouable — ordre de réalisation

Livrer de petites tranches intégrées. Chaque tranche reste jouable et sauvegardable avant d’ajouter la suivante.

| Priorité | Tranche | Résultat et critères de sortie |
|---|---|---|
| P0 | Menu principal et fichiers de sauvegarde | Nouvelle partie, reprise de la partie locale, import/export JSON, validation des versions, confirmation avant remplacement et erreurs visibles |
| P0 | Sauvegarde/reprise | Autosave IndexedDB et import/export opérationnels dès la première tranche; préserver les parties v1 et ajouter des migrations testées au fil des systèmes |
| P0 | Boucle d’application, scènes et contrôles | Pause, HUD, input clavier/souris et tactile routés vers des commandes communes |
| P0 | Direction artistique et rendu | Charte et atlas 32 × 32, grille logique distincte du rendu, scène de référence et tests de lisibilité |
| P0 | Monde seedé et streaming | Surface/couches, chunks, au moins forêt/plaine, chargement/déchargement déterministes et frontières correctement coordonnées |
| P0 | Joueur et interactions | Marcher, courir, sauter, grimper, collision, caméra, minage maintenu par impacts de 0,25 s, durabilité par matériau et fissures progressives |
| P0 | Blocs et inventaire | Terre/pierre/bois, destruction/placement validés, objets multi-cases et multi-matériaux, 24 piles, barre de 10 raccourcis et objets déposés |
| P0 | Mode créatif / DEV | Option par partie désactivée par défaut, menu DEV conditionnel, ajout de ressources validé et sauvegardé |
| P1 | Profondeur et lumière | Première version jouable : grottes v2, parallaxe, cycle, torches et occlusion avec qualité économique; enrichissement et profilage sur mobiles réels à poursuivre |
| P1 | Construction et craft | Fabrication progressive de torches, échelles et escaliers disponible; abri de bois, établi/four/forge et autres recettes à réaliser |
| P1 | Cycle, combat et première nuit | Quatre phases du jour, santé, respawn, zombies, vagues plafonnées, dégâts et difficulté ajustables |
| P1 | PNJ et ordres | Rencontrer/recruter deux mineurs, affecter zone, extraire une ressource et visualiser blocage/annulation |
| P1 | Progression minière | Charbon/cuivre/fer/or, découverte du fer et outils premiers niveaux; pioches et autres équipements augmentant l'efficacité du minage |
| P1 | Robustesse mobile | Interface tactile responsive, zoom/pincement, contrôles configurables et test appareils réels |
| P2 | Finition MVP | Prototype de pluie, équilibrage du parcours de 30 min, tutoriel, options d’accessibilité, audio/FX, tests de régression et performance |

**Critère de sortie MVP** : une nouvelle partie peut être créée depuis le menu principal, progression visée en environ 30 minutes atteignable (base bois, torches, deux mineurs, fer, outils et première horde), sauvegardée puis reprise, y compris après export/import d'un fichier local; les commandes principales fonctionnent au tactile et au clavier/souris. Une première forêt et une grotte utilisent le rendu 32 × 32, des plans en parallaxe et une lumière de torche tenant compte des blocs; un prototype de pluie est réglable et son état sauvegardable. Le joueur ne subit jamais de mort permanente; la mort permanente des PNJ reste un risque de gestion lisible.

## V1 — colonie et contenu

- Compléter les six biomes, les cavernes et les filons, puis ajouter trésors, donjons et villages avec génération contrôlée et sauvegarde stable.
- Compléter les rôles villageois/marchands et ordres de transport, construction, défense et suivi.
- Ajouter commerce achat/vente, équipement, animaux apprivoisables et hébergement de base.
- Compléter ciel clair, pluie, neige et orage visuels et sonores; garder les effets de gameplay pour une décision ultérieure.
- Ajouter objets constructibles manquants (portes, fenêtres, toits et autres variantes d'échelles ou d'escaliers) et recettes de progression.
- Enrichir les tuiles, décors en parallaxe, animations et éclairages multi-sources; adapter le menu, la carte, les objectifs et le HUD aux appareils tactiles.
- Proposer sauvegardes multiples et réglages détaillés de difficulté; conserver la compatibilité des fichiers import/export déjà disponibles au MVP.

## V2 — profondeur et extensibilité

- Reproduction/élevage, production animale, montures ou transport selon retours de jeu.
- Systèmes de défense plus riches, variantes d’ennemis, structures rares et événements météo.
- Optimiser génération/navigation dans workers si le profilage mobile le justifie; budgets de population et d’effets réglables.
- Outils internes de validation de catalogues, visualisation de chunks/IA et équilibrage de contenu.
- Localisation, remappage complet, options d’accessibilité et sauvegardes testées sur versions de schéma successives.
- Affiner transitions, effets de matériaux, eau décorative et ambiance après mesures; améliorer les niveaux de qualité graphique pour mobile.

## V3 — long terme

- Outils de création/extension de contenu fondés sur des catalogues documentés et versionnés.
- Partage de seeds, scénarios et sauvegardes; compatibilité et validation des imports non fiables.
- Événements et biomes additionnels, personnalisation de colonie et modes de difficulté avancés.
- Consolider la chaîne de production des ressources, l'extensibilité des biomes et la compatibilité des sauvegardes à mesure que le contenu évolue.
- Évaluer seulement sur demande et après validation des fondations : coopération en ligne ou synchronisation distante. Aucun backend ni multijoueur n’est requis par le périmètre actuel.

## Garde-fous et vérification

- Préserver les sauvegardes existantes : ne pas changer les coordonnées logiques simplement pour afficher des tuiles 32 × 32. Si les unités changent, migrer les positions et vitesses; si la génération change, conserver le générateur v1 ou fournir une migration validée. Tester ensuite reprise IndexedDB et import/export des anciennes parties.
- Tester génération déterministe, coordonnées négatives, coutures entre chunks, objets multi-matériaux partiellement détruits et propagation de lumière après modification des blocs.
- Tester les interactions, le zoom, les captures de référence et les niveaux de qualité sur PC, Android et iOS. Cibles à confirmer sur des appareils de référence : 60 FPS sur matériel récent et au moins 30 FPS sur mobile modeste; mesurer le temps de frame et son 95e percentile.
- Avec une texture RGBA par chunk, 32 × 32 cases dessinées en 32 × 32 pixels représentent une texture de 1024 × 1024, soit environ 4 Mio bruts par couche et par chunk, avant copies CPU/GPU. Comparer les solutions de rendu et limiter les chunks, lumières et particules actifs selon le profilage.
- En qualité réduite ou sans WebGL, préserver la lisibilité et la cohérence de l'occlusion, tout en réduisant la finesse des effets; ne pas modifier la physique ou les interactions.

## Ordre technique recommandé

1. Définir la charte 32 × 32, les appareils de référence et les tests de compatibilité des sauvegardes existantes.
2. Séparer résolution des textures et grille logique, puis mettre en place un premier atlas et une maquette forêt/grotte.
3. Consolider physique 2D, couches de blocs, objets multi-matériaux et génération déterministe aux frontières de chunks.
4. Ajouter parallaxe, cycle jour/nuit et premier éclairage de torche bloqué ou atténué par les blocs.
5. Compléter inventaire, construction, craft, combat et respawn, puis ordres de deux mineurs et pathfinding borné.
6. Ajouter un prototype de pluie; compléter météo, biomes, faune, commerce et interface dans les jalons suivants.
7. Mesurer les performances à chaque étape et enrichir le rendu selon les résultats, sans casser les parties existantes.

Ne pas démarrer en parallèle génération infinie, IA complète, catalogue de contenu et UI finale : leur intégration prématurée rend les erreurs de données et de performance difficiles à isoler.

## Hors MVP

Multijoueur, backend/comptes, reproduction animale, besoins complexes de PNJ, éditeur intégré, modding arbitraire par scripts et simulation hors ligne prolongée. Ces sujets nécessitent décisions de produit et sécurité/compatibilité supplémentaires.
