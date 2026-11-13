# Kingdoms Beneath - (Les Royaumes enfouis)

Jeu sandbox 2D de survie et de gestion de colonie, pensé mobile-first pour les navigateurs modernes. Les premières tranches du MVP permettent d'explorer un terrain seedé et ses grottes, miner, construire et éclairer le monde, puis sauvegarder et reprendre sa partie. L'artisanat complet, les PNJ et les menaces nocturnes ne sont pas encore disponibles.

[Dépôt GitHub](https://github.com/DavidZoon/kingdoms-beneath) · [Jouer en ligne](https://davidzoon.github.io/kingdoms-beneath/)

## Démarrer

Prérequis : Node.js 22.12 ou supérieur et npm.

```sh
npm ci
npm run dev
```

Le navigateur affiche le menu principal : **Nouvelle partie**, **Reprendre**, **Importer** et **Exporter**. Vérifications disponibles :

```sh
npm run typecheck
npm test
npm run build
```

Le bouton **Roadmap et nouveautés** de l'accueil ouvre une frise des étapes réalisées, en cours et à venir,
ainsi que les 12 derniers commits au maximum. L'historique est intégré depuis le dépôt Git lors du démarrage
de Vite ou du build : il reste disponible hors ligne et se renouvelle avec la prochaine version.
Les modifications non commitées sont exclues ; les liens vers les commits et la roadmap détaillée nécessitent Internet.
La fermeture est possible avec **Fermer** ou **Échap**. Sur téléphone, les deux frises s'affichent l'une sous l'autre.
Le démarrage et le build nécessitent donc Git et un clone avec son historique.

### Sécurité des outils de développement

Les commandes `npm run dev`, `npm test`, `npm run build` et `npm run preview` définissent
`WS_NO_BUFFER_UTIL=1` avant de charger Vite ou Vitest. Elles désactivent ainsi le chargement
facultatif de `bufferutil`, y compris si la variable héritée est vide ou a une autre valeur.
Les fonctionnalités restent disponibles avec l'implémentation JavaScript de `ws`.

Un lancement direct de Vite ou Vitest contourne ce dispositif. Si vous devez lancer les outils
directement, définissez la variable dans le terminal avant leur lancement :

```powershell
$env:WS_NO_BUFFER_UTIL = '1'
```

```sh
export WS_NO_BUFFER_UTIL=1
```

Sur une machine partagée, vérifiez également que les autres comptes ne peuvent pas écrire ou créer
des dossiers `node_modules` dans les répertoires parents parcourus par Node. Faites examiner les
permissions par l'administrateur avant de les modifier : protéger un dossier de recherche partagé
peut affecter d'autres projets. Les commandes npm de ce projet ne modifient pas les ACL du système.

## Tranches jouables

- Terrain forêt/plaine déterministe, chunks chargés à la demande, personnage avec gravité et collisions.
- Déplacement A/Q/D ou flèches, saut Espace, course Maj, escalade et nage W/Z/S ou ↑/↓. En relâchant les commandes pendant l'escalade ou dans l'eau avec au moins la moitié du corps immergée, le personnage reste à sa hauteur, sauf pendant un saut.
- La caméra centre le personnage dans la zone libre entre le HUD du haut et celui du bas, y compris après un redimensionnement ou un changement de zoom. Les menus et l'inventaire restent superposés au jeu sans déplacer ce centrage.
- L'action sur une case dépend du raccourci sélectionné : vide, outil ou ressource non posable pour miner au clic gauche maintenu, bloc constructible pour poser au clic gauche. Le minage donne son premier impact après 0,25 seconde, puis un impact toutes les 0,25 seconde. Les fissures grandissent depuis le centre du bloc.
- Barre rapide de 10 piles, sélection via 1–9 et 0; inventaire (I) de 24 emplacements, piles de matériaux de 99 objets et outils individuels, dépôt (G) et ramassage à proximité.
- Grottes déterministes, fonds de construction et troncs d'arbres en arrière-plan depuis le générateur v3, bassins d'eau depuis v4. Les nouveaux mondes utilisent le générateur v5, avec ressources de forêt moins fréquentes et ressources de plaine; les anciennes parties conservent leur générateur.
- Paysage en parallaxe ancré au monde : sa hauteur ne se recale pas sur le terrain sous la caméra lors d'un saut ou d'un changement de niveau. Les plantes décoratives gardent aussi leur ancrage pendant le défilement. Tous les décors restent derrière les blocs des deux plans, les objets déposés et le personnage.
- Cycle jour/crépuscule/nuit/aube et torches dont la lumière est arrêtée ou atténuée par les matériaux. La lumière se met à jour quand le terrain change, y compris entre chunks.
- Croix directionnelle en bas à gauche; boutons **Courrir** (maintien) et **Sauter** en bas à droite. Au tactile, maintenez directement une case pour miner avec un raccourci vide ou un outil, ou touchez-la pour poser le matériau sélectionné. Il n'y a plus de boutons Miner/Poser. Le pincement zoome sans déclencher d'action à son relâchement; changer de raccourci ou épuiser la pile interrompt le geste. Le joystick configurable reste prévu au MVP.
- Pause avec Échap ou **Pause / menu**. La partie est aussi mise en pause lorsque l'onglet est masqué ou perd le focus.
- Le bouton **?** affiche ou masque l'aide des commandes, masquée par défaut. Les commandes tactiles de déplacement, course et saut sont agrandies de 20 %.

### Durabilité et Mode créatif

Chaque impact à mains nues retire 1 point de durabilité. Terre et herbe : 4 points; bûche de pin : 8; escalier en bois : 6; pierre commune et escalier en pierre : 12; branches et échelles : 3; feuilles : 1. Les autres matériaux utilisent les durabilités de leur catalogue. La roche-mère est indestructible. Les ressources ne sont récoltées qu'à la destruction complète. Relâcher le clic, changer de cible ou ouvrir un panneau interrompt le maintien : il faut à nouveau attendre 0,25 seconde, mais les dégâts déjà infligés restent sur le bloc. Ils survivent aussi au déchargement des chunks et à la sauvegarde. Un bloc replacé est neuf.

Les torches ont 2 points de durabilité. La **Pioche en pierre**, dans la catégorie **Outils**, retire 2 points au bloc par impact. Comme les mains nues, elle mine automatiquement le premier plan, ou l'arrière-plan si aucun bloc n'occupe le premier plan à la case ciblée. Elle possède 500 points de durabilité et perd 1 point par coup réussi; elle se casse et disparaît après son dernier coup. Les cibles hors de portée, vides ou protégées ne l'usent pas. Les fonds naturels ordinaires restent indestructibles.

Les outils ne sont ni empilables ni posables comme blocs; chaque exemplaire occupe un emplacement et garde sa propre durabilité pendant les transferts, dépôts au sol, ramassages et sauvegardes. Une barre sur son icône indique son état dans l'inventaire, les raccourcis, l'aperçu et au sol. L'icône de la pioche est un pixel art 32×32 à fond transparent, recréé d'après le dessin fourni. Les futures armes et pièces d'équipement pourront reprendre ce rangement individuel.

Le **Mode créatif** est désactivé par défaut. Activez-le à la création ou dans **Pause / menu → Options de la partie → Mode créatif**. Le bouton **DEV** apparaît alors dans le HUD : choisissez un objet dans la galerie, puis réglez la quantité par le curseur ou le champ numérique synchronisés pour l'ajouter à l'inventaire. Pour un objet non empilable, la quantité est verrouillée à 1. La capacité des piles reste respectée, et un ajout partiel ou impossible est signalé. Désactiver l'option masque le menu et interdit les ajouts. Cette option ne supprime ni la durabilité ni les coûts de placement.

### Matériaux et ressources de forêt

Le [catalogue des ressources](src/world/resources.ts) définit les libellés, couleurs, plans, solidité, durabilité et opacité. Seules les ressources `isBlock: true` ont un bloc posable; les autres restent des objets empilables, sans rotation ni choix de plan de construction. Sélectionner une ressource non posable permet de miner à mains nues. La bûche de pin (`pine_log`) remplace l'ancien bois (`wood`), y compris dans les recettes et les sauvegardes importées. La pierre de base s'appelle **Pierre commune**.

Les [règles par biome](src/generation/BiomeResources.ts) utilisent une probabilité de démarrer un amas **par cellule de support éligible**, et non une proportion finale du terrain. La taille demandée varie autour de `blocksblobavg` (±25 % arrondis); les bords du biome, les supports disponibles et les chevauchements peuvent réduire la taille finale. Les amas sont connectés et déterministes, y compris entre chunks. Les minerais se trouvent dans la pierre commune; le marbre apparaît dans les amas de granit. Les probabilités nulles empêchent toute apparition dans ce biome.

Dans les nouveaux mondes v5, toutes les probabilités de forêt sont réduites de 30 % par rapport à v4. Le sel, le marbre, l'argent, l'or, le nickel, le soufre et les perles sont réduits de 65 % au total. La plaine propose davantage d'herbes, fleurs et fibres, peu d'arbres et des minerais comparables à la forêt réduite. Les supports et tailles d'amas sont conservés. Exemples de probabilités par support :

| Ressource | Forêt v5 | Plaine v5 |
|---|---|---|
| Chêne | 8,4 % | 1,4 % |
| Coton | 1,05 % | 3,5 % |
| Lavande | 0,7 % | 4 % |
| Cuivre | 1,4 % | 1,4 % |
| Or | 0,035 % | 0,03 % |

Les plantes visibles (coton, baies, lavande, champignons, lianes, etc.) se cueillent en maintenant le clic ou l'appui **sur leur propre case pendant 0,25 seconde**, quel que soit le raccourci sélectionné. La cueillette ne détruit ni n'endommage le support et n'use pas l'outil. Détruire le support ne donne pas la plante. Une plante cueillie ne réapparaît pas au chargement; un support reconstruit ne recrée pas sa récolte. Résine et sève restent récoltées au minage de leur tronc naturel. Les troncs naturels restent en arrière-plan. Les poissons crus et coquillages se ramassent à proximité dans l'eau ou sur le fond des bassins; une perle peut accompagner un coquillage. Les produits animaux, dont cire et miel, sont enregistrés dans le catalogue sans provenance ni apparition pour l'instant.

L'eau est un liquide de premier plan traversable et transparent à la lumière, **non minable**. Dans un liquide, W/Z ou ↑ fait monter et S ou ↓ fait descendre; les boutons ▲/▼ offrent les mêmes commandes tactiles. La remontée normale s'arrête avec au moins la moitié du personnage immergée : l'eau ne sert pas de sol. Espace ou le bouton Sauter donne une impulsion ascendante qui peut sortir le personnage de l'eau. Sans commande verticale, le personnage flotte à sa hauteur s'il est suffisamment immergé; hors de l'eau et pendant un saut, la gravité reprend. Les obstacles solides bloquent toujours la nage. Les bassins restent statiques : écoulement et animaux ne sont pas encore implémentés.

La terre, la pierre, l'argile, le sable, le gravier et la tourbe sont solides au premier plan : le personnage peut marcher dessus, mais pas les traverser. Leurs blocs d'arrière-plan restent traversables.

### Raccourcis et rotation

Ouvrez l'inventaire pour déplacer une pile entre ses 24 emplacements et les 10 raccourcis, par glisser-déposer à la souris ou au tactile. Vous pouvez aussi sélectionner une pile puis sa destination. Une pile différente déjà présente dans le raccourci retourne dans l'inventaire; deux piles d'un même matériau fusionnent jusqu'à 99, avec le surplus dans l'inventaire. Les outils ne fusionnent jamais. Un transfert impossible faute de place est refusé sans perte. Les raccourcis ne sont réorganisables que lorsque l'inventaire est ouvert. Utiliser ou déposer le dernier objet vide son emplacement; un emplacement vide peut rester sélectionné.

Les objets empilables récoltés ou fabriqués remplissent d'abord les piles du même objet déjà présentes dans la barre de raccourcis, jusqu'à 99, puis l'inventaire. Les nouveaux outils occupent chacun un emplacement d'inventaire, sans modifier un outil déjà équipé. Aucun raccourci vide n'est rempli automatiquement. Si tout est plein, le butin reste au sol et la fabrication attend.

Les vignettes du sac et des raccourcis dans l'inventaire ont la même taille que celles de la barre en jeu, y compris sur mobile. Inventaire ouvert, sélectionnez une pile du sac ou des raccourcis, puis utilisez **Déposer** ou **G** pour en déposer un objet : cette sélection est indépendante de l'objet équipé en jeu. Inventaire fermé, **G** dépose toujours l'objet équipé.

Les icônes du sac, des raccourcis, de l'aperçu et des objets déposés utilisent le même dessin pixel art que les blocs en jeu. La pioche conserve son image dédiée. Au sol, tous les objets sont affichés à la taille d'un bloc (16×16), avec une barre de durabilité proportionnée pour les outils.

Les deux flèches de rotation et le bouton de plan sont regroupés au-dessus de la barre, à côté d'un aperçu de l'objet sélectionné. Les flèches font pivoter la pièce de 90° vers la gauche ou la droite; l'aperçu et l'icône suivent l'orientation, appliquée à la pose et conservée dans la sauvegarde. Une sélection vide affiche des mains nues; la rotation et le choix de plan sont désactivés pour les mains et les outils. La géométrie des escaliers de premier plan suit leur rotation.

### Deux plans de construction

Le bouton à deux carrés au-dessus de la barre choisit le **premier plan** ou l'**arrière-plan** pour la pose d'un matériau du raccourci sélectionné, à la souris, au tactile ou au clavier. L'aperçu d'un bloc en arrière-plan est assombri. Le choix reste associé au raccourci lorsque sa pile change ou s'épuise, mais ne s'applique pas au minage. Les torches et les échelles sont réservées au premier plan : leur bouton de plan est désactivé et, si une telle pile arrive dans un raccourci configuré en arrière-plan, celui-ci repasse automatiquement au premier plan.

La pose cible le plan choisi. Le minage cible toujours le premier plan s'il est occupé, sinon l'arrière-plan, indépendamment du choix enregistré dans le raccourci. Une nouvelle pièce doit toucher par un côté une pièce du même plan, ou disposer d'un bloc de l'autre plan à la même case; une diagonale ne suffit pas. Le support est vérifié à la pose, sans effondrement ultérieur. On peut construire en arrière-plan derrière le personnage, mais pas l'enfermer dans un bloc de premier plan. Ces règles s'appliquent aussi aux anciennes parties.

Le minage suit un rayon du centre du personnage vers le centre de la case visée. Le premier bloc rencontré sur le même plan est miné à la place du bloc visé; les obstacles de l'autre plan et les fonds d'arrière-plan indestructibles sont ignorés. Le cadre de sélection indique le bloc réellement atteint. Une fois cet obstacle retiré, le maintien continue vers le bloc suivant, avec le délai habituel avant le prochain impact. La case visée doit rester dans la portée de cinq blocs.

Les blocs d'arrière-plan sont affichés à 70 % de leur couleur, suivent exactement la même caméra que le premier plan, ne bloquent pas les personnages et laissent passer la lumière. Dans les nouveaux mondes, le fond naturel sous la surface et dans les grottes est indestructible : le miner ne produit ni fissure ni message. Les troncs naturels font exception : ils restent à leur couleur normale et sont récoltables. Pour les miner, sélectionnez un **raccourci vide ou une pioche**, puis maintenez le clic ou l'appui sur le tronc. Les troncs et les blocs d'arrière-plan construits par le joueur ne sont accessibles au minage qu'après avoir retiré le bloc de premier plan de la même case.

### Fabrication

Les recettes du volet **Recettes connues** utilisent les matériaux et temps suivants :

| Recette | Matériaux | Temps par objet |
|---|---|---|
| 2 torches | 1 bûche de pin | 1 s |
| 1 échelle | 1 bûche de pin | 1,5 s |
| 2 escaliers en bois | 1 bûche de pin | 2 s |
| 2 escaliers en pierre | 1 pierre commune | 3 s |
| 1 pioche en pierre | 1 bûche de pin + 1 pierre commune | 3 s |

Le slider sélectionne le nombre d'objets à produire, de 1 à 99 pour les recettes unitaires, ou de 2 à 98 par pas de 2 pour les torches et les escaliers. La sélection est automatiquement ramenée au maximum fabricable avec les ressources du sac et des raccourcis; ce maximum est affiché à côté de la quantité sous la forme **Max 48**. Sans les ingrédients d'une recette complète, la quantité affichée est zéro et la fabrication est désactivée. Les lots déjà sauvegardés de plus de 99 objets continuent normalement.

L'inventaire n'affiche plus le résumé des emplacements, les détails des ingrédients/temps ni les textes de progression : seules les deux barres restent visibles, avec des libellés accessibles aux lecteurs d'écran. Les avertissements de fabrication restent affichés.

La quantité désigne les objets produits et doit respecter le rendement de la recette : par exemple, les torches se fabriquent par multiples de deux. Le lot doit tenir dans l'inventaire et les places restantes des piles correspondantes des raccourcis. Les matériaux sont pris dans l'inventaire puis les raccourcis et réservés au démarrage, après vérification de la place nécessaire; une recette peut donc utiliser uniquement des matériaux de la barre. Les objets arrivent un par un, en priorité dans les piles existantes des raccourcis puis dans l'inventaire; deux barres montrent la progression de l'objet et celle du lot. Si ces espaces se remplissent entre-temps, la fabrication attend qu'une place soit libérée sans perdre les matériaux réservés. Un lot lancé ne peut pas encore être annulé. Il continue inventaire fermé, s'arrête en pause et reprend après sauvegarde et chargement, sans avancer pendant la fermeture du jeu.

Les escaliers de premier plan peuvent être posés, gravis et récupérés au minage. Dans leur orientation initiale, ils montent de gauche à droite; l'éclairage considère leur cellule comme opaque.

### Torches et lumière

Une nouvelle partie commence avec 4 torches. Les anciennes parties peuvent utiliser la recette ou le menu DEV pour en obtenir. Sélectionnez-en une dans un raccourci et posez-la comme un bloc; elle est traversable et peut être récupérée en la minant.

Le cycle dure huit minutes de simulation à 60 ticks par seconde et reste en pause avec le jeu. Une torche éclaire dans un cercle de **10 blocs de rayon** : intensité de 100 % jusqu'à 7,5 blocs, puis décroissance linéaire jusqu'à 0 % à 10 blocs. Les murs opaques bloquent les rayons et les feuilles les atténuent. Sélectionner la torche dans la barre rapide active aussi une lumière centrée sur le personnage, qui suit ses déplacements et s'éteint dès qu'un autre objet est sélectionné. Les torches posées restent allumées indépendamment de la sélection. Le soleil diffuse aussi autour des ouvertures. Dans **Pause / menu → Options de la partie**, la qualité **Économique** simplifie le rendu sans changer l'occlusion. Elle est sélectionnée par défaut pour une nouvelle partie sur un appareil dont le pointeur principal est tactile; la qualité reste modifiable et sauvegardée. Le masque fonctionne également avec le rendu Canvas lorsqu'aucun WebGL n'est disponible.

## Installer comme application

Le jeu est une PWA. Dans Chrome, Edge ou un autre navigateur Chromium, utilisez le bouton **Installer l'application** du menu principal, ou l'icône d'installation de la barre d'adresse. L'application s'ouvre en plein écran.

- **Hors ligne** : après un premier chargement en ligne, tout le jeu est mis en cache et reste jouable sans réseau. Les sauvegardes ne sont pas dans ce cache : elles restent dans IndexedDB.
- **Mises à jour** : quand une nouvelle version est publiée, le message **Nouvelle version disponible** apparaît. **Recharger** sauvegarde d'abord la partie en cours; **Plus tard** garde la version actuelle jusqu'au prochain lancement.
- **Orientation de l'écran** : dans le menu principal ou **Pause / menu → Affichage de cet appareil**, choisissez **Automatique** (l'affichage suit l'appareil), **Paysage verrouillé** ou **Portrait verrouillé**. Le choix est mémorisé sur l'appareil. Le verrouillage dépend du navigateur : il fonctionne dans l'application installée sur mobile Android, pas sur ordinateur ni dans un onglet classique.

Pour tester l'installation en local, lancez `npm run build` puis `npm run preview` : le service worker n'est pas actif avec `npm run dev`. Les icônes de `public/icons/` sont générées depuis la pioche 32×32 avec `node scripts/generate-icons.mjs`.

## Sauvegardes locales

Un emplacement IndexedDB est utilisé par navigateur/origine. Autosauvegarde toutes les cinq secondes pendant le jeu, sauvegarde manuelle en pause, et sauvegarde obligatoire avant le retour au menu.

Depuis le menu, exportez un fichier JSON pour conserver ou transférer la partie. L'import vérifie le format et les versions avant toute écriture, puis demande confirmation avant de remplacer une partie existante. Les fichiers invalides ne modifient pas la sauvegarde locale. Une erreur de stockage est affichée avec possibilité de réessayer.

Le schéma actuel est **v10** : il conserve tout le catalogue de matériaux, les ressources aquatiques ramassées et les plantes cueillies (100 000 identifiants maximum dans chaque liste). Les schémas v1 à v9 sont migrés, avec conversion de `wood` vers `pine_log` dans les anciens formats, sans modifier la version du générateur de la partie. Le nouveau profil de ressources forêt/plaine nécessite un monde v5 nouvellement créé; cueillette directe et nage fonctionnent aussi dans les mondes v4.

Limites du prototype : fichiers de 10 Mo maximum, 100 000 modifications au total sur les deux plans, 100 000 entrées de blocs endommagés, profondeur de 96 cellules et coordonnées horizontales bornées à ±1 000 000 cellules pour la sécurité numérique. Le schéma version 7 conserve les choix de plan, les rotations, les modifications et les dégâts indépendants des deux plans, ainsi que l'inventaire, la fabrication et les options. Les sauvegardes v1 à v6 sont migrées sans changer leur générateur; les plans des raccourcis sont initialisés au premier plan et les rotations v6 sont conservées. Les anciennes parties ne reçoivent pas de fond naturel supplémentaire, mais peuvent construire en arrière-plan. Pour les formats antérieurs à la barre à piles, jusqu'à une pile de chaque ancien type est placée dans la barre et le reste demeure dans l'inventaire; l'excédent v1 reste dans des piles au sol. Évitez de jouer sur plusieurs onglets simultanément : ils partagent l'emplacement local.

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy.yml` vérifie types, tests et build sur les pull requests. À chaque push sur [`main`](https://github.com/DavidZoon/kingdoms-beneath/tree/main), il publie le contenu de `dist` sur la branche [`gh-pages`](https://github.com/DavidZoon/kingdoms-beneath/tree/gh-pages). Dans **Settings > Pages**, choisir **Deploy from a branch**, puis `gh-pages` et `/ (root)`. Vite utilise le nom du dépôt `kingdoms-beneath` comme base d’URL pendant le build GitHub Actions.

Le jeu est statique et ne requiert aucun serveur applicatif.

## Documentation

- [GDD synthétique](docs/GAME_DESIGN.md)
- [Architecture technique](docs/ARCHITECTURE.md)
- [Backlog et roadmap](docs/ROADMAP.md)

## Contribuer

Ce projet est développé en famille comme projet pédagogique et ludique. Les contributions sont les bienvenues, dans le respect de l'esprit collaboratif du projet.

## Licences

- Le code source et la documentation sont sous licence [MIT](LICENSE).
- Les ressources originales du dossier `assets/` sont sous licence [CC BY-NC-SA 4.0](assets/LICENSE) : attribution, utilisation non commerciale et partage dans les mêmes conditions.
