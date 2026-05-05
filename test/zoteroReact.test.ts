import { assert } from "chai";
import {
  isReactDomRootModule,
  isReactRuntimeModule,
  resolveZoteroReactDom,
  resolveZoteroWindowModule,
} from "../src/modules/zoteroReact";

describe("Zotero React runtime lookup", function () {
  it("prefers modules returned by window.require", function () {
    const requiredModule = { source: "require" };
    const windowModule = { source: "window" };

    assert.strictEqual(
      resolveZoteroWindowModule(
        makeWindow({
          React: windowModule,
          require: () => requiredModule,
        }),
        "react",
        "React",
        () => ({ source: "global" }),
      ),
      requiredModule,
    );
  });

  it("falls back to window globals and injected globals", function () {
    const windowModule = { source: "window" };
    const globalModule = { source: "global" };

    assert.strictEqual(
      resolveZoteroWindowModule(
        makeWindow({ React: windowModule }),
        "react",
        "React",
        () => globalModule,
      ),
      windowModule,
    );
    assert.strictEqual(
      resolveZoteroWindowModule(
        makeWindow(),
        "react",
        "React",
        () => globalModule,
      ),
      globalModule,
    );
  });

  it("ignores failing window.require calls", function () {
    const fallback = { source: "global" };

    assert.strictEqual(
      resolveZoteroWindowModule(
        makeWindow({
          require: () => {
            throw new Error("missing module");
          },
        }),
        "react",
        "React",
        () => fallback,
      ),
      fallback,
    );
  });

  it("prefers react-dom/client when resolving ReactDOM roots", function () {
    const clientModule = { createRoot() {} };
    const legacyModule = { render() {} };

    assert.strictEqual(
      resolveZoteroReactDom(
        makeWindow({
          require: (moduleName: string) =>
            moduleName === "react-dom/client" ? clientModule : legacyModule,
        }),
      ),
      clientModule,
    );
  });

  it("falls back to react-dom when the client entry is unavailable", function () {
    const legacyModule = { createRoot() {} };

    assert.strictEqual(
      resolveZoteroReactDom(
        makeWindow({
          require: (moduleName: string) => {
            if (moduleName === "react-dom/client") {
              throw new Error("missing module");
            }
            return legacyModule;
          },
        }),
      ),
      legacyModule,
    );
  });

  it("validates React and ReactDOM module shapes", function () {
    assert.isTrue(
      isReactRuntimeModule({
        createElement() {},
        useEffect() {},
        useMemo() {},
        useRef() {},
        useState() {},
      }),
    );
    assert.isFalse(
      isReactRuntimeModule({
        createElement() {},
        useState() {},
      }),
    );
    assert.isFalse(
      isReactRuntimeModule({
        createElement() {},
        useEffect() {},
        useState() {},
      }),
    );
    assert.isTrue(isReactDomRootModule({ createRoot() {} }));
    assert.isFalse(isReactDomRootModule({ render() {} }));
  });
});

function makeWindow(values: Record<string, unknown> = {}): Window {
  return values as unknown as Window;
}
