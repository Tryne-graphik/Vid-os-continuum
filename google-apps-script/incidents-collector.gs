/**
 * Vidéo Continuum - collecteur d'incidents (bouton "Signaler un probleme"
 * du userscript). Meme principe que l'assistant Diablo IV
 * (E:\DiabloIV-Assistant\google-apps-script\feedback-collector.gs), mais
 * un deploiement SEPARE : on ne touche pas a celui de Diablo, qui marche.
 *
 * Chaque POST {action:"incident", ...} ajoute une ligne a la feuille
 * "Incidents" (creee au 1er envoi, avec en-tete + liste deroulante de
 * statut pour gerer le suivi directement dans le tableau).
 *
 * Configuration :
 *   1. Cree un Google Sheet (sheets.new), copie son ID dans l'URL :
 *      https://docs.google.com/spreadsheets/d/CET_ID_ICI/edit
 *   2. Colle cet ID a la place de "PASTE_YOUR_GOOGLE_SHEET_ID_HERE"
 *      UNIQUEMENT dans l'editeur Apps Script en ligne - jamais dans ce
 *      fichier committe (depot GitHub public).
 *
 * Deploiement (projet autonome sur script.google.com) :
 *   1. Coller ce fichier dans Code.gs (remplace tout le contenu).
 *   2. Deployer > Nouveau deploiement > Type "Application Web".
 *      - Executer en tant que : Moi
 *      - Qui a acces : Tout le monde
 *   3. Autoriser l'acces quand Google le demande.
 *   4. Copier l'URL generee (finit par /exec) -> INCIDENTS_ENDPOINT_URL
 *      dans le userscript.
 *
 * Apres TOUTE modification : Deployer > Gerer les deploiements > crayon >
 * Nouvelle version. Editer le code seul ne suffit pas.
 *
 * SHARED_SECRET peut rester en clair : le userscript public contient la
 * meme valeur. Il ecarte les bots generiques ; le vrai garde-fou est le
 * quota journalier ci-dessous.
 */
var SHEET_ID = "PASTE_YOUR_GOOGLE_SHEET_ID_HERE";
var SHARED_SECRET = "c9322995-95ba-4fca-a51f-1d67abd6ea96";
var SHEET_NAME = "Incidents";
var HEADER = ["Date", "Statut", "Type", "Site", "Anime", "Episode", "Description", "Version", "Navigateur", "Page", "Etat lecteur", "Notes"];
var STATUSES = ["Nouveau", "En cours", "Resolu", "Ignore"];
var MAX_LENGTHS = { type: 40, site: 60, anime: 200, episode: 20, description: 4000, version: 20, browser: 300, page: 500, playerStatus: 300 };
var DAILY_QUOTA = 200;

function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return jsonResponse({ status: "error", message: "bad json" }); }
  if (data.secret !== SHARED_SECRET) return jsonResponse({ status: "error", message: "unauthorized" });
  if (!checkAndConsumeQuota()) return jsonResponse({ status: "error", message: "quota exceeded" });

  var sheet = getOrCreateSheet();
  sheet.appendRow([
    new Date(),
    STATUSES[0],
    cap(data.type, MAX_LENGTHS.type),
    cap(data.site, MAX_LENGTHS.site),
    cap(data.anime, MAX_LENGTHS.anime),
    cap(data.episode, MAX_LENGTHS.episode),
    cap(data.description, MAX_LENGTHS.description),
    cap(data.version, MAX_LENGTHS.version),
    cap(data.browser, MAX_LENGTHS.browser),
    cap(data.page, MAX_LENGTHS.page),
    cap(data.playerStatus, MAX_LENGTHS.playerStatus),
    ""
  ]);
  return jsonResponse({ status: "ok", id: sheet.getLastRow() });
}

function doGet() {
  return ContentService.createTextOutput("Vidéo Continuum - endpoint incidents OK");
}

function checkAndConsumeQuota() {
  var props = PropertiesService.getScriptProperties();
  var key = "quota_incident_" + new Date().toISOString().slice(0, 10);
  var count = parseInt(props.getProperty(key) || "0", 10);
  if (count >= DAILY_QUOTA) return false;
  props.setProperty(key, String(count + 1));
  return true;
}

function getOrCreateSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADER.length).setFontWeight("bold");
    // Liste deroulante sur toute la colonne Statut (hors en-tete).
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build();
    sheet.getRange(2, 2, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
  }
  return sheet;
}

function cap(value, maxLen) {
  var s = String(value == null ? "" : value).slice(0, maxLen);
  // 2026-10-01 anti-injection de formule : Sheets interprete un texte
  // commencant par = + - @ comme une formule (ex. IMPORTXML/HYPERLINK qui
  // fait sortir des donnees de la feuille). L'apostrophe force le texte et
  // n'est pas stockee dans la valeur (getValues la renvoie sans).
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
