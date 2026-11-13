import "./styles.css";
import { loadResourceArt } from "./rendering/resourceArt";
import { Application } from "./ui/Application";

const parent = document.querySelector<HTMLElement>("#game-container");

if (!parent) {
  throw new Error("Missing #game-container element.");
}

const container = parent;
loadResourceArt()
  .catch((error: unknown) => console.error("Textures des ressources indisponibles, rendu procédural utilisé.", error))
  .finally(() => new Application(container));
