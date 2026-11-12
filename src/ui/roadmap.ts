const repositoryUrl = "https://github.com/DavidZoon/kingdoms-beneath";

const milestones = [
  {
    title: "Fondations",
    status: "done",
    label: "Réalisé",
    description: "Architecture, moteur Phaser, TypeScript et déploiement sur GitHub Pages.",
  },
  {
    title: "Premier monde jouable",
    status: "done",
    label: "Réalisé",
    description: "Monde seedé, exploration, minage, inventaire et sauvegardes locales avec import/export.",
  },
  {
    title: "Profondeur, construction et lumière",
    status: "current",
    label: "En cours · première version jouable",
    description: "Grottes, parallaxe, cycle jour/nuit, torches, deux plans, rotation et premiers crafts/outils disponibles. Contenu artistique et performances mobiles à approfondir.",
  },
  {
    title: "Application installable",
    status: "done",
    label: "Réalisé",
    description: "Installation PWA, jeu hors ligne, notification des mises à jour et choix de l'orientation.",
  },
  {
    title: "MVP complet",
    status: "planned",
    label: "À venir",
    description: "Stations de craft, minerais et progression, deux mineurs recrutables, santé, combat, première horde et prototype de pluie.",
  },
  {
    title: "V1 · Colonie et contenu",
    status: "planned",
    label: "Prévu",
    description: "Six biomes, villages, rôles des PNJ, commerce, faune, météo et sauvegardes multiples.",
  },
  {
    title: "V2 · Profondeur et extensibilité",
    status: "planned",
    label: "Prévu",
    description: "Élevage, défenses enrichies, outils de contenu, accessibilité et optimisations guidées par le profilage.",
  },
  {
    title: "V3 · Long terme",
    status: "planned",
    label: "À explorer",
    description: "Création de contenu, partage de seeds et scénarios, nouveaux événements et personnalisation de la colonie.",
  },
] as const;

export function createRoadmapDialog(): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.id = "roadmap-dialog";
  dialog.className = "roadmap-dialog menu-card";
  dialog.setAttribute("aria-labelledby", "roadmap-title");
  dialog.setAttribute("aria-describedby", "roadmap-intro");
  dialog.innerHTML = `
    <div class="inventory-heading">
      <div><p class="eyebrow">Le chemin parcouru et la suite</p><h2 id="roadmap-title">Roadmap du jeu</h2></div>
      <form method="dialog"><button type="submit" autofocus>Fermer</button></form>
    </div>
    <p id="roadmap-intro" class="notice">Les premières tranches sont jouables, le MVP complet reste en développement.
      Les étapes sont présentées dans leur ordre de progression, sans date de livraison annoncée.</p>
    <div class="roadmap-columns">
      <section aria-labelledby="roadmap-stages-title">
        <h3 id="roadmap-stages-title">Frise d'avancement</h3>
        <ol class="roadmap-timeline">
          ${milestones.map((stage) => `<li class="roadmap-stage roadmap-${stage.status}">
            <span class="roadmap-status">${stage.label}</span>
            <h4>${stage.title}</h4><p>${stage.description}</p>
          </li>`).join("")}
        </ol>
        <a href="${repositoryUrl}/blob/main/docs/ROADMAP.md" target="_blank" rel="noopener noreferrer">Consulter la roadmap détaillée sur GitHub</a>
      </section>
      <section aria-labelledby="roadmap-commits-title">
        <h3 id="roadmap-commits-title">Ajouts récents · commits</h3>
        <p class="roadmap-note">Les 12 derniers commits au maximum, du plus récent au plus ancien, intégrés à cette version du jeu.
          Cet historique reste consultable hors ligne ; les liens GitHub nécessitent Internet.
          Les modifications non commitées ne figurent pas ici.</p>
        <ol class="roadmap-timeline" id="roadmap-commits"></ol>
      </section>
    </div>
  `;
  const list = dialog.querySelector("#roadmap-commits");
  if (!list) throw new Error("Historique des commits introuvable.");
  const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
  for (const commit of __RECENT_COMMITS__) {
    const item = document.createElement("li");
    const time = document.createElement("time");
    time.dateTime = commit.date;
    time.textContent = dateFormat.format(new Date(commit.date));
    const title = document.createElement("h4");
    title.textContent = commit.subject;
    const link = document.createElement("a");
    link.href = `${repositoryUrl}/commit/${commit.hash}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `Voir le commit ${commit.hash.slice(0, 7)} sur GitHub`;
    item.append(time, title, link);
    list.append(item);
  }
  return dialog;
}
