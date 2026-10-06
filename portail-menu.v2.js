// ==========================================================
// Logique du bandeau "burger" — v2, partagée entre les widgets internes
// qui pilotent le bandeau depuis les tables Grist du document (plus de
// fichier JSON distant ni d'avatar utilisateur). Voir section 12 du
// contexte projet.
//
// Chargé via <script src="…/portail-menu.v2.js"> AVANT le script propre à
// chaque widget (il utilise les globales définies ici).
//
// Deux tables attendues dans CHAQUE document qui charge ce fichier :
//   - "Menu"   (une seule ligne) : Titre (texte), Logo (pièce jointe),
//     Icone (pièce jointe), + colonnes visuelles optionnelles (section 15 :
//     CouleurFond, CouleurTexte, CouleurBordure, CouleurSurvol,
//     CouleurAccent — texte, hex ou vide).
//   - "Widget" (une ligne par lien) : Titre (texte), Url (texte), Role
//     (Choice List — choix multiple, optionnelle, section 15) : si vide,
//     le lien est visible par tout le monde ; sinon seulement par les
//     rôles cochés.
//
// L'identification de la personne connectée (pour le contrôle d'accès par
// rôle) reste propre à chaque widget — ce fichier reçoit juste le rôle de
// la personne (moiRole) en paramètre de calculerPortailRenderValsV2 pour
// filtrer la liste des liens ; il ne fait pas lui-même l'identification.
// ==========================================================

const ETAT_INITIAL_PORTAIL_V2 = {
  portailOuvert: false,
  portailOutils: [],
  portailChargement: false,
  portailErreur: false,
  menu: null,
  menuLogoUrl: null,
  menuIconeUrl: null,
  menuChargement: false,
  menuErreur: false
};

// -- Pièces jointes (colonnes Logo / Icone) ------------------------------
// Une colonne "Attachment" renvoie, via fetchTable, une liste encodée
// ["L", id1, id2, ...] (parfois un tableau nu selon la version de Grist) :
// on ne garde que le premier identifiant (Logo/Icone = un seul fichier
// attendu par ligne).
function premierIdPieceJointe(valeurCellule) {
  if (!Array.isArray(valeurCellule)) return null;
  const ids = valeurCellule[0] === "L" ? valeurCellule.slice(1) : valeurCellule;
  return ids.length > 0 ? ids[0] : null;
}

// -- Colonnes "Choice List" (choix multiple) -----------------------------
// Même encodage de principe que les pièces jointes : une liste fanée
// ["L", val1, val2, ...] (parfois un tableau nu selon la version de
// Grist). Sert à la colonne "Role" de la table "Widget" (section 15) : on
// garde TOUTES les valeurs, contrairement à premierIdPieceJointe qui n'en
// garde qu'une.
function listeValeursChoix(valeurCellule) {
  if (!Array.isArray(valeurCellule)) return [];
  return valeurCellule[0] === "L" ? valeurCellule.slice(1) : valeurCellule;
}

// ⚠️ À VÉRIFIER avec votre instance Grist (grist.aucarre.tech) avant mise
// en service : construit l'URL de téléchargement d'une pièce jointe via un
// jeton d'accès temporaire. `grist.docApi.getAccessToken` est la méthode
// documentée par Grist pour qu'un widget résolve lui-même des ressources
// (pièces jointes, etc.) en URL affichable sans exposer les identifiants
// de session. Si votre version de Grist expose une autre méthode, adaptez
// uniquement cette fonction — rien d'autre n'en dépend.
async function urlPieceJointe(idPieceJointe) {
  if (!idPieceJointe) return null;
  const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: true });
  return `${baseUrl}/attachments/${idPieceJointe}/download?auth=${token}`;
}

// -- Table "Menu" (logo, titre, icône burger, variables visuelles) ------
// Appelé depuis le hook de montage confirmé du moteur x-dc
// (async componentDidMount(), voir section 8 point 8 et section 14 du
// contexte projet) :
//   async componentDidMount() {
//     await chargerMenuLogique(this.state, patch => this.setState(patch));
//   }
// Les colonnes visuelles (CouleurFond, CouleurTexte, CouleurBordure,
// CouleurSurvol, CouleurAccent) sont optionnelles et facultatives par
// cellule : une colonne absente de la table, ou une cellule vide, ne
// change rien au rendu existant (voir construireStyleVariablesMenu et le
// repli --ac-* dans portail-menu.v2.css).
async function chargerMenuLogique(etatActuel, appliquerEtat) {
  if (etatActuel.menuChargement || etatActuel.menu || etatActuel.menuErreur) return;
  appliquerEtat({ menuChargement: true, menuErreur: false });
  try {
    const table = await grist.docApi.fetchTable("Menu");
    if (!table.id || table.id.length === 0) throw new Error("Table Menu vide");
    const i = 0; // une seule ligne de configuration (voir section 12 du contexte projet)
    const idLogo = premierIdPieceJointe(table.Logo[i]);
    const idIcone = premierIdPieceJointe(table.Icone[i]);
    const [menuLogoUrl, menuIconeUrl] = await Promise.all([
      urlPieceJointe(idLogo),
      urlPieceJointe(idIcone)
    ]);
    appliquerEtat({
      menu: {
        titre: table.Titre[i] || "",
        // Colonnes texte facultatives (hex ou vide) — absentes de la table
        // tant que l'humain ne les a pas ajoutées : `table.CouleurFond` est
        // alors `undefined`, d'où le `?.[i]` défensif partout ici.
        couleurFond: table.CouleurFond?.[i] || "",
        couleurTexte: table.CouleurTexte?.[i] || "",
        couleurBordure: table.CouleurBordure?.[i] || "",
        couleurSurvol: table.CouleurSurvol?.[i] || "",
        couleurAccent: table.CouleurAccent?.[i] || ""
      },
      menuLogoUrl,
      menuIconeUrl,
      menuChargement: false
    });
  } catch (e) {
    // Une table Menu absente/en erreur ne doit jamais bloquer le widget
    // (section 11 du contexte projet) : le bandeau retombe sur un titre
    // vide, une icône de repli et les couleurs de charte par défaut (voir
    // calculerPortailRenderValsV2 / construireStyleVariablesMenu).
    appliquerEtat({ menuChargement: false, menuErreur: true });
  }
}

// -- Table "Widget" (liens du menu déroulant + visibilité par rôle) -----
// Chaque widget appelle ça depuis SA PROPRE méthode togglePortail(), qui
// lui fournit son état actuel et sa propre fonction setState :
//   async togglePortail() {
//     await togglePortailLogiqueV2(this.state, patch => this.setState(patch));
//   }
// Charge la liste une seule fois, à la première ouverture — pas à chaque
// clic, pour ne pas re-solliciter le document inutilement. La colonne
// "Role" (Choice List, facultative) est lue ici mais PAS filtrée ici : le
// filtrage dépend du rôle de la personne connectée, propre à chaque
// widget (voir filtrerOutilsParRole, appelé depuis
// calculerPortailRenderValsV2).
async function togglePortailLogiqueV2(etatActuel, appliquerEtat) {
  const ouverture = !etatActuel.portailOuvert;
  appliquerEtat({ portailOuvert: ouverture });
  if (!ouverture) return; // vient de se fermer, rien à charger
  if (etatActuel.portailOutils.length > 0 || etatActuel.portailErreur) return; // déjà chargé (ou déjà tenté)
  appliquerEtat({ portailChargement: true, portailErreur: false });
  try {
    const table = await grist.docApi.fetchTable("Widget");
    const outils = (table.id || []).map((id, i) => ({
      nom: table.Titre[i],
      url: table.Url[i],
      // Colonne facultative : absente de la table ("Role" non créée
      // encore) → table.Role est undefined → roles: [] → visible par tout
      // le monde (voir filtrerOutilsParRole).
      roles: listeValeursChoix(table.Role?.[i])
    }));
    appliquerEtat({ portailOutils: outils, portailChargement: false });
  } catch (e) {
    appliquerEtat({ portailChargement: false, portailErreur: true });
  }
}

// -- Filtrage des liens par rôle (table "Widget", colonne "Role") -------
// Robustesse délibérée (section 11 du contexte projet) : un lien SANS
// rôle coché reste visible par tout le monde, plutôt que de disparaître
// par défaut. Ça évite qu'un lien existant devienne invisible du jour au
// lendemain simplement parce que personne n'a encore rempli la colonne
// "Role" après son ajout à la table.
function filtrerOutilsParRole(outils, moiRole) {
  return outils.filter(o => !o.roles || o.roles.length === 0 || (!!moiRole && o.roles.includes(moiRole)));
}

// -- Titre composé "Titre Menu - Titre widget" ---------------------------
// Si la table Menu fournit un titre ET que le widget a son propre nom
// (NOM_OUTIL), on les combine. Si l'un des deux manque, on retombe sur
// l'autre plutôt que d'afficher " - " tout seul.
function construireTitreAffiche(menu, titreWidget) {
  const titreMenu = menu && menu.titre ? menu.titre : "";
  if (titreMenu && titreWidget) return `${titreMenu} - ${titreWidget}`;
  return titreMenu || titreWidget || "";
}

// -- Variables visuelles --> style inline sur le bandeau -----------------
// Compose UNE chaîne "--pm-xxx:valeur;..." avec seulement les variables
// renseignées (hex non vide) — portail-menu.v2.css prévoit un repli
// var(--pm-xxx, var(--ac-xxx)) pour chacune, donc une case vide ou une
// colonne absente ne change rien au rendu existant.
function construireStyleVariablesMenu(menu) {
  if (!menu) return "";
  const correspondances = [
    ["--pm-fond", menu.couleurFond],
    ["--pm-texte", menu.couleurTexte],
    ["--pm-bordure", menu.couleurBordure],
    ["--pm-survol", menu.couleurSurvol],
    ["--pm-accent", menu.couleurAccent]
  ];
  return correspondances
    .filter(([, valeur]) => !!valeur)
    .map(([variable, valeur]) => `${variable}:${valeur}`)
    .join(";");
}

// Chaque widget étale le résultat dans son propre renderVals(), à côté de
// ses propres valeurs, en lui passant SON rôle détecté et SON propre nom
// d'outil (NOM_OUTIL) :
//   return {
//     ...calculerPortailRenderValsV2(s, () => this.togglePortail(), {
//       moiRole, titreWidget: NOM_OUTIL
//     }),
//     /* le reste, propre au widget */
//   };
function calculerPortailRenderValsV2(etat, onTogglePortailFn, options) {
  const opts = options || {};
  return {
    portailOuvert: etat.portailOuvert,
    portailOuvertAttr: etat.portailOuvert ? "true" : "false",
    portailChargement: etat.portailChargement,
    portailErreur: etat.portailErreur,
    portailOutils: filtrerOutilsParRole(etat.portailOutils, opts.moiRole),
    onTogglePortail: onTogglePortailFn,
    menuTitre: construireTitreAffiche(etat.menu, opts.titreWidget),
    menuLogoUrl: etat.menuLogoUrl,
    menuLogoDisponible: !!etat.menuLogoUrl,
    menuIconeUrl: etat.menuIconeUrl,
    menuIconeDisponible: !!etat.menuIconeUrl,
    menuChargement: etat.menuChargement,
    menuErreur: etat.menuErreur,
    menuStyleVars: construireStyleVariablesMenu(etat.menu)
  };
}