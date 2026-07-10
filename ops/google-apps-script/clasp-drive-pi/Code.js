const DEFAULT_ROOT_FOLDER_ID = "18kyuQLL-sbTc0qgP2Z8SCldDthKqKZV6";
const DEFAULT_ADOPS_API_BASE_URL = "https://adops-api.codigo5.com.br";

function configureDrivePiMonitor(config) {
  if (!config || !config.opsApiToken) throw new Error("Informe config.opsApiToken.");
  const props = PropertiesService.getScriptProperties();
  props.setProperty("OPS_API_TOKEN", config.opsApiToken);
  props.setProperty("ROOT_FOLDER_ID", config.rootFolderId || DEFAULT_ROOT_FOLDER_ID);
  props.setProperty("ADOPS_API_BASE_URL", config.adopsApiBaseUrl || DEFAULT_ADOPS_API_BASE_URL);
  return {
    ok: true,
    rootFolderId: props.getProperty("ROOT_FOLDER_ID"),
    adopsApiBaseUrl: props.getProperty("ADOPS_API_BASE_URL"),
    hasOpsApiToken: Boolean(props.getProperty("OPS_API_TOKEN")),
  };
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action ? String(e.parameter.action) : "status";
  let result;

  if (action === "install") {
    installDrivePiMonitor();
    result = getDrivePiMonitorStatus_();
    result.action = "install";
  } else if (action === "scan") {
    scanDrivePiFolder();
    result = getDrivePiMonitorStatus_();
    result.action = "scan";
  } else {
    result = getDrivePiMonitorStatus_();
    result.action = "status";
  }

  return ContentService
    .createTextOutput(JSON.stringify(result, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

function installDrivePiMonitor() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("ROOT_FOLDER_ID")) props.setProperty("ROOT_FOLDER_ID", DEFAULT_ROOT_FOLDER_ID);
  if (!props.getProperty("ADOPS_API_BASE_URL")) props.setProperty("ADOPS_API_BASE_URL", DEFAULT_ADOPS_API_BASE_URL);
  primeDrivePiMonitorBaseline();

  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "scanDrivePiFolder")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger("scanDrivePiFolder")
    .timeBased()
    .everyMinutes(5)
    .create();
}

function getDrivePiMonitorStatus_() {
  const props = PropertiesService.getScriptProperties();
  const triggers = ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "scanDrivePiFolder");

  return {
    ok: true,
    rootFolderId: props.getProperty("ROOT_FOLDER_ID"),
    adopsApiBaseUrl: props.getProperty("ADOPS_API_BASE_URL"),
    hasOpsApiToken: Boolean(props.getProperty("OPS_API_TOKEN")),
    baselineAt: props.getProperty("BASELINE_AT"),
    baselineItemCount: props.getProperty("BASELINE_ITEM_COUNT"),
    scanTriggerCount: triggers.length,
  };
}

function primeDrivePiMonitorBaseline() {
  const props = PropertiesService.getScriptProperties();
  const rootFolderId = props.getProperty("ROOT_FOLDER_ID") || DEFAULT_ROOT_FOLDER_ID;
  const root = DriveApp.getFolderById(rootFolderId);
  const count = primeDrivePiFolder_(root, props);
  props.setProperty("BASELINE_AT", new Date().toISOString());
  props.setProperty("BASELINE_ITEM_COUNT", String(count));
}

function uninstallDrivePiMonitor() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "scanDrivePiFolder")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
}

function scanDrivePiFolder() {
  const props = PropertiesService.getScriptProperties();
  const rootFolderId = props.getProperty("ROOT_FOLDER_ID") || DEFAULT_ROOT_FOLDER_ID;
  const apiBaseUrl = (props.getProperty("ADOPS_API_BASE_URL") || DEFAULT_ADOPS_API_BASE_URL).replace(/\/$/, "");
  const token = props.getProperty("OPS_API_TOKEN");
  if (!token) throw new Error("Configure OPS_API_TOKEN em Script Properties.");

  const root = DriveApp.getFolderById(rootFolderId);
  const events = [];
  walkDrivePiFolder_(root, "", events, props);

  events.forEach((event) => postDrivePiEvent_(apiBaseUrl, token, event));
  props.setProperty("LAST_SCAN_AT", new Date().toISOString());
  props.setProperty("LAST_SCAN_EVENT_COUNT", String(events.length));
}

function primeDrivePiFolder_(folder, props) {
  let count = 0;
  const folderEvent = buildDrivePiEvent_(folder, "", "folder");
  props.setProperty(`seen:${folderEvent.driveFileId}`, folderEvent.modifiedTime);
  count += 1;

  const files = folder.getFiles();
  while (files.hasNext()) {
    const fileEvent = buildDrivePiEvent_(files.next(), "", "file");
    props.setProperty(`seen:${fileEvent.driveFileId}`, fileEvent.modifiedTime);
    count += 1;
  }

  const folders = folder.getFolders();
  while (folders.hasNext()) {
    count += primeDrivePiFolder_(folders.next(), props);
  }
  return count;
}

function walkDrivePiFolder_(folder, parentPath, events, props) {
  const currentPath = `${parentPath}/${folder.getName()}`.replace(/\/+/g, "/");
  const folderEvent = buildDrivePiEvent_(folder, currentPath, "folder");
  collectDrivePiEventIfChanged_(folderEvent, events, props);

  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const filePath = `${currentPath}/${file.getName()}`.replace(/\/+/g, "/");
    collectDrivePiEventIfChanged_(buildDrivePiEvent_(file, filePath, "file"), events, props);
  }

  const folders = folder.getFolders();
  while (folders.hasNext()) {
    walkDrivePiFolder_(folders.next(), currentPath, events, props);
  }
}

function buildDrivePiEvent_(item, path, kind) {
  const id = item.getId();
  const modifiedTime = item.getLastUpdated().toISOString();
  const mimeType = kind === "folder" ? "application/vnd.google-apps.folder" : item.getMimeType();
  return {
    eventId: `drive:${id}:${modifiedTime}`,
    driveFileId: id,
    name: item.getName(),
    mimeType,
    path,
    parentFolderId: resolveParentFolderId_(item),
    modifiedTime,
    webViewLink: item.getUrl(),
    eventType: kind === "folder" ? "folder_updated" : "updated",
  };
}

function resolveParentFolderId_(item) {
  const parents = item.getParents();
  return parents.hasNext() ? parents.next().getId() : null;
}

function collectDrivePiEventIfChanged_(event, events, props) {
  const key = `seen:${event.driveFileId}`;
  const previousModifiedTime = props.getProperty(key);
  if (previousModifiedTime === event.modifiedTime) return;

  event.eventType = previousModifiedTime
    ? event.eventType
    : event.eventType === "folder_updated"
      ? "folder_created"
      : "created";
  events.push(event);
  props.setProperty(key, event.modifiedTime);
}

function postDrivePiEvent_(apiBaseUrl, token, event) {
  const response = UrlFetchApp.fetch(`${apiBaseUrl}/api/ops/drive-pi-events`, {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    payload: JSON.stringify(event),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(`Falha ao enviar evento ${event.eventId}: HTTP ${status} ${response.getContentText()}`);
  }
}
