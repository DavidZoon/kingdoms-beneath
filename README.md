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
- Déplacement A/Q/D ou flèches, saut Espace, course Maj, escalade W/Z/S ou ↑/↓ sur les échelles. En relâchant les commandes pendant l'escalade, le personnage reste sur l'échelle sans tomber.
- La caméra centre le personnage dans la zone libre entre le HUD du haut et celui du bas, y compris après un redimensionnement ou un changement de zoom. Les menus et l'inventaire restent superposés au jeu sans déplacer ce centrage.
- L'action sur une case dépend du raccourci sélectionné : vide ou outil pour miner au clic gauche maintenu, matériau pour poser au clic gauche. Le minage donne son premier impact après 0,25 seconde, puis un impact toutes les 0,25 seconde. Les fissures grandissent depuis le centre du bloc.
- Barre rapide de 10 piles, sélection via 1–9 et 0; inventaire (I) de 24 emplacements, piles de matériaux de 99 objets et outils individuels, dépôt (G) et ramassage à proximité.
- Grottes déterministes, fonds de construction et troncs d'arbres en arrière-plan pour les nouveaux mondes du générateur v3. Les parties utilisant les générateurs v1 et v2 les conservent.
- Paysage en parallaxe ancré au monde : sa hauteur ne se recale pas sur le terrain sous la caméra lors d'un saut ou d'un changement de niveau. Les plantes décoratives gardent aussi leur ancrage pendant le défilement.
- Cycle jour/crépuscule/nuit/aube et torches dont la lumière est arrêtée ou atténuée par les matériaux. La lumière se met à jour quand le terrain change, y compris entre chunks.
- Croix directionnelle en bas à gauche; boutons **Courrir** (maintien) et **Sauter** en bas à droite. Au tactile, maintenez directement une case pour miner avec un raccourci vide ou un outil, ou touchez-la pour poser le matériau sélectionné. Il n'y a plus de boutons Miner/Poser. Le pincement zoome sans déclencher d'action à son relâchement; changer de raccourci ou épuiser la pile interrompt le geste. Le joystick configurable reste prévu au MVP.
- Pause avec Échap ou **Pause / menu**. La partie est aussi mise en pause lorsque l'onglet est masqué ou perd le focus.

### Durabilité et Mode créatif

Chaque impact à mains nues retire 1 point de durabilité. Terre et herbe : 4 points; bois et escalier en bois : 6; pierre et escalier en pierre : 12; branches et échelles : 3; feuilles : 1. La roche-mère est indestructible. Les ressources ne sont récoltées qu'à la destruction complète. Relâcher le clic, changer de cible ou ouvrir un panneau interrompt le maintien : il faut à nouveau attendre 0,25 seconde, mais les dégâts déjà infligés restent sur le bloc. Ils survivent aussi au déchargement des chunks et à la sauvegarde. Un bloc replacé est neuf.

Les torches ont 2 points de durabilité. La **Pioche en pierre**, dans la catégorie **Outils**, retire 2 points au bloc par impact, sur le plan choisi. Elle possède 500 points de durabilité et perd 1 point par coup réussi; elle se casse et disparaît après son dernier coup. Les cibles hors de portée, vides ou protégées ne l'usent pas. Les fonds naturels ordinaires restent indestructibles.

Les outils ne sont ni empilables ni posables comme blocs; chaque exemplaire occupe un emplacement et garde sa propre durabilité pendant les transferts, dépôts au sol, ramassages et sauvegardes. Une barre sur son icône indique son état dans l'inventaire, les raccourcis, l'aperçu et au sol. L'icône de la pioche est un pixel art 32×32 à fond transparent, recréé d'après le dessin fourni. Les futures armes et pièces d'équipement pourront reprendre ce rangement individuel.

Le **Mode créatif** est désactivé par défaut. Activez-le à la création ou dans **Pause / menu → Options de la partie → Mode créatif**. Le bouton **DEV** apparaît alors dans le HUD : choisissez une ressource et une quantité pour l'ajouter à l'inventaire. La capacité des piles reste respectée, et un ajout partiel ou impossible est signalé. Désactiver l'option masque le menu et interdit les ajouts. Cette option ne supprime ni la durabilité ni les coûts de placement.

### Raccourcis et rotation

Ouvrez l'inventaire pour déplacer une pile entre ses 24 emplacements et les 10 raccourcis, par glisser-déposer à la souris ou au tactile. Vous pouvez aussi sélectionner une pile puis sa destination. Une pile différente déjà présente dans le raccourci retourne dans l'inventaire; deux piles d'un même matériau fusionnent jusqu'à 99, avec le surplus dans l'inventaire. Les outils ne fusionnent jamais. Un transfert impossible faute de place est refusé sans perte. Les raccourcis ne sont réorganisables que lorsque l'inventaire est ouvert. Utiliser ou déposer le dernier objet vide son emplacement; un emplacement vide peut rester sélectionné.

Les objets empilables récoltés ou fabriqués remplissent d'abord les piles du même objet déjà présentes dans la barre de raccourcis, jusqu'à 99, puis l'inventaire. Les nouveaux outils occupent chacun un emplacement d'inventaire, sans modifier un outil déjà équipé. Aucun raccourci vide n'est rempli automatiquement. Si tout est plein, le butin reste au sol et la fabrication attend.

Les deux flèches de rotation et le bouton de plan sont regroupés au-dessus de la barre, à côté d'un aperçu de l'objet sélectionné. Les flèches font pivoter la pièce de 90° vers la gauche ou la droite; l'aperçu et l'icône suivent l'orientation, appliquée à la pose et conservée dans la sauvegarde. Une sélection vide affiche des mains nues; la rotation est désactivée pour les mains et les outils. Une pioche peut choisir les deux plans. La géométrie des escaliers de premier plan suit leur rotation.

### Deux plans de construction

Le bouton à deux carrés au-dessus de la barre choisit le **premier plan** ou l'**arrière-plan** du raccourci sélectionné, même vide, à la souris, au tactile ou au clavier. L'aperçu d'un bloc en arrière-plan est assombri. Le choix reste associé au raccourci lorsque sa pile change ou s'épuise. Les torches et les échelles sont réservées au premier plan : leur bouton de plan est désactivé et, si une telle pile arrive dans un raccourci configuré en arrière-plan, celui-ci repasse automatiquement au premier plan.

La pose et le minage ciblent le plan choisi. Une nouvelle pièce doit toucher par un côté une pièce du même plan, ou disposer d'un bloc de l'autre plan à la même case; une diagonale ne suffit pas. Le support est vérifié à la pose, sans effondrement ultérieur. On peut construire en arrière-plan derrière le personnage, mais pas l'enfermer dans un bloc de premier plan. Ces règles s'appliquent aussi aux anciennes parties.

Les blocs d'arrière-plan sont affichés à 70 % de leur couleur, suivent exactement la même caméra que le premier plan, ne bloquent pas les personnages et laissent passer la lumière. Dans les nouveaux mondes, le fond naturel sous la surface et dans les grottes est indestructible : le miner ne produit ni fissure ni message. Les troncs naturels font exception : ils restent à leur couleur normale et sont récoltables. Pour les miner, sélectionnez un **raccourci vide ou une pioche réglés sur l'arrière-plan**, puis maintenez le clic ou l'appui sur le tronc. Les blocs d'arrière-plan construits par le joueur sont eux aussi minables sur ce plan, même derrière un bloc de premier plan.

### Fabrication

Le volet **Recettes connues** indique les matériaux et le temps par objet :

| Recette | Matériaux | Temps par objet |
|---|---|---|
| 2 torches | 1 bois | 1 s |
| 1 échelle | 1 bois | 1,5 s |
| 2 escaliers en bois | 1 bois | 2 s |
| 2 escaliers en pierre | 1 pierre | 3 s |
| 1 pioche en pierre | 1 bois + 1 pierre | 3 s |

La quantité désigne les objets produits et doit respecter le rendement de la recette : par exemple, les torches se fabriquent par multiples de deux. Le lot peut occuper plusieurs piles, dans la limite de l'inventaire et des places restantes dans les piles correspondantes des raccourcis. Les matériaux sont pris dans l'inventaire puis les raccourcis et réservés au démarrage, après vérification de la place nécessaire; une recette peut donc utiliser uniquement des matériaux de la barre. Les objets arrivent un par un, en priorité dans les piles existantes des raccourcis puis dans l'inventaire; deux barres montrent la progression de l'objet et celle du lot. Si ces espaces se remplissent entre-temps, la fabrication attend qu'une place soit libérée sans perdre les matériaux réservés. Un lot lancé ne peut pas encore être annulé. Il continue inventaire fermé, s'arrête en pause et reprend après sauvegarde et chargement, sans avancer pendant la fermeture du jeu.

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
