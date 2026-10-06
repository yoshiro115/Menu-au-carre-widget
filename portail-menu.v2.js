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
//     Icone (pièce jointe), + colonnes visuelles optionnelles.
//     Couleurs (section 15, étendue section 21) : CouleurFond, CouleurTexte,
//     CouleurBordure, CouleurSurvol, CouleurAccent — texte, hex ou vide.
//     CouleurFondSousMenu, CouleurTexteSousMenu (section 21, facultatives) :
//     couleurs INDÉPENDANTES pour le menu déroulant (sous-menu) — si vides,
//     retombent sur CouleurFond/CouleurTexte (comportement d'avant,
//     couleurs partagées entre le bandeau et le sous-menu).
//     CouleurTexteTitre (section 21.5, facultative) : couleur INDÉPENDANTE
//     du titre uniquement — si vide, retombe sur CouleurTexte (comportement
//     d'avant, titre de la même couleur que le reste du texte du bandeau).
//     Police (section 18, étendue section 19, CORRIGÉE section 22) :
//     PoliceTitre (texte, ex. "Georgia, serif" — le nom CSS, utilisé tel
//     quel ; appliquée directement en JS, pas via menuStyleVars, car un nom
//     de police contient presque toujours une virgule — voir section 22) ;
//     TaillePoliceTitre
//     (texte ou nombre, ex. "20" ou "20px") ; GraisseTitre (texte ou
//     nombre, ex. "700" ou "bold") ; LienGoogleFontsTitre (texte,
//     facultatif, section 19 — l'URL complète d'une feuille de style
//     Google Fonts, ex. "https://fonts.googleapis.com/css2?family=Playfair
//     +Display:wght@700&display=swap" : chargée automatiquement dans la
//     page si remplie, pour que PoliceTitre soit garantie disponible sans
//     dépendre des polices déjà installées chez la personne qui regarde
//     le widget).
//     Alignement du titre (section 20) : AlignementTitre (Choice — choix
//     simple, pas Choice List — "Gauche"/"Centre"/"Droite", facultatif,
//     repli "Centre" comme avant si vide/absente/non reconnue).
//     Dégradé de fond (section 18, corrigé section 21) : CouleurFondDegrade
//     (texte, hex ou vide — 2e couleur du dégradé, la 1re étant CouleurFond)
//     et DirectionDegrade (texte, ex. "to right", "135deg" — optionnelle,
//     repli "to right" si CouleurFondDegrade est rempli mais pas la
//     direction).
//     Bordure / arrondi / ombre du bandeau (section 18) :
//     BordureDesactivee (Toggle — coché = bandeau SANS bordure du tout,
//     décoché/absent = bordure normale, comme avant), EpaisseurBordure
//     (texte ou nombre, ex. "1.5" ou "1.5px"), ArrondiBandeau (texte ou
//     nombre, ex. "8" ou "8px" — coins arrondis du bandeau et du menu
//     déroulant), OmbreActive (Toggle — coché = ombre portée sous le
//     bandeau, décoché/absent = pas d'ombre, comme avant).
//     OmbreSousMenuDesactivee (Toggle, section 21.6, facultative) : coché
//     = retire l'ombre décalée fixe du sous-menu (menu déroulant) ;
//     décoché/absent = ombre du sous-menu normale, comme avant.
//     Totalement indépendante de OmbreActive, qui ne pilote QUE le
//     bandeau.
//   - "Widget" (une ligne par lien) : Titre (texte), Url (texte), Role
//     (Choice List — choix multiple, optionnelle, section 15) : si vide,
//     le lien est visible par tout le monde ; sinon seulement par les
//     rôles cochés. NouvelOnglet (Toggle, section 18, CORRIGÉ section 22) :
//     coché = ouvre dans un nouvel onglet ("_blank"), décoché/absent =
//     même onglet du navigateur (par défaut) — cible désormais "_top" et
//     non "_self" (voir section 22 : le widget vit dans une iframe Grist,
//     "_self" ne naviguait que CETTE iframe, jamais le véritable onglet du
//     navigateur).
//     IconeLien (pièce jointe, section 18, facultative) : icône affichée
//     devant le nom du lien dans le menu déroulant. Inactif (Toggle,
//     section 18) : coché = lien masqué du menu déroulant,
//     décoché/absent = lien visible (comme avant — nom inversé
//     volontairement, voir plus bas). Ordre (nombre, section 18,
//     facultatif) : position d'affichage du lien dans le menu déroulant,
//     du plus petit au plus grand ; les liens sans Ordre renseigné
//     gardent l'ordre de la table, à la suite des liens ordonnés.
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

// -- Pièces jointes (colonnes Logo / Icone / IconeLien) ------------------
// Une colonne "Attachment" renvoie, via fetchTable, une liste encodée
// ["L", id1, id2, ...] (parfois un tableau nu selon la version de Grist) :
// on ne garde que le premier identifiant (un seul fichier attendu par
// ligne, que ce soit Logo, Icone ou IconeLien).
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

// -- Valeurs texte/nombre facultatives (police, tailles, épaisseurs…) ----
// Ces colonnes peuvent être remplies en nombre (ex. 20) ou en texte avec
// unité (ex. "20px") selon ce que l'humain tape dans Grist. On normalise
// en ajoutant "px" seulement si c'est un nombre pur, pour rester une
// valeur CSS utilisable telle quelle dans tous les cas.
function valeurCssAvecPx(valeurCellule) {
  if (valeurCellule === undefined || valeurCellule === null || valeurCellule === "") return "";
  const brut = String(valeurCellule).trim();
  if (brut === "") return "";
  return /^-?\d+(\.\d+)?$/.test(brut) ? `${brut}px` : brut;
}

// -- Chargement dynamique d'une police Google Fonts (section 19) --------
// Injecte un <link rel="stylesheet"> vers l'URL fournie dans la colonne
// "LienGoogleFontsTitre" de la table "Menu", s'il n'est pas déjà présent
// (évite les doublons si la fonction est appelée plusieurs fois). Ça rend
// PoliceTitre fiable même si la police n'est pas déjà installée chez la
// personne qui regarde le widget — exactement le même principe que la
// balise <link href="https://fonts.googleapis.com/..."> déjà posée en dur
// dans le <head> de chaque widget pour Montserrat (voir section 4), sauf
// que celle-ci est posée dynamiquement, au moment du chargement du menu,
// à partir de ce que l'humain a tapé dans la table — aucune police
// supplémentaire à coder en dur dans les widgets.
//
// Validation volontairement simple : on exige juste une URL "https://"
// (pas uniquement un domaine Google Fonts) pour rester utilisable avec
// d'autres fournisseurs de polices web qui donnent aussi un lien de
// feuille de style (ex. Adobe Fonts) — l'important est que ce soit une
// VRAIE URL de feuille de style, jamais un chemin local ni du code.
function chargerPolicePersonnalisee(url) {
  if (!url || typeof url !== "string") return;
  const urlPropre = url.trim();
  if (!/^https:\/\//i.test(urlPropre)) return;
  // Pas de doublon si déjà injecté (ex. si le hook de montage est rappelé).
  const dejaPresent = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .some(lien => lien.href === urlPropre);
  if (dejaPresent) return;
  const lien = document.createElement("link");
  lien.rel = "stylesheet";
  lien.href = urlPropre;
  document.head.appendChild(lien);
}

// -- Application directe de la police du titre (CORRIGÉ section 22) -----
// Colonne "PoliceTitre" de la table "Menu" (section 18.2) : un nom CSS de
// police PRESQUE TOUJOURS composé de plusieurs noms séparés par des
// virgules (ex. "Georgia, serif", "Playfair Display, serif") — exactement
// le même piège que le dégradé de fond (section 21.1/21.2) : une valeur
// contenant une virgule, empaquetée dans la chaîne unique posée sur
// style="{{ menuStyleVars }}" par le moteur dc-runtime, casse
// l'interpolation (confirmé pour le dégradé ; la police n'avait jamais
// été testée en conditions réelles jusqu'ici, section 18.2 — elle avait
// donc exactement le même défaut latent, jamais vu tant que personne
// n'avait essayé de changer la police).
//
// Correctif : comme pour chargerPolicePersonnalisee ci-dessus, on pose la
// variable --pm-police directement en JavaScript (document.documentElement
// .style.setProperty), un effet de bord sur le DOM qui ne passe jamais par
// la chaîne interpolée de dc-runtime — donc jamais soumis au même risque,
// quel que soit le nombre de virgules dans la valeur. --pm-police n'est
// PLUS posée par construireStyleVariablesMenu (voir plus bas).
function appliquerPoliceTitre(policeTitre) {
  if (!policeTitre || typeof policeTitre !== "string") return;
  document.documentElement.style.setProperty("--pm-police", policeTitre.trim());
}

// -- Normalisation de l'alignement du titre (section 20) -----------------
// Colonne "AlignementTitre" de la table "Menu" : une Choice column (choix
// simple), qui renvoie directement la chaîne choisie via fetchTable — pas
// de décodage "L" comme pour une Choice List (plusieurs choix, utilisée
// pour "Role" sur la table "Widget", voir listeValeursChoix ci-dessus).
// Accepte indifféremment la casse et les mots anglais/français ; toute
// valeur vide ou non reconnue renvoie "" (chaîne vide), ce qui laisse la
// variable CSS --pm-titre-align non posée et retombe sur le repli "center"
// — exactement le rendu d'avant.
function normaliserAlignementTitre(valeur) {
  if (!valeur || typeof valeur !== "string") return "";
  const v = valeur.trim().toLowerCase();
  if (v === "gauche" || v === "left") return "left";
  if (v === "droite" || v === "right") return "right";
  if (v === "centre" || v === "center") return "center";
  return "";
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
// Toutes les colonnes visuelles ci-dessous sont optionnelles et
// facultatives par cellule : une colonne absente de la table, ou une
// cellule vide, ne change rien au rendu existant (voir
// construireStyleVariablesMenu et le repli --ac-* dans
// portail-menu.v2.css).
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
    // Effet de bord volontaire (pas un setState) : injecte la police
    // personnalisée dans le <head> si la colonne est remplie (section 19).
    // Fait une seule fois ici, pas à chaque rendu, puisque chargerMenuLogique
    // lui-même n'est appelé qu'une fois par la garde en tête de fonction.
    chargerPolicePersonnalisee(table.LienGoogleFontsTitre?.[i]);
    // Effet de bord volontaire également (section 22) : pose --pm-police
    // directement sur le DOM plutôt que via menuStyleVars, car un nom de
    // police contient presque toujours une virgule (voir le commentaire
    // de la fonction). Fait ici, une seule fois, pour la même raison que
    // chargerPolicePersonnalisee ci-dessus.
    appliquerPoliceTitre(table.PoliceTitre?.[i]);
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
        couleurAccent: table.CouleurAccent?.[i] || "",
        // Couleurs indépendantes du sous-menu (section 21) — vides par
        // défaut, ce qui fait retomber construireStyleVariablesMenu sur
        // CouleurFond/CouleurTexte (comportement partagé d'avant).
        couleurFondSousMenu: table.CouleurFondSousMenu?.[i] || "",
        couleurTexteSousMenu: table.CouleurTexteSousMenu?.[i] || "",
        // Couleur dédiée au titre (section 21.5) — indépendante de
        // CouleurTexte (qui reste le repli si celle-ci est vide).
        couleurTexteTitre: table.CouleurTexteTitre?.[i] || "",
        // Police du titre (section 18).
        policeTitre: table.PoliceTitre?.[i] || "",
        taillePoliceTitre: valeurCssAvecPx(table.TaillePoliceTitre?.[i]),
        graisseTitre: table.GraisseTitre?.[i] ? String(table.GraisseTitre[i]).trim() : "",
        // Lien Google Fonts (ou équivalent) pour charger PoliceTitre
        // automatiquement (section 19) — gardé dans l'état pour mémoire,
        // mais le chargement lui-même (effet de bord sur le <head>) est
        // déclenché juste en dessous, pas ici.
        lienGoogleFontsTitre: table.LienGoogleFontsTitre?.[i] || "",
        // Alignement du titre (section 20) : "" si vide/absente/non
        // reconnue, ce qui laisse le repli CSS "center" s'appliquer.
        alignementTitre: normaliserAlignementTitre(table.AlignementTitre?.[i]),
        // Dégradé de fond du bandeau (section 18) : 2e couleur + direction,
        // la 1re couleur étant couleurFond ci-dessus.
        couleurFondDegrade: table.CouleurFondDegrade?.[i] || "",
        directionDegrade: table.DirectionDegrade?.[i] || "",
        // Bordure / arrondi / ombre du bandeau (section 18). Toggle Grist =
        // booléen direct (pas de décodage "L").
        bordureDesactivee: !!table.BordureDesactivee?.[i],
        epaisseurBordure: valeurCssAvecPx(table.EpaisseurBordure?.[i]),
        arrondiBandeau: valeurCssAvecPx(table.ArrondiBandeau?.[i]),
        ombreActive: !!table.OmbreActive?.[i],
        // Section 21.6 — le sous-menu a TOUJOURS eu sa propre ombre portée
        // fixe (l'effet "décalé" 4px/4px, hérité de la v1), totalement
        // indépendante de OmbreActive (qui ne pilote que le bandeau) :
        // --pm-ombre n'est référencée nulle part dans la règle CSS du
        // sous-menu. OmbreSousMenuDesactivee permet de la retirer si elle
        // n'est pas souhaitée, sans toucher à OmbreActive ni à aucune autre
        // variable partagée. Nom inversé volontaire (même raison que
        // BordureDesactivee/Inactif) : décoché/absent = ombre du sous-menu
        // normale, comme avant.
        ombreSousMenuDesactivee: !!table.OmbreSousMenuDesactivee?.[i]
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
//
// Colonnes facultatives ajoutées section 18 (2026-10-06) :
//   - IconeLien (pièce jointe) : icône par lien, résolue en URL comme le
//     Logo/l'Icone du bandeau.
//   - Inactif (Toggle) : nom délibérément inversé par rapport à "Actif".
//     Un Toggle Grist non rempli vaut `false` — si la colonne s'appelait
//     "Actif", un lien existant deviendrait invisible dès que la colonne
//     est ajoutée à la table, avant même que l'humain ait eu le temps de
//     la cocher pour ses lignes existantes (même piège que NouvelOnglet
//     et BordureDesactivee, voir section 11 et section 18). Avec
//     "Inactif", l'absence de case cochée (valeur par défaut `false`)
//     veut dire "pas inactif" = visible, donc aucune régression.
//   - Ordre (nombre) : position d'affichage. Les lignes sans Ordre
//     renseigné (vide/undefined) gardent l'ordre naturel de la table, à
//     la suite des lignes ordonnées — tri stable par (ordre, index
//     d'origine).
async function togglePortailLogiqueV2(etatActuel, appliquerEtat) {
  const ouverture = !etatActuel.portailOuvert;
  appliquerEtat({ portailOuvert: ouverture });
  if (!ouverture) return; // vient de se fermer, rien à charger
  if (etatActuel.portailOutils.length > 0 || etatActuel.portailErreur) return; // déjà chargé (ou déjà tenté)
  appliquerEtat({ portailChargement: true, portailErreur: false });
  try {
    const table = await grist.docApi.fetchTable("Widget");
    const lignes = table.id || [];

    // Icônes par lien : une seule requête d'accès pour toutes, en parallèle.
    const idsIcones = lignes.map((id, i) => premierIdPieceJointe(table.IconeLien?.[i]));
    const urlsIcones = await Promise.all(idsIcones.map(id => urlPieceJointe(id)));

    const outilsBruts = lignes.map((id, i) => ({
      nom: table.Titre[i],
      url: table.Url[i],
      // Colonne facultative : absente de la table ("Role" non créée
      // encore) → table.Role est undefined → roles: [] → visible par tout
      // le monde (voir filtrerOutilsParRole).
      roles: listeValeursChoix(table.Role?.[i]),
      // Colonne facultative "NouvelOnglet" (Toggle, section 18) : absente
      // de la table ou décochée → même onglet par défaut (demandé par
      // l'humain). Cochée → nouvel onglet, comme avant.
      //
      // CORRIGÉ section 22 : "_self" cible le cadre COURANT, pas l'onglet
      // du navigateur — or le widget vit lui-même dans une iframe Grist.
      // Avec target="_self", le lien ne fait que naviguer CETTE iframe (le
      // petit cadre du widget), jamais la vraie page/onglet du navigateur :
      // vu de l'utilisateur, ça ne "marche pas" (rien ne semble se passer
      // au bon endroit), ce qui peut expliquer que seuls les liens en
      // target="_blank" semblaient "fonctionner" (nouvel onglet, le seul
      // des deux qui sort réellement de l'iframe). "_top" cible le cadre
      // RACINE de tout l'onglet du navigateur : c'est la bonne valeur pour
      // "même onglet" quand on est dans une iframe imbriquée.
      targetAttr: table.NouvelOnglet?.[i] ? "_blank" : "_top",
      // Icône par lien (section 18) — null si IconeLien absente/vide.
      iconeUrl: urlsIcones[i],
      iconeDisponible: !!urlsIcones[i],
      // "Inactif" coché = masqué (voir commentaire au-dessus de la
      // fonction pour le choix du nom inversé).
      inactif: !!table.Inactif?.[i],
      // Ordre d'affichage facultatif — undefined/vide = pas de préférence.
      ordre: table.Ordre?.[i],
      _indexOrigine: i
    }));

    // Masque les liens Inactif avant tout tri/filtrage ultérieur.
    const outilsActifs = outilsBruts.filter(o => !o.inactif);

    // Tri stable : lignes avec Ordre renseigné d'abord (croissant), puis
    // les autres dans leur ordre d'origine dans la table.
    outilsActifs.sort((a, b) => {
      const aOrdre = (a.ordre === undefined || a.ordre === null || a.ordre === "");
      const bOrdre = (b.ordre === undefined || b.ordre === null || b.ordre === "");
      if (aOrdre && bOrdre) return a._indexOrigine - b._indexOrigine;
      if (aOrdre) return 1; // a sans ordre passe après b qui en a un
      if (bOrdre) return -1;
      return Number(a.ordre) - Number(b.ordre) || a._indexOrigine - b._indexOrigine;
    });

    const outils = outilsActifs.map(({ _indexOrigine, inactif, ordre, ...reste }) => reste);

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
// renseignées — portail-menu.v2.css prévoit un repli
// var(--pm-xxx, var(--ac-xxx)) pour chacune (ou une valeur fixe raisonnable
// pour les nouvelles variables sans équivalent --ac-*), donc une case vide
// ou une colonne absente ne change rien au rendu existant.
//
// Dégradé de fond (section 18, CORRIGÉ section 21) : si CouleurFondDegrade
// est rempli, on pose trois variables ATOMIQUES (une couleur de départ,
// une couleur d'arrivée, une direction) plutôt qu'une seule variable
// contenant la fonction CSS complète `linear-gradient(direction, c1, c2)`.
// Raison du changement : la toute première version posait directement
// --pm-header-fond: linear-gradient(to right, #00FFFF, #FFFFFF) dans la
// chaîne packée menuStyleVars — une valeur contenant des VIRGULES à
// l'intérieur d'une seule déclaration CSS. Testé en conditions réelles
// (section 21) : le bandeau restait blanc au lieu d'afficher le dégradé,
// alors que les variables SANS virgule (couleurs simples, alignement...)
// fonctionnaient très bien. Le moteur x-dc (dc-runtime) semble donc mal
// gérer une valeur de variable CSS contenant une virgule à l'intérieur de
// l'attribut `style="{{ menuStyleVars }}"` interpolé globalement. Le
// correctif déplace la fonction `linear-gradient(...)` elle-même dans
// portail-menu.v2.css (statique, jamais interpolée), et ne fait passer par
// menuStyleVars que des valeurs ATOMIQUES sans virgule (couleurs hex,
// mots-clés de direction comme "to right" ou angles comme "135deg").
//
// Bordure (section 18) : BordureDesactivee coché force --pm-bordure-
// epaisseur à "0" (bandeau sans bordure), quelle que soit EpaisseurBordure.
//
// Ombre (section 18) : OmbreActive coché pose une ombre portée standard
// sous le bandeau ; décoché/absent = pas d'ombre (comme avant, aucune
// variable --pm-ombre n'était posée).
function construireStyleVariablesMenu(menu) {
  if (!menu) return "";
  const variables = [];

  if (menu.couleurFond) variables.push(["--pm-fond", menu.couleurFond]);
  if (menu.couleurTexte) variables.push(["--pm-texte", menu.couleurTexte]);
  if (menu.couleurBordure) variables.push(["--pm-bordure", menu.couleurBordure]);
  if (menu.couleurSurvol) variables.push(["--pm-survol", menu.couleurSurvol]);
  if (menu.couleurAccent) variables.push(["--pm-accent", menu.couleurAccent]);

  // Couleurs indépendantes du sous-menu (section 21) — si vides, les
  // repli CSS correspondants (var(--pm-sousmenu-fond, var(--pm-fond, ...)))
  // retombent sur les couleurs du bandeau, comme avant.
  if (menu.couleurFondSousMenu) variables.push(["--pm-sousmenu-fond", menu.couleurFondSousMenu]);
  if (menu.couleurTexteSousMenu) variables.push(["--pm-sousmenu-texte", menu.couleurTexteSousMenu]);

  // Couleur dédiée au titre (section 21.5) — si vide, le repli CSS
  // (var(--pm-titre-texte, var(--pm-texte, ...))) retombe sur la couleur
  // de texte partagée, comme avant.
  if (menu.couleurTexteTitre) variables.push(["--pm-titre-texte", menu.couleurTexteTitre]);

  // Police du titre — --pm-police N'EST PLUS posée ici (section 22) :
  // menu.policeTitre contient presque toujours une virgule ("Georgia,
  // serif"), donc elle est appliquée directement sur le DOM par
  // appliquerPoliceTitre (voir chargerMenuLogique), jamais via cette
  // chaîne interpolée. Taille et graisse n'ont pas ce problème (valeurs
  // atomiques, ex. "20px", "700").
  if (menu.taillePoliceTitre) variables.push(["--pm-taille-titre", menu.taillePoliceTitre]);
  if (menu.graisseTitre) variables.push(["--pm-graisse-titre", menu.graisseTitre]);
  if (menu.alignementTitre) variables.push(["--pm-titre-align", menu.alignementTitre]);

  // Dégradé de fond — trois variables atomiques (section 21), consommées
  // par le linear-gradient() statique de portail-menu.v2.css. Seulement si
  // les deux couleurs sont disponibles (sinon --pm-fond seul suffit, comme
  // avant la section 18).
  if (menu.couleurFondDegrade && menu.couleurFond) {
    variables.push(["--pm-degrade-depart", menu.couleurFond]);
    variables.push(["--pm-degrade-arrivee", menu.couleurFondDegrade]);
    variables.push(["--pm-degrade-direction", menu.directionDegrade || "to right"]);
  }

  // Bordure / arrondi / ombre.
  if (menu.bordureDesactivee) {
    variables.push(["--pm-bordure-epaisseur", "0"]);
  } else if (menu.epaisseurBordure) {
    variables.push(["--pm-bordure-epaisseur", menu.epaisseurBordure]);
  }
  if (menu.arrondiBandeau) variables.push(["--pm-arrondi", menu.arrondiBandeau]);
  if (menu.ombreActive) variables.push(["--pm-ombre", "0 4px 10px rgba(9, 12, 11, 0.18)"]);

  // Ombre du sous-menu (section 21.6) — indépendante de --pm-ombre
  // (bandeau). Cochée → --pm-sousmenu-ombre forcé à "none" (sous-menu sans
  // ombre du tout) ; décochée/absente → variable non posée, le repli CSS
  // conserve l'ombre décalée fixe d'origine (comportement d'avant).
  if (menu.ombreSousMenuDesactivee) variables.push(["--pm-sousmenu-ombre", "none"]);

  return variables.map(([variable, valeur]) => `${variable}:${valeur}`).join(";");
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
    // Vraie négation calculée ici, à ne PAS remplacer par un deuxième
    // <sc-if value="{{ menuIconeDisponible }}" hint-placeholder-val="{{ false }}">
    // dans le gabarit : hint-placeholder-val n'a aucun effet au runtime
    // (confirmé section 14 du contexte projet), donc deux <sc-if> sur la
    // MÊME valeur s'affichent ou disparaissent toujours ENSEMBLE — jamais
    // l'un à la place de l'autre. Piège corrigé le 2026-10-06 (section 16).
    menuIconeIndisponible: !etat.menuIconeUrl,
    menuChargement: etat.menuChargement,
    menuErreur: etat.menuErreur,
    menuStyleVars: construireStyleVariablesMenu(etat.menu)
  };
}