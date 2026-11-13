import { Game } from "../game/Game";
import { GameSession } from "../game/GameSession";
import { InputController } from "../input/InputController";
import { SaveRepository } from "../save/SaveRepository";
import { MAX_SAVE_BYTES, SaveValidationError, parseSave, serializeSave } from "../save/schema";
import type { SaveGame } from "../save/types";
import { ITEMS, TOOL_ITEMS, TOOLS, ITEM_LABELS, TILE_SIZE, canUseItemOnPlane, isBlockItem, isItemId, isToolItem, type ItemId } from "../world/blocks";
import {
  getStacks, HOTBAR_SLOT_COUNT, INVENTORY_SLOT_COUNT, ITEM_CAPACITY, isToolStack, type ItemStack, type SlotLocation,
} from "../inventory/Inventory";
import {
  clampCraftQuantity, isRecipeId, MAX_CRAFT_SELECTION, RECIPES, RECIPE_IDS, type RecipeId,
} from "../crafting/Recipes";
import { dayPhaseAt } from "../lighting/WorldClock";
import { isLightingQuality } from "../lighting/quality";
import { hudCameraCenter } from "../rendering/camera";
import { itemIconUrl } from "../rendering/blockTextures";
import { InstallPrompt, isRunningAsApp } from "../pwa/installPrompt";
import {
  applyOrientation, isOrientationPreference, readOrientationPreference, writeOrientationPreference,
  type OrientationPreference,
} from "../pwa/orientation";
import { registerPwa } from "../pwa/registerPwa";
import { createRoadmapDialog } from "./roadmap";

type StackSource = SlotLocation & { stack: ItemStack };
type TouchDrag = { pointerId: number; x: number; y: number; source: StackSource; moved: boolean };

function itemIcon(stack: ItemStack): string {
  const tool = isToolStack(stack);
  const background = tool ? "" : `background-image: url('${itemIconUrl(stack.itemId)}');`;
  return `<span class="item-icon">
    <span aria-hidden="true" class="block-swatch ${stack.itemId}${tool ? " tool" : ""}" style="${background} transform: rotate(${stack.rotation ?? 0}deg)"></span>
    ${tool ? `<progress class="item-durability" aria-label="Durabilité de ${ITEM_LABELS[stack.itemId]}" max="${TOOLS[stack.itemId].maxDurability}" value="${stack.durability}"></progress>` : ""}
  </span>`;
}

function slotContent(stack: ItemStack): string {
  return `${itemIcon(stack)}${isToolStack(stack) ? "" : `<strong class="slot-quantity">${stack.quantity}</strong>`}`;
}

function stackDescription(stack: ItemStack): string {
  return isToolStack(stack)
    ? `${ITEM_LABELS[stack.itemId]}, outil, durabilité ${stack.durability} / ${TOOLS[stack.itemId].maxDurability}`
    : `${ITEM_LABELS[stack.itemId]}, ${stack.quantity}, rotation ${stack.rotation ?? 0}°`;
}

function orientationSelect(id: string): string {
  return `<label class="lighting-option" for="${id}">Orientation de l'écran
    <select id="${id}" class="orientation-select">
      <option value="auto">Automatique (suit l'appareil)</option>
      <option value="landscape">Paysage verrouillé</option>
      <option value="portrait">Portrait verrouillé</option>
    </select>
  </label>`;
}

function hotbarMarkup(id: string): string {
  return `<div class="hotbar-group">
    <div class="construction-controls" role="group" aria-label="Réglages de l'objet sélectionné">
      <button type="button" data-rotate="-1" aria-label="Pivoter de 90° vers la gauche">↶</button>
      <div class="selection-preview" data-selection-preview role="img" aria-label="Mains nues"></div>
      <button type="button" data-rotate="1" aria-label="Pivoter de 90° vers la droite">↷</button>
      <button type="button" class="plane-toggle" data-toggle-plane aria-pressed="false">
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <rect class="plane-back" x="2" y="2" width="10" height="10"></rect>
          <rect class="plane-front" x="7" y="7" width="10" height="10"></rect>
        </svg>
      </button>
      <span class="selection-details" data-selection-details></span>
    </div>
    <nav id="${id}" class="hotbar" aria-label="Barre d'accès rapide">
    ${Array.from({ length: HOTBAR_SLOT_COUNT }, (_, index) => `
      <div class="hotbar-slot">
        <button type="button" class="hotbar-stack" data-slot-area="hotbar" data-slot-index="${index}" aria-pressed="false"></button>
      </div>`).join("")}
    </nav>
  </div>`;
}

export class Application {
  private readonly root = document.createElement("div");
  private readonly repository = new SaveRepository();
  private readonly controls: InputController;
  private saved: SaveGame | null = null;
  private session: GameSession | null = null;
  private game: Game | null = null;
  private busy = false;
  private paused = false;
  private storageReady = false;
  private unreadableSave = false;
  private autosaveFailed = false;
  private inventoryRenderKey = "";
  private transferSource: StackSource | null = null;
  private dragSource: StackSource | null = null;
  private touchDrag: TouchDrag | null = null;
  private suppressSlotClick = false;
  private lastCraft: { recipeId: RecipeId; quantity: number } | null = null;
  private finishedCraft: { recipeId: RecipeId; quantity: number } | null = null;
  private wasCraftBlocked = false;
  private devResource: ItemId = ITEMS[0];
  private readonly installPrompt: InstallPrompt;
  private reloadForUpdate: (() => Promise<void>) | null = null;

  constructor(private readonly gameParent: HTMLElement) {
    this.root.id = "app-ui";
    this.root.innerHTML = `
      <section id="main-menu" class="menu-screen" aria-labelledby="game-title">
        <div class="menu-landscape" aria-hidden="true"><div class="sun"></div></div>
        <div class="menu-layout">
          <header class="brand">
            <p class="eyebrow">Survie · Exploration · Colonie</p>
            <h1 id="game-title">Kingdoms<br><span>Beneath</span></h1>
            <p class="translated-title">(Les Royaumes enfouis)</p>
            <p class="tagline">Une terre sauvage.<br>Une colonie à bâtir.</p>
            <p class="build-badge">MVP · Première expédition</p>
          </header>
          <section class="menu-card" aria-labelledby="menu-title">
            <p class="eyebrow">Votre aventure</p>
            <h2 id="menu-title">Sous la surface,<br>tout reste à construire.</h2>
            <p id="save-details" class="save-details">Lecture du stockage local…</p>
            <div class="menu-actions">
              <button id="new-game" class="primary" data-operation>Nouvelle partie</button>
              <button id="resume-game" data-operation>Reprendre la partie</button>
              <div class="button-row">
                <button id="import-save" data-operation>Importer un fichier</button>
                <button id="export-save" data-operation>Exporter la sauvegarde</button>
              </div>
              <button id="install-app" type="button" hidden>Installer l'application</button>
              <button id="open-roadmap" type="button" aria-haspopup="dialog" aria-controls="roadmap-dialog">Roadmap et nouveautés</button>
            </div>
            <form id="new-game-form" class="new-game-form" hidden>
              <h3>Fonder une colonie</h3>
              <label>Nom de la partie
                <input id="world-name" name="name" maxlength="60" required value="Nouvelle colonie">
              </label>
              <label>Graine du monde <span>(facultative)</span>
                <input id="world-seed" name="seed" maxlength="100" placeholder="Une graine, un même territoire">
              </label>
              <label class="option-toggle"><input id="new-creative-mode" type="checkbox">
                Mode créatif <span>(menu DEV de ressources)</span></label>
              <div class="button-row">
                <button type="submit" class="primary" data-operation>Créer et explorer</button>
                <button id="cancel-new" type="button" data-operation>Annuler</button>
              </div>
            </form>
            ${orientationSelect("orientation-menu")}
            <p id="menu-notice" class="notice" role="status"></p>
            <p class="storage-note">Un emplacement local · Sauvegarde automatique · Fichiers JSON<br>
              Vos parties restent sur cet appareil. Exportez-les pour les conserver ailleurs.</p>
          </section>
          <footer class="menu-footer">Monde seedé, exploration, minage et lumière.
            La colonie, l'artisanat complet et les menaces arrivent dans les prochaines tranches.</footer>
        </div>
      </section>
      <section id="play-ui" hidden aria-label="Commandes de jeu">
        <header class="hud-bar" data-camera-edge="top">
          <div class="hud-identity"><strong>Kingdoms Beneath</strong><span id="coordinates"></span></div>
          <div class="hud-actions">
            <span id="save-state" role="status" data-camera-edge="top"></span>
            <button id="open-inventory" aria-expanded="false">Inventaire (I)</button>
            <button id="open-dev" aria-expanded="false" aria-controls="dev-panel" hidden>DEV</button>
            <button id="zoom-out" aria-label="Réduire le zoom">−</button>
            <button id="zoom-in" aria-label="Augmenter le zoom">+</button>
            <button id="toggle-help" type="button" aria-label="Afficher ou masquer l'aide" aria-expanded="false" aria-controls="play-help">?</button>
            <button id="pause-game">Pause / menu</button>
          </div>
        </header>
        <p id="play-help" class="play-help" data-camera-edge="top" hidden>A/Q/D ou flèches : déplacement · Espace : saut · W/Z/S ou ↑/↓ : échelle / nage · Maj : course · Maintenir une plante : cueillir ·
          Raccourci vide ou outil : maintenir le clic pour miner (impact toutes les 0,25 s) · Matériau sélectionné : cliquer pour poser ·
          Carrés superposés : choisir le plan · 1–0 : sélection · I : inventaire · G : déposer · Échap : pause<br>
          Tactile : maintenez une case pour miner, touchez-la pour poser. Pincez pour zoomer.</p>
        <section id="inventory-panel" class="inventory-panel" hidden aria-labelledby="inventory-title">
          <div class="inventory-heading">
            <div><p class="eyebrow">Ressources transportées</p><h2 id="inventory-title">Inventaire</h2></div>
            <button id="close-inventory" aria-label="Fermer l'inventaire">Fermer</button>
          </div>
          <div class="inventory-layout">
            <div class="inventory-storage">
              <p class="inventory-help">Glissez une pile ou sélectionnez-la, puis choisissez sa destination.</p>
              <div id="inventory-slots" class="inventory-slots" role="group" aria-label="Emplacements d'inventaire"></div>
              <h3>Barre de raccourcis</h3>
              ${hotbarMarkup("inventory-hotbar")}
              <p id="transfer-notice" class="notice" role="status"></p>
              <button id="drop-item" class="drop-button" disabled>Choisissez une pile à déposer (G)</button>
            </div>
            <aside class="craft-panel" aria-labelledby="craft-title">
              <h3 id="craft-title">Recettes connues</h3>
              <label for="recipe-list">Recette</label>
              <select id="recipe-list" size="${RECIPE_IDS.length + 2}">
                ${[false, true].map((tools) => `<optgroup label="${tools ? "Outils" : "Construction"}">
                  ${RECIPE_IDS.filter((id) => TOOL_ITEMS.some((tool) => tool === RECIPES[id].output) === tools).map((id) => {
                    const recipe = RECIPES[id];
                    return `<option value="${id}"${id === "torch" ? " selected" : ""}>${ITEM_LABELS[recipe.output]} × ${recipe.outputPerRecipe}</option>`;
                  }).join("")}</optgroup>`).join("")}
              </select>
              <label for="craft-quantity">Quantité d'objets : <output id="craft-quantity-value" for="craft-quantity">2</output>
                <span id="craft-quantity-max">Max 98</span></label>
              <input id="craft-quantity" type="range" min="2" max="98" step="2" value="2">
              <button id="craft-start" class="primary" type="button">Fabriquer</button>
              <div class="craft-progress">
                <progress id="craft-item-progress" aria-label="Objet en cours" max="1" value="0"></progress>
                <progress id="craft-total-progress" aria-label="Fabrication totale" max="1" value="0"></progress>
              </div>
              <p id="craft-notice" class="notice" role="status"></p>
            </aside>
          </div>
        </section>
        <section id="dev-panel" class="inventory-panel" hidden aria-labelledby="dev-title">
          <div class="inventory-heading">
            <div><p class="eyebrow">Mode créatif</p><h2 id="dev-title">Menu DEV</h2></div>
            <button id="close-dev" aria-label="Fermer le menu DEV">Fermer</button>
          </div>
          <p>Ajouter des ressources à l'inventaire, dans la limite des emplacements disponibles.</p>
          <form id="dev-resources" class="dev-form">
            <p id="dev-gallery-label">Ressources et outils</p>
            <div id="dev-gallery" class="inventory-slots dev-gallery" role="group" aria-labelledby="dev-gallery-label">
              ${ITEMS.map((item) => `<button type="button" class="inventory-slot" data-dev-resource="${item}"
                aria-label="${ITEM_LABELS[item]}" title="${ITEM_LABELS[item]}" aria-pressed="${item === this.devResource}">
                ${itemIcon(isToolItem(item)
                  ? { itemId: item, quantity: 1, durability: TOOLS[item].maxDurability }
                  : { itemId: item, quantity: 1 })}
              </button>`).join("")}
            </div>
            <p id="dev-selected-resource" aria-live="polite">${ITEM_LABELS[this.devResource]}</p>
            <label for="dev-quantity">Quantité</label>
            <input id="dev-quantity-slider" type="range" min="1" max="${ITEM_CAPACITY}" step="1" value="99"
              aria-label="Quantité (curseur)">
            <input id="dev-quantity" type="number" min="1" max="${ITEM_CAPACITY}" step="1" value="99" required>
            <button type="submit" class="primary">Ajouter à l'inventaire</button>
          </form>
          <p id="dev-notice" class="notice" role="status"></p>
        </section>
        <div id="drag-preview" class="drag-preview" aria-hidden="true" hidden></div>
        <div class="bottom-hud" data-camera-edge="bottom">
          <p id="action-message" class="action-message" role="status">Explorez et préparez votre premier abri.</p>
          ${hotbarMarkup("hud-hotbar")}
          <div class="touch-controls" data-camera-edge="bottom">
            <div class="movement-pad" role="group" aria-label="Croix directionnelle">
              <button data-hold="up" aria-label="Grimper ou nager vers le haut">▲</button>
              <button data-hold="left" aria-label="Aller à gauche">◀</button>
              <button data-hold="right" aria-label="Aller à droite">▶</button>
              <button data-hold="down" aria-label="Descendre ou nager vers le bas">▼</button>
            </div>
            <div class="action-pad">
              <button data-hold="run">Courrir</button>
              <button data-hold="jump">Sauter</button>
            </div>
          </div>
        </div>
      </section>
      <section id="pause-screen" class="modal-screen" hidden role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <div class="menu-card pause-card">
          <p class="eyebrow">Kingdoms Beneath</p><h2 id="pause-title">Partie en pause</h2>
          <p>La simulation est arrêtée. Votre retour au menu sauvegarde la partie avant de la fermer.</p>
          <fieldset class="game-options">
            <legend>Options de la partie</legend>
            <label class="option-toggle"><input id="creative-mode" type="checkbox" data-operation>
              Mode créatif</label>
            <p>Affiche le menu DEV pour ajouter des ressources. Le minage conserve sa durabilité.</p>
            <label class="lighting-option" for="lighting-quality">Qualité de l'éclairage
              <select id="lighting-quality" data-operation>
                <option value="standard">Standard</option>
                <option value="reduced">Économique</option>
              </select>
            </label>
            <p>Le mode économique réduit le coût du rendu sans modifier l'occlusion.</p>
            <p id="lighting-notice" class="notice" role="status"></p>
          </fieldset>
          <fieldset class="game-options">
            <legend>Affichage de cet appareil</legend>
            ${orientationSelect("orientation-pause")}
            <p id="orientation-notice" class="notice" role="status"></p>
          </fieldset>
          <div class="menu-actions">
            <button id="continue-game" class="primary" data-operation>Continuer à jouer</button>
            <button id="save-game" data-operation>Sauvegarder maintenant</button>
            <button id="export-current" data-operation>Exporter la partie actuelle</button>
            <button id="return-menu" data-operation>Sauvegarder et retourner au menu</button>
          </div>
        </div>
      </section>
      <div id="error-panel" class="error-panel" role="alert" hidden>
        <strong>Opération impossible</strong><p id="error-message"></p>
        <div class="button-row"><button id="retry-operation">Réessayer</button><button id="dismiss-error">Fermer</button></div>
      </div>
      <div id="update-banner" class="update-banner" role="status" hidden>
        <p>Nouvelle version disponible.</p>
        <div class="button-row">
          <button id="apply-update" class="primary" type="button">Recharger</button>
          <button id="dismiss-update" type="button">Plus tard</button>
        </div>
      </div>
      <input id="save-file" type="file" accept=".json,application/json" hidden>
    `;
    const roadmap = createRoadmapDialog();
    this.root.append(roadmap);
    this.element("open-roadmap").addEventListener("click", () => roadmap.showModal());
    roadmap.addEventListener("close", () => this.element("open-roadmap").focus());
    document.body.append(this.root);
    this.controls = new InputController(
      () => this.togglePause(),
      (index) => {
        if (this.session) {
          this.session.selectHotbar(index);
          this.updateHud();
        }
      },
      () => this.toggleInventory(),
      () => this.dropSelectedItem(),
    );
    this.bindEvents();
    this.installPrompt = new InstallPrompt((available) => {
      this.element("install-app").hidden = !available;
    });
    this.bindPwa();
    void this.run(() => this.loadMenu());
    window.setInterval(() => {
      if (this.session && !this.paused && !this.busy && !this.autosaveFailed) {
        void this.run(async () => {
          try {
            await this.saveCurrent();
          } catch (error) {
            this.autosaveFailed = true;
            this.element("save-state").textContent = "Échec de sauvegarde — réessayez dans le menu Pause.";
            throw error;
          }
        });
      }
    }, 5000);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.session) {
        this.setPaused(true);
        if (!this.busy) void this.run(() => this.saveCurrent());
      }
    });
    window.addEventListener("blur", () => {
      if (this.session) this.setPaused(true);
    });
  }

  private element(id: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(`#${id}`);
    if (!element) throw new Error(`Élément d'interface introuvable : ${id}`);
    return element;
  }

  private bindEvents(): void {
    this.element("new-game").addEventListener("click", () => {
      this.element("new-game-form").hidden = false;
      this.element("world-name").focus();
    });
    this.element("cancel-new").addEventListener("click", () => {
      this.element("new-game-form").hidden = true;
      this.element("new-game").focus();
    });
    this.element("new-game-form").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.run(async () => {
        const name = this.root.querySelector<HTMLInputElement>("#world-name")?.value.trim();
        const seed = this.root.querySelector<HTMLInputElement>("#world-seed")?.value.trim() || crypto.randomUUID();
        if (!name) throw new Error("Donnez un nom à votre partie.");
        if (!(await this.confirmReplacement())) return;
        const session = GameSession.create(name, seed);
        session.lightingQuality = window.matchMedia("(pointer: coarse)").matches ? "reduced" : "standard";
        const creative = this.element("new-creative-mode");
        if (creative instanceof HTMLInputElement) session.setCreativeMode(creative.checked);
        const save = session.snapshot();
        await this.repository.write(save);
        this.saved = save;
        this.unreadableSave = false;
        this.start(session);
      });
    });
    this.element("resume-game").addEventListener("click", () => {
      void this.run(async () => {
        const save = await this.repository.read();
        if (!save) throw new Error("Aucune sauvegarde disponible.");
        this.saved = save;
        this.start(new GameSession(save));
      });
    });
    const fileInput = this.root.querySelector<HTMLInputElement>("#save-file");
    if (!fileInput) throw new Error("Sélecteur de sauvegarde introuvable.");
    this.element("import-save").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;
      void this.run(async () => {
        if (file.size > MAX_SAVE_BYTES) throw new Error("Le fichier dépasse la limite de 10 Mo.");
        const save = parseSave(await file.text());
        if (!(await this.confirmReplacement())) return;
        await this.repository.write(save);
        this.saved = save;
        this.unreadableSave = false;
        this.element("menu-notice").textContent = "Sauvegarde importée. Reprenez votre aventure.";
      });
    });
    this.element("export-save").addEventListener("click", () => { void this.run(() => this.exportSaved()); });
    this.element("pause-game").addEventListener("click", () => this.togglePause());
    this.element("toggle-help").addEventListener("click", () => {
      const help = this.element("play-help");
      help.hidden = !help.hidden;
      this.element("toggle-help").setAttribute("aria-expanded", String(!help.hidden));
    });
    this.element("open-inventory").addEventListener("click", () => this.toggleInventory());
    this.element("close-inventory").addEventListener("click", () => this.toggleInventory(false));
    this.element("open-dev").addEventListener("click", () => this.toggleDev());
    this.element("close-dev").addEventListener("click", () => this.toggleDev(false));
    this.element("dev-panel").addEventListener("keydown", (event) => {
      if ((event.key === " " || event.key === "Enter") && event.target instanceof Element &&
          event.target.closest("[data-dev-resource]")) {
        event.stopPropagation();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.toggleDev(false);
      }
    });
    this.element("creative-mode").addEventListener("change", (event) => {
      if (this.session && event.target instanceof HTMLInputElement) {
        this.session.setCreativeMode(event.target.checked);
        this.updateHud();
      }
    });
    this.element("lighting-quality").addEventListener("change", (event) => {
      if (!this.session || !(event.target instanceof HTMLSelectElement)) return;
      if (!isLightingQuality(event.target.value)) {
        this.element("lighting-notice").textContent = "Qualité d'éclairage invalide.";
        event.target.value = this.session.lightingQuality;
        return;
      }
      this.session.lightingQuality = event.target.value;
      this.element("lighting-notice").textContent = "Qualité d'éclairage mise à jour pour cette partie.";
    });
    this.element("dev-gallery").addEventListener("click", (event) => {
      const button = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("[data-dev-resource]") : null;
      if (!button) return;
      const item = button.dataset.devResource;
      if (!isItemId(item)) {
        this.element("dev-notice").textContent = "Sélection de ressource invalide.";
        return;
      }
      this.devResource = item;
      for (const slot of this.element("dev-gallery").querySelectorAll<HTMLButtonElement>("[data-dev-resource]")) {
        slot.setAttribute("aria-pressed", String(slot.dataset.devResource === item));
      }
      this.element("dev-selected-resource").textContent = ITEM_LABELS[item];
      this.syncDevQuantity();
    });
    for (const id of ["dev-quantity", "dev-quantity-slider"]) {
      this.element(id).addEventListener("input", (event) => {
        if (event.target instanceof HTMLInputElement && event.target.validity.valid) {
          this.syncDevQuantity(event.target.valueAsNumber);
        }
      });
    }
    this.element("dev-resources").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!this.session) return;
      const resource = this.devResource;
      const quantity = this.element("dev-quantity");
      if (!(quantity instanceof HTMLInputElement)) {
        this.element("dev-notice").textContent = "Sélection de ressource invalide.";
        return;
      }
      const requested = isToolItem(resource) ? 1 : quantity.valueAsNumber;
      const result = this.session.grantResources(resource, requested);
      this.element("dev-notice").textContent = result.ok
        ? `${result.added} ${ITEM_LABELS[resource]} ajouté(s).${result.added < requested
          ? ` Inventaire plein : ${requested - result.added} non ajouté(s).` : ""}`
        : result.reason;
      this.updateHud();
    });
    this.element("drop-item").addEventListener("click", () => this.dropSelectedItem());
    this.element("recipe-list").addEventListener("change", () => {
      this.finishedCraft = null;
      this.element("craft-notice").textContent = "";
      this.resetCraftQuantity();
      this.updateCraftHud();
    });
    this.element("craft-quantity").addEventListener("input", () => {
      this.finishedCraft = null;
      this.updateCraftHud();
    });
    this.element("craft-start").addEventListener("click", () => {
      if (!this.session || this.paused) return;
      this.updateCraftHud();
      const recipe = this.element("recipe-list");
      const quantity = this.element("craft-quantity");
      if (!(recipe instanceof HTMLSelectElement) || !isRecipeId(recipe.value) ||
          !(quantity instanceof HTMLInputElement)) {
        this.element("craft-notice").textContent = "Sélection de recette invalide.";
        return;
      }
      if (quantity.valueAsNumber === 0) {
        this.element("craft-notice").textContent = "Ressources insuffisantes pour cette recette.";
        return;
      }
      const result = this.session.startCraft(recipe.value, quantity.valueAsNumber);
      this.element("craft-notice").textContent = result.ok
        ? "Matériaux réservés. Fabrication en cours." : result.reason;
      if (result.ok) {
        this.finishedCraft = null;
        this.lastCraft = { recipeId: recipe.value, quantity: quantity.valueAsNumber };
      }
      this.updateHud();
    });
    this.element("continue-game").addEventListener("click", () => this.setPaused(false));
    this.element("zoom-in").addEventListener("click", () => this.game?.zoomBy(0.5));
    this.element("zoom-out").addEventListener("click", () => this.game?.zoomBy(-0.5));
    this.element("save-game").addEventListener("click", () => { void this.run(() => this.saveCurrent()); });
    this.element("export-current").addEventListener("click", () => {
      void this.run(async () => {
        await this.saveCurrent();
        await this.exportSaved();
      });
    });
    this.element("return-menu").addEventListener("click", () => {
      void this.run(async () => {
        await this.saveCurrent();
        this.game?.destroy();
        this.game = null;
        this.session = null;
        this.controls.setMode("menu");
        this.element("play-ui").hidden = true;
        this.element("pause-screen").hidden = true;
        this.element("dev-panel").hidden = true;
        this.element("inventory-panel").hidden = true;
        this.element("main-menu").hidden = false;
        this.element("new-game-form").hidden = true;
        this.element("menu-notice").textContent = "Partie sauvegardée.";
        this.element("resume-game").focus();
      });
    });
    this.element("retry-operation").addEventListener("click", () => {
      void this.run(() => this.session ? this.saveCurrent() : this.loadMenu());
    });
    this.element("dismiss-error").addEventListener("click", () => {
      this.element("error-panel").hidden = true;
    });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-hold]")) {
      const action = button.dataset.hold;
      if (action === "left" || action === "right" || action === "jump" ||
          action === "up" || action === "down" ||
          action === "run") {
        this.controls.bindButton(button, action);
      }
    }
    this.bindSlotEvents();
  }

  private bindPwa(): void {
    this.element("install-app").addEventListener("click", () => {
      void this.installPrompt.prompt().then((outcome) => {
        if (outcome === "accepted") {
          this.element("menu-notice").textContent = "Installation lancée : retrouvez Kingdoms Beneath parmi vos applications.";
        }
      }).catch((error: unknown) => console.error("Kingdoms Beneath: installation", error));
    });

    const preference = readOrientationPreference();
    for (const select of this.root.querySelectorAll<HTMLSelectElement>(".orientation-select")) {
      select.value = preference;
      select.addEventListener("change", () => {
        if (isOrientationPreference(select.value)) {
          void this.setOrientation(select.value, select.id === "orientation-pause" ? "orientation-notice" : "menu-notice");
        }
      });
    }
    void applyOrientation(preference);
    // Browsers drop orientation locks when leaving fullscreen; restore them when it is entered again.
    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement) void applyOrientation(readOrientationPreference());
    });

    this.element("apply-update").addEventListener("click", () => {
      const reload = this.reloadForUpdate;
      if (!reload) return;
      void this.run(async () => {
        if (this.session) await this.saveCurrent();
        await reload();
      });
    });
    this.element("dismiss-update").addEventListener("click", () => {
      this.element("update-banner").hidden = true;
    });
    registerPwa({
      onNeedRefresh: (reload) => {
        this.reloadForUpdate = reload;
        this.element("update-banner").hidden = false;
      },
      onOfflineReady: () => {
        const notice = this.element("menu-notice");
        if (!this.element("main-menu").hidden && !notice.textContent) {
          notice.textContent = "Le jeu est prêt à fonctionner hors ligne.";
        }
      },
    });
  }

  private async setOrientation(preference: OrientationPreference, noticeId: string): Promise<void> {
    writeOrientationPreference(preference);
    for (const select of this.root.querySelectorAll<HTMLSelectElement>(".orientation-select")) select.value = preference;
    const applied = await applyOrientation(preference);
    const notice = this.element(noticeId);
    if (preference === "auto") {
      notice.textContent = "L'affichage suit l'orientation de l'appareil.";
    } else if (applied) {
      notice.textContent = `Affichage verrouillé en ${preference === "landscape" ? "paysage" : "portrait"}.`;
    } else {
      notice.textContent = isRunningAsApp()
        ? "Cet appareil ne permet pas de verrouiller l'orientation."
        : "Verrouillage disponible dans l'application installée sur mobile. Votre choix y sera appliqué.";
    }
  }

  private async run(operation: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.element("error-panel").hidden = true;
    this.updateMenu();
    try {
      await operation();
    } catch (error) {
      console.error("Kingdoms Beneath:", error);
      this.element("error-message").textContent = error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
      this.element("error-panel").hidden = false;
    } finally {
      this.busy = false;
      this.updateMenu();
    }
  }

  private async loadMenu(): Promise<void> {
    try {
      this.saved = await this.repository.read();
      this.storageReady = true;
      this.unreadableSave = false;
    } catch (error) {
      this.storageReady = error instanceof SaveValidationError;
      this.unreadableSave = this.storageReady;
      throw error;
    }
  }

  private updateMenu(): void {
    for (const control of this.root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
      "[data-operation], #new-game-form input",
    )) control.disabled = this.busy || !this.storageReady;
    for (const id of ["resume-game", "export-save"]) {
      const button = this.element(id);
      if (button instanceof HTMLButtonElement) button.disabled = this.busy || !this.saved || !this.storageReady;
    }
    const details = this.element("save-details");
    if (this.unreadableSave) {
      details.textContent = "Sauvegarde illisible. Importez un fichier valide ou créez une nouvelle partie.";
    } else if (this.saved) {
      details.textContent = `${this.saved.name} · Sauvegardée le ${new Date(this.saved.updatedAt).toLocaleString("fr-FR")}`;
    } else {
      details.textContent = this.storageReady ? "Aucune partie sauvegardée sur cet appareil." : "Stockage local indisponible ou en cours de lecture.";
    }
    this.element("main-menu").setAttribute("aria-busy", String(this.busy));
  }

  private confirmReplacement(): Promise<boolean> {
    if (!this.saved && !this.unreadableSave) return Promise.resolve(true);
    const dialog = document.createElement("dialog");
    dialog.className = "confirm-dialog";
    dialog.setAttribute("aria-labelledby", "replace-title");
    dialog.innerHTML = `
      <h2 id="replace-title">Remplacer la sauvegarde locale ?</h2>
      <p>Un seul emplacement est disponible. Exportez la partie actuelle avant de la remplacer si vous souhaitez la conserver.</p>
      <form method="dialog" class="button-row">
        <button value="cancel" autofocus>Annuler</button><button value="replace" class="danger">Remplacer</button>
      </form>`;
    this.root.append(dialog);
    return new Promise<boolean>((resolve) => {
      dialog.addEventListener("close", () => {
        const confirmed = dialog.returnValue === "replace";
        dialog.remove();
        resolve(confirmed);
      }, { once: true });
      dialog.showModal();
    });
  }

  private start(session: GameSession): void {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.session = session;
    this.element("craft-notice").textContent = "";
    this.element("transfer-notice").textContent = "";
    this.element("lighting-notice").textContent = "";
    this.element("orientation-notice").textContent = "";
    this.inventoryRenderKey = "";
    this.clearTransfer();
    this.lastCraft = null;
    this.finishedCraft = null;
    this.wasCraftBlocked = false;
    this.resetCraftQuantity();
    this.paused = false;
    this.autosaveFailed = false;
    this.controls.setMode("playing");
    this.element("main-menu").hidden = true;
    this.element("play-ui").hidden = false;
    this.element("play-ui").inert = false;
    this.element("play-help").hidden = true;
    this.element("toggle-help").setAttribute("aria-expanded", "false");
    this.element("pause-screen").hidden = true;
    this.element("save-state").textContent = "Sauvegarde automatique · 5 s";
    const topHud = [...this.root.querySelectorAll<HTMLElement>('[data-camera-edge="top"]')];
    const bottomHud = [...this.root.querySelectorAll<HTMLElement>('[data-camera-edge="bottom"]')];
    const visibleBounds = (elements: HTMLElement[]): DOMRect[] => elements
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => element.getBoundingClientRect());
    this.game = new Game(this.gameParent, session, this.controls, {
      onHud: () => this.updateHud(),
      onAction: (message) => { this.element("action-message").textContent = message; },
      getCameraCenterY: (viewport) => hudCameraCenter(viewport, visibleBounds(topHud), visibleBounds(bottomHud)),
    });
    this.updateHud();
  }

  private togglePause(): void {
    if (!this.element("dev-panel").hidden) {
      this.toggleDev(false);
    } else if (!this.element("inventory-panel").hidden) {
      this.toggleInventory(false);
    } else if (this.session && !this.busy) {
      this.setPaused(!this.paused);
    }
  }

  private toggleInventory(force?: boolean): void {
    if (!this.session || this.paused) return;
    const panel = this.element("inventory-panel");
    const open = force ?? panel.hidden;
    if (open) {
      this.element("dev-panel").hidden = true;
      this.element("open-dev").setAttribute("aria-expanded", "false");
    }
    panel.hidden = !open;
    this.controls.setInventoryOpen(open);
    this.element("open-inventory").setAttribute("aria-expanded", String(open));
    if (!open) this.clearTransfer();
    this.updateHud();
  }

  private syncDevQuantity(value?: number): void {
    const quantity = this.element("dev-quantity");
    const slider = this.element("dev-quantity-slider");
    if (!(quantity instanceof HTMLInputElement) || !(slider instanceof HTMLInputElement)) {
      throw new Error("Contrôles de quantité DEV introuvables.");
    }
    const locked = isToolItem(this.devResource);
    quantity.max = slider.max = String(locked ? 1 : ITEM_CAPACITY);
    quantity.disabled = slider.disabled = locked;
    if (locked || value !== undefined) {
      quantity.value = slider.value = locked ? "1" : String(value);
    }
  }

  private toggleDev(force?: boolean): void {
    if (!this.session || this.paused) return;
    const panel = this.element("dev-panel");
    const open = force ?? panel.hidden;
    if (open && !this.session.creativeMode) return;
    if (open) {
      this.element("inventory-panel").hidden = true;
      this.element("open-inventory").setAttribute("aria-expanded", "false");
      this.clearTransfer();
    }
    panel.hidden = !open;
    this.controls.setInventoryOpen(open);
    this.element("open-dev").setAttribute("aria-expanded", String(open));
    if (open) {
      this.element("dev-gallery").querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    } else {
      this.element("open-dev").focus();
    }
    this.updateHud();
  }

  private dropSelectedItem(): void {
    if (!this.session || this.paused) return;
    if (this.inventoryIsOpen()) {
      const source = this.transferSource;
      if (!source) {
        this.element("transfer-notice").textContent = "Sélectionnez une pile dans le sac ou les raccourcis pour la déposer.";
        return;
      }
      if (!this.sourceIsCurrent(source)) {
        this.element("transfer-notice").textContent = "La pile a changé : sélectionnez-la à nouveau.";
        this.clearTransfer();
        this.updateHud();
        return;
      }
      const result = this.session.dropStack(source);
      this.element("transfer-notice").textContent = result.ok
        ? `${ITEM_LABELS[source.stack.itemId]} : 1 objet déposé au sol.` : result.reason;
      if (result.ok) {
        const remaining = this.sourceAt(source);
        this.clearTransfer();
        if (source.stack.quantity > 1 && remaining?.stack.itemId === source.stack.itemId) {
          this.transferSource = remaining;
        }
      }
      this.updateHud();
      return;
    }
    const result = this.session.dropSelectedItem();
    this.element("action-message").textContent = result.ok ? "Ressource déposée au sol." : result.reason;
    this.updateHud();
  }

  private setPaused(paused: boolean): void {
    if (!this.session) return;
    this.paused = paused;
    this.game?.setPaused(paused);
    this.controls.setMode(paused ? "paused" : "playing");
    this.element("pause-screen").hidden = !paused;
    this.element("inventory-panel").hidden = true;
    this.element("dev-panel").hidden = true;
    this.element("open-dev").setAttribute("aria-expanded", "false");
    this.element("open-inventory").setAttribute("aria-expanded", "false");
    this.clearTransfer();
    this.element("play-ui").inert = paused;
    this.element(paused ? "continue-game" : "pause-game").focus();
    this.updateHud();
  }

  private async saveCurrent(): Promise<void> {
    if (!this.session) throw new Error("Aucune partie active à sauvegarder.");
    const save = this.session.snapshot();
    await this.repository.write(save);
    this.saved = save;
    this.autosaveFailed = false;
    this.element("save-state").textContent = `Sauvegardé à ${new Date(save.updatedAt).toLocaleTimeString("fr-FR")}`;
  }

  private async exportSaved(): Promise<void> {
    const save = await this.repository.read();
    if (!save) throw new Error("Aucune sauvegarde à exporter.");
    const blob = new Blob([serializeSave(save)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kingdoms-beneath-${save.id}.json`;
    this.root.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    this.element("menu-notice").textContent = "Export demandé : conservez le fichier JSON téléchargé.";
  }

  private inventoryIsOpen(): boolean {
    return !!this.session && !this.paused && !this.element("inventory-panel").hidden;
  }

  private slotAt(target: EventTarget | null): SlotLocation | null {
    if (!(target instanceof Element)) return null;
    const element = target.closest<HTMLButtonElement>("[data-slot-area][data-slot-index]");
    if (!element || !this.root.contains(element)) return null;
    const area = element.dataset.slotArea;
    const index = Number(element.dataset.slotIndex);
    if ((area !== "inventory" && area !== "hotbar") || !Number.isInteger(index) || index < 0 ||
        index >= (area === "inventory" ? INVENTORY_SLOT_COUNT : HOTBAR_SLOT_COUNT)) return null;
    return { area, index };
  }

  private stackAt(location: SlotLocation): ItemStack | null {
    if (!this.session) return null;
    return location.area === "inventory"
      ? getStacks(this.session.inventory)[location.index] ?? null
      : this.session.hotbar[location.index] ?? null;
  }

  private sourceAt(location: SlotLocation): StackSource | null {
    const stack = this.stackAt(location);
    return stack ? { ...location, stack: { ...stack } } : null;
  }

  private sourceIsCurrent(source: StackSource): boolean {
    const current = this.stackAt(source);
    return !!current && current.itemId === source.stack.itemId && current.quantity === source.stack.quantity &&
      current.durability === source.stack.durability;
  }

  private clearTransfer(): void {
    this.transferSource = null;
    this.dragSource = null;
    this.touchDrag = null;
    this.element("drag-preview").hidden = true;
  }

  private highlightTransferSource(): void {
    const source = this.transferSource;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-slot-area][data-slot-index]")) {
      const location = this.slotAt(button);
      const selected = !!source && location?.area === source.area && location.index === source.index;
      button.classList.toggle("transfer-source", selected);
      if (location?.area === "inventory" || this.element("inventory-hotbar").contains(button)) {
        button.setAttribute("aria-pressed", String(selected));
      }
    }
    const dropButton = this.element("drop-item");
    if (!(dropButton instanceof HTMLButtonElement)) throw new Error("Bouton de dépôt invalide.");
    dropButton.disabled = !source || !this.sourceIsCurrent(source);
    dropButton.textContent = source
      ? `Déposer 1 ${ITEM_LABELS[source.stack.itemId]} (G)` : "Choisissez une pile à déposer (G)";
  }

  private moveStack(source: StackSource, target: SlotLocation): void {
    if (!this.session || !this.inventoryIsOpen()) return;
    if (!this.sourceIsCurrent(source)) {
      this.element("transfer-notice").textContent = "La pile a changé : sélectionnez-la à nouveau.";
      this.clearTransfer();
      this.updateHud();
      return;
    }
    const current = source.stack;
    let result;
    if (source.area === "inventory" && target.area === "hotbar") {
      result = this.session.moveInventoryToHotbar(source.index, target.index);
    } else if (source.area === "hotbar" && target.area === "inventory") {
      result = this.session.moveHotbarToInventory(source.index);
    } else if (source.area === "hotbar" && target.area === "hotbar") {
      result = this.session.swapHotbar(source.index, target.index);
    } else if (this.stackAt(target)?.itemId === current.itemId) {
      // Inventory quantities are already packed into stacks of at most 99.
      result = { ok: true as const };
    } else {
      result = { ok: false as const, reason: "Choisissez un emplacement de la barre de raccourcis." };
    }
    this.element("transfer-notice").textContent = result.ok ? "Pile déplacée." : result.reason;
    this.clearTransfer();
    this.updateHud();
  }

  private bindSlotEvents(): void {
    this.root.addEventListener("click", (event) => {
      const planeButton = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("[data-toggle-plane]") : null;
      if (planeButton) {
        if (!this.session || this.paused) return;
        const index = this.session.selectedSlot;
        const result = this.session.toggleHotbarPlane(index);
        const plane = this.session.hotbarPlanes[index];
        const message = result.ok
          ? `Raccourci ${index === 9 ? 0 : index + 1} : ${plane === "foreground" ? "premier plan" : "arrière-plan"}.`
          : result.reason;
        this.element(this.inventoryIsOpen() ? "transfer-notice" : "action-message").textContent = message;
        if (event.detail > 0) planeButton.blur();
        this.updateHud();
        return;
      }
      const rotationButton = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("[data-rotate]") : null;
      if (rotationButton) {
        if (!this.session || this.paused) return;
        const direction = Number(rotationButton.dataset.rotate);
        if (direction !== -1 && direction !== 1) return;
        const result = this.session.rotateSelected(direction);
        this.clearTransfer();
        this.element(this.inventoryIsOpen() ? "transfer-notice" : "action-message").textContent = result.ok
          ? `Rotation : ${this.session.selectedRotation}°.` : result.reason;
        if (event.detail > 0) rotationButton.blur();
        this.updateHud();
        return;
      }
      const target = this.slotAt(event.target);
      if (!target || !this.session || this.paused) return;
      if (this.suppressSlotClick) {
        this.suppressSlotClick = false;
        event.preventDefault();
        return;
      }
      if (!this.inventoryIsOpen()) {
        if (target.area === "hotbar") {
          this.session.selectHotbar(target.index);
          this.updateHud();
        }
        return;
      }
      const source = this.transferSource;
      if (source && source.area === target.area && source.index === target.index) {
        this.clearTransfer();
        this.element("transfer-notice").textContent = "Sélection annulée.";
      } else if (source && (!(source.area === "inventory" && target.area === "inventory") ||
          this.stackAt(target)?.itemId === source.stack.itemId)) {
        this.moveStack(source, target);
        return;
      } else {
        this.transferSource = this.sourceAt(target);
        this.element("transfer-notice").textContent = this.transferSource
          ? "Pile sélectionnée : choisissez sa destination ou déposez un objet (G)."
          : "Cet emplacement est vide.";
      }
      this.highlightTransferSource();
    });

    this.root.addEventListener("dragstart", (event) => {
      const location = this.slotAt(event.target);
      const source = location && this.inventoryIsOpen() ? this.sourceAt(location) : null;
      if (!source || !event.dataTransfer) {
        event.preventDefault();
        return;
      }
      this.dragSource = source;
      this.transferSource = source;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", "kingdoms-beneath-stack");
      this.highlightTransferSource();
    });
    this.root.addEventListener("dragover", (event) => {
      if (!this.inventoryIsOpen() || !this.dragSource || !this.slotAt(event.target)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    });
    this.root.addEventListener("drop", (event) => {
      const target = this.slotAt(event.target);
      if (!this.inventoryIsOpen() || !this.dragSource || !target) return;
      event.preventDefault();
      this.moveStack(this.dragSource, target);
    });
    this.root.addEventListener("dragend", () => {
      this.clearTransfer();
      this.updateHud();
    });

    this.root.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" || !this.inventoryIsOpen() || this.touchDrag) return;
      const location = this.slotAt(event.target);
      const source = location ? this.sourceAt(location) : null;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("[data-slot-area][data-slot-index]") : null;
      if (!source || !target) return;
      this.touchDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, source, moved: false };
      target.setPointerCapture(event.pointerId);
    });
    this.root.addEventListener("pointermove", (event) => {
      const drag = this.touchDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return;
      drag.moved = true;
      this.dragSource = drag.source;
      this.transferSource = drag.source;
      const preview = this.element("drag-preview");
      preview.hidden = false;
      preview.textContent = stackDescription(drag.source.stack);
      preview.style.left = `${event.clientX + 12}px`;
      preview.style.top = `${event.clientY + 12}px`;
      this.highlightTransferSource();
      event.preventDefault();
    });
    this.root.addEventListener("pointerup", (event) => {
      const drag = this.touchDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.moved) {
        this.touchDrag = null;
        return;
      }
      this.suppressSlotClick = true;
      window.setTimeout(() => { this.suppressSlotClick = false; }, 0);
      const target = this.slotAt(document.elementFromPoint(event.clientX, event.clientY));
      event.preventDefault();
      if (target) {
        this.moveStack(drag.source, target);
      } else {
        this.element("transfer-notice").textContent = "Déplacement annulé.";
        this.clearTransfer();
        this.updateHud();
      }
    });
    this.root.addEventListener("pointercancel", (event) => {
      if (!this.touchDrag || this.touchDrag.pointerId !== event.pointerId) return;
      if (this.touchDrag.moved) this.element("transfer-notice").textContent = "Déplacement annulé.";
      this.clearTransfer();
      this.updateHud();
    });
  }

  private resetCraftQuantity(): void {
    const list = this.element("recipe-list");
    const quantity = this.element("craft-quantity");
    if (!(list instanceof HTMLSelectElement) || !isRecipeId(list.value) ||
        !(quantity instanceof HTMLInputElement)) throw new Error("Contrôles de fabrication invalides.");
    const perRecipe = RECIPES[list.value].outputPerRecipe;
    quantity.min = String(perRecipe);
    quantity.max = String(Math.floor(MAX_CRAFT_SELECTION / perRecipe) * perRecipe);
    quantity.step = String(perRecipe);
    quantity.value = String(perRecipe);
  }

  private updateCraftHud(): void {
    const session = this.session;
    if (!session) return;
    const list = this.element("recipe-list");
    const quantity = this.element("craft-quantity");
    const button = this.element("craft-start");
    const itemProgress = this.element("craft-item-progress");
    const totalProgress = this.element("craft-total-progress");
    if (!(list instanceof HTMLSelectElement) || !(quantity instanceof HTMLInputElement) ||
        !(button instanceof HTMLButtonElement) || !(itemProgress instanceof HTMLProgressElement) ||
        !(totalProgress instanceof HTMLProgressElement)) throw new Error("Contrôles de fabrication invalides.");
    const job = session.crafting;
    if (job) {
      list.value = job.recipeId;
      this.lastCraft = { recipeId: job.recipeId, quantity: job.quantity };
    } else if (this.lastCraft) {
      this.finishedCraft = this.lastCraft;
      const recipe = RECIPES[this.lastCraft.recipeId];
      const message = `Fabrication terminée : ${ITEM_LABELS[recipe.output]} × ${this.lastCraft.quantity}.`;
      this.element("craft-notice").textContent = message;
      this.element("action-message").textContent = message;
      this.lastCraft = null;
    }
    if (!isRecipeId(list.value)) throw new Error("Recette sélectionnée invalide.");
    const recipe = RECIPES[list.value];
    const craftable = job ? job.quantity
      : clampCraftQuantity(recipe, MAX_CRAFT_SELECTION, (itemId) => session.totalItems(itemId));
    const maximum = Math.floor(MAX_CRAFT_SELECTION / recipe.outputPerRecipe) * recipe.outputPerRecipe;
    quantity.min = String(craftable === 0 ? 0 : recipe.outputPerRecipe);
    quantity.max = String(job ? Math.max(maximum, job.quantity) : maximum);
    quantity.step = String(recipe.outputPerRecipe);
    quantity.value = String(job ? job.quantity
      : clampCraftQuantity(recipe, quantity.valueAsNumber, (itemId) => session.totalItems(itemId)));
    this.element("craft-quantity-value").textContent = quantity.value;
    this.element("craft-quantity-max").textContent = `Max ${craftable}`;
    list.disabled = !!job;
    quantity.disabled = !!job || craftable === 0;
    button.disabled = !!job || craftable === 0;
    if (job) {
      itemProgress.max = recipe.ticksPerItem;
      itemProgress.value = job.progressTicks;
      totalProgress.max = job.quantity * recipe.ticksPerItem;
      totalProgress.value = job.completed * recipe.ticksPerItem + job.progressTicks;
      itemProgress.setAttribute("aria-valuetext", `${Math.floor(job.progressTicks * 100 / recipe.ticksPerItem)} %`);
      totalProgress.setAttribute("aria-valuetext", `${job.completed} / ${job.quantity}`);
      if (session.craftingBlocked) {
        const notice = this.element("craft-notice");
        const message = "Rangement plein : libérez de la place dans l'inventaire ou une pile du même objet dans les raccourcis. Les matériaux restent réservés.";
        if (notice.textContent !== message) notice.textContent = message;
        this.wasCraftBlocked = true;
      } else if (this.wasCraftBlocked) {
        this.element("craft-notice").textContent = "Fabrication reprise.";
        this.wasCraftBlocked = false;
      }
    } else {
      const finished = this.finishedCraft?.recipeId === recipe.id ? this.finishedCraft : null;
      itemProgress.max = 1;
      itemProgress.value = finished ? 1 : 0;
      totalProgress.max = 1;
      totalProgress.value = finished ? 1 : 0;
      itemProgress.setAttribute("aria-valuetext", finished ? "100 %" : "0 %");
      totalProgress.setAttribute("aria-valuetext", finished ? `${finished.quantity} / ${finished.quantity}` : "0");
      this.wasCraftBlocked = false;
    }
  }

  private updateConstructionControls(): void {
    const session = this.session;
    if (!session) return;
    const item = session.selectedItem;
    const stack = session.hotbar[session.selectedSlot];
    const tool = stack && isToolStack(stack) ? stack : null;
    const mining = item === null || !isBlockItem(item);
    const plane = session.selectedPlane;
    const rotation = session.selectedRotation;
    const planeLabel = plane === "foreground" ? "Premier plan" : "Arrière-plan";
    const nextPlane = plane === "foreground" ? "background" : "foreground";
    const destination = nextPlane === "foreground" ? "au premier plan" : "à l'arrière-plan";
    const canSwitch = !mining && item !== null && canUseItemOnPlane(item, nextPlane);
    const description = tool
      ? `${ITEM_LABELS[tool.itemId]} · Miner · Plan automatique · ${tool.durability} / ${TOOLS[tool.itemId].maxDurability}`
      : item
      ? mining ? `${ITEM_LABELS[item]} · Miner à mains nues · Plan automatique`
        : `${ITEM_LABELS[item]} · Poser · ${planeLabel} · ${rotation}°`
      : "Mains nues · Miner · Plan automatique";
    for (const controls of this.root.querySelectorAll<HTMLElement>(".construction-controls")) {
      const preview = controls.querySelector<HTMLElement>("[data-selection-preview]");
      const details = controls.querySelector<HTMLElement>("[data-selection-details]");
      const planeButton = controls.querySelector<HTMLButtonElement>("[data-toggle-plane]");
      if (!preview || !details || !planeButton) throw new Error("Contrôles de construction invalides.");
      const key = `${item}:${rotation}:${plane}:${tool?.durability}`;
      if (preview.dataset.selection !== key) {
        preview.innerHTML = stack
          ? itemIcon(stack)
          : `<svg class="hands-preview" aria-hidden="true" viewBox="0 0 32 32">
              <g fill="#d5aa78" stroke="#67472f" stroke-width="1">
                <path d="M2 16V8h3v6h1V5h3v9h1V7h3v12l-3 7H4l-2-6Z"></path>
                <path d="M30 16V8h-3v6h-1V5h-3v9h-1V7h-3v12l3 7h6l2-6Z"></path>
              </g>
            </svg>`;
        preview.dataset.selection = key;
        preview.dataset.plane = plane;
        preview.setAttribute("aria-label", description);
        details.textContent = description;
      }
      for (const button of controls.querySelectorAll<HTMLButtonElement>("[data-rotate]")) {
        button.disabled = mining;
      }
      const label = mining
        ? "Minage automatique : premier plan, puis arrière-plan si la cellule est vide au premier plan."
        : canSwitch
        ? `${planeLabel}. Passer ${destination}.`
        : `${planeLabel}. ${item ? ITEM_LABELS[item] : "Objet"} interdit ${destination}.`;
      planeButton.disabled = !canSwitch;
      planeButton.setAttribute("aria-label", label);
      planeButton.setAttribute("aria-pressed", String(plane === "background"));
      planeButton.setAttribute("aria-disabled", String(!canSwitch));
      planeButton.title = label;
    }
  }

  private updateHud(): void {
    if (!this.session) return;
    const { player, world, inventory, selectedSlot, hotbar } = this.session;
    this.element("open-dev").hidden = !this.session.creativeMode;
    const creative = this.element("creative-mode");
    if (creative instanceof HTMLInputElement) creative.checked = this.session.creativeMode;
    const lighting = this.element("lighting-quality");
    if (lighting instanceof HTMLSelectElement) lighting.value = this.session.lightingQuality;
    if (!this.session.creativeMode && !this.element("dev-panel").hidden) this.toggleDev(false);
    this.element("coordinates").textContent = `${world.generator.biomeAt(Math.floor(player.x / TILE_SIZE)) === "forest" ? "Forêt" : "Plaine"} · ${dayPhaseAt(this.session.tick)} · x ${Math.floor(player.x / TILE_SIZE)} · y ${Math.floor(player.y / TILE_SIZE)}`;
    const inventoryOpen = this.inventoryIsOpen();
    const stacks = getStacks(inventory);
    const slots = this.element("inventory-slots");
    const inventoryKey = JSON.stringify(inventory);
    if (inventoryKey !== this.inventoryRenderKey && !this.dragSource) {
      const focused = this.slotAt(document.activeElement);
      const restoreFocus = focused?.area === "inventory" && slots.contains(document.activeElement);
      slots.replaceChildren();
      for (let index = 0; index < INVENTORY_SLOT_COUNT; index++) {
        const stack = stacks[index];
        const slot = document.createElement("button");
        slot.type = "button";
        slot.className = "inventory-slot";
        slot.dataset.slotArea = "inventory";
        slot.dataset.slotIndex = String(index);
        slot.setAttribute("aria-label", stack
          ? `Inventaire, emplacement ${index + 1} : ${stackDescription(stack)}`
          : `Inventaire, emplacement ${index + 1} : vide`);
        if (stack) {
          slot.innerHTML = slotContent(stack);
          slot.dataset.category = isToolStack(stack) ? TOOLS[stack.itemId].category : "construction";
          slot.title = stackDescription(stack);
        }
        slots.append(slot);
      }
      this.inventoryRenderKey = inventoryKey;
      if (restoreFocus && focused) {
        slots.querySelector<HTMLButtonElement>(`[data-slot-index="${focused.index}"]`)?.focus();
      }
    }
    for (const button of slots.querySelectorAll<HTMLButtonElement>("[data-slot-index]")) {
      const index = Number(button.dataset.slotIndex);
      button.draggable = inventoryOpen && !!stacks[index];
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-slot-area="hotbar"]')) {
      const index = Number(button.dataset.slotIndex);
      const stack = hotbar[index];
      const key = JSON.stringify(stack);
      if (button.dataset.stackView !== key && !this.dragSource) {
        button.innerHTML = stack ? slotContent(stack) : "";
        button.dataset.stackView = key;
      }
      button.draggable = inventoryOpen && !!stack;
      button.setAttribute("aria-pressed", String(index === selectedSlot));
      button.setAttribute("aria-label", `Raccourci ${index === 9 ? 0 : index + 1} : ${
        stack ? stackDescription(stack) : "vide"}`);
      button.title = stack ? stackDescription(stack) : "Vide";
    }
    this.updateConstructionControls();
    this.highlightTransferSource();
    this.updateCraftHud();
  }
}
