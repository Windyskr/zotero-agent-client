var chromeHandle;
var acpChatContext;

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  await Zotero.initializationPromise;

  rootURI = rootURI || resourceURI.spec;
  var { PathUtils } = ChromeUtils.importESModule("resource://gre/modules/PathUtils.sys.mjs");
  var { IOUtils } = ChromeUtils.importESModule("resource://gre/modules/IOUtils.sys.mjs");

  var aomStartup = Components.classes[
    "@mozilla.org/addons/addon-manager-startup;1"
  ].getService(Components.interfaces.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "zotero-acpchat", rootURI + "chrome/content/"],
  ]);

  acpChatContext = {
    rootURI,
    Zotero,
    Services,
    ChromeUtils,
    PathUtils,
    IOUtils,
    Components,
  };
  acpChatContext.globalThis = acpChatContext;

  Services.scriptloader.loadSubScript(
    rootURI + "chrome/content/scripts/acpchat.js",
    acpChatContext,
  );
  await acpChatContext.startup({ id, version, rootURI });
}

async function onMainWindowLoad({ window }, reason) {
  acpChatContext?.onMainWindowLoad?.({ window });
}

async function onMainWindowUnload({ window }, reason) {
  acpChatContext?.onMainWindowUnload?.({ window });
}

function shutdown(data, reason) {
  if (typeof APP_SHUTDOWN !== "undefined" && reason === APP_SHUTDOWN) {
    return;
  }

  acpChatContext?.shutdown?.();
  acpChatContext = null;

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}

function uninstall(data, reason) {}
