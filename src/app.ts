import { AcpClientPool } from "./runtime/clientPool";
import { ReaderPanel } from "./runtime/readerPanel";
import { ZoteroPrefs } from "./runtime/prefs";

const PANE_ID = "zotero-acpchat-reader";
const PLUGIN_ID = "zotero-acpchat@example.com";

export class App {
  private readonly prefs = new ZoteroPrefs();
  private readonly clients = new AcpClientPool();
  private readonly readerPanel = new ReaderPanel(this.prefs, this.clients);
  private rootURI = "";
  private registered = false;

  async startup({ id, rootURI }: { id: string; version: string; rootURI: string }): Promise<void> {
    this.rootURI = rootURI;
    Zotero.debug("ACP Sidebar Chat: startup");

    Zotero.PreferencePanes.register({
      pluginID: id,
      src: `${rootURI}preferences.xhtml`,
      label: "ACP Chat",
      image: `${rootURI}content/icons/acpchat.svg`,
      scripts: [`${rootURI}content/preferences.js`]
    });

    this.addToAllWindows();
    this.registerReaderSection(id);
  }

  shutdown(): void {
    Zotero.debug("ACP Sidebar Chat: shutdown");
    if (this.registered) {
      Zotero.ItemPaneManager.unregisterSection(PANE_ID);
      this.registered = false;
    }
    this.clients.closeAll();
    this.removeFromAllWindows();
  }

  addToWindow(win: any): void {
    const doc = win.document;
    if (!doc || doc.getElementById("zotero-acpchat-stylesheet")) {
      return;
    }

    win.MozXULElement?.insertFTLIfNeeded?.("zotero-acpchat.ftl");

    const link = doc.createElement("link");
    link.id = "zotero-acpchat-stylesheet";
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = `${this.rootURI}content/acpchat.css`;
    doc.documentElement.append(link);
  }

  removeFromWindow(win: any): void {
    win.document?.getElementById("zotero-acpchat-stylesheet")?.remove();
  }

  private addToAllWindows(): void {
    for (const win of Zotero.getMainWindows()) {
      if (win.ZoteroPane) {
        this.addToWindow(win);
      }
    }
  }

  private removeFromAllWindows(): void {
    for (const win of Zotero.getMainWindows()) {
      if (win.ZoteroPane) {
        this.removeFromWindow(win);
      }
    }
  }

  private registerReaderSection(pluginID: string): void {
    Zotero.ItemPaneManager.registerSection({
      paneID: PANE_ID,
      pluginID,
      header: {
        l10nID: "zotero-acpchat-section-title",
        icon: `${this.rootURI}content/icons/acpchat.svg`
      },
      sidenav: {
        l10nID: "zotero-acpchat-section-sidenav-tooltip",
        icon: `${this.rootURI}content/icons/acpchat.svg`
      },
      onItemChange: ({ tabType, setEnabled }: any) => {
        setEnabled(tabType === "reader");
        return true;
      },
      onRender: ({ body, item }: any) => {
        this.readerPanel.render({ body, item });
      }
    });
    this.registered = true;
  }
}

export { PLUGIN_ID };
