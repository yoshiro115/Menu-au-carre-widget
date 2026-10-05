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
//     Icone (pièce jointe).
//   - "Widget" (une ligne par lien) : Titre (texte), Url (texte).
//
// L'identification de la personne connectée (pour un éventuel contrôle
// d'accès par rôle) reste propre à chaque widget — ce fichier ne s'occupe
// que du bandeau et de son menu déroulant.
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

// -- Table "Menu" (logo, titre, icône burger) ----------------------------
// Chargement paresseux au premier rendu (comme togglePortailLogiqueV2
// ci-dessous) : pas de dépendance à un hook de cycle de vie du moteur
// x-dc dont le nom n'a pas été vérifié (voir section 8, piège n°8).
// Chaque widget appelle ça depuis SA PROPRE méthode, par ex. dans
// renderVals() :
//   if (!this.state.menu && !this.state.menuChargement && !this.state.menuErreur) {
//     chargerMenuLogique(this.state, patch => this.setState(patch));
//   }
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
      menu: { titre: table.Titre[i] || "" },
      menuLogoUrl,
      menuIconeUrl,
      menuChargement: false
    });
  } catch (e) {
    // Une table Menu absente/en erreur ne doit jamais bloquer le widget
    // (section 11 du contexte projet) : le bandeau retombe sur un titre
    // vide et une icône de repli (voir calculerPortailRenderValsV2).
    appliquerEtat({ menuChargement: false, menuErreur: true });
  }
}

// -- Table "Widget" (liens du menu déroulant) ----------------------------
// Chaque widget appelle ça depuis SA PROPRE méthode togglePortail(), qui
// lui fournit son état actuel et sa propre fonction setState :
//   async togglePortail() {
//     await togglePortailLogiqueV2(this.state, patch => this.setState(patch));
//   }
// Charge la liste une seule fois, à la première ouverture — pas à chaque
// clic, pour ne pas re-solliciter le document inutilement.
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
      url: table.Url[i]
    }));
    appliquerEtat({ portailOutils: outils, portailChargement: false });
  } catch (e) {
    appliquerEtat({ portailChargement: false, portailErreur: true });
  }
}

// Chaque widget étale le résultat dans son propre renderVals(), à côté de
// ses propres valeurs :
//   return {
//     ...calculerPortailRenderValsV2(s, () => this.togglePortail()),
//     /* le reste, propre au widget */
//   };
function calculerPortailRenderValsV2(etat, onTogglePortailFn) {
  return {
    portailOuvert: etat.portailOuvert,
    portailOuvertAttr: etat.portailOuvert ? "true" : "false",
    portailChargement: etat.portailChargement,
    portailErreur: etat.portailErreur,
    portailOutils: etat.portailOutils,
    onTogglePortail: onTogglePortailFn,
    menuTitre: etat.menu ? etat.menu.titre : "",
    menuLogoUrl: etat.menuLogoUrl,
    menuLogoDisponible: !!etat.menuLogoUrl,
    menuIconeUrl: etat.menuIconeUrl,
    menuIconeDisponible: !!etat.menuIconeUrl,
    menuChargement: etat.menuChargement,
    menuErreur: etat.menuErreur
  };
}