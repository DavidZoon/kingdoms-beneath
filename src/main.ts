import "./styles.css";
import { Application } from "./ui/Application";

const parent = document.querySelector<HTMLElement>("#game-container");

if (!parent) {
  throw new Error("Missing #game-container element.");
}

new Application(parent);
