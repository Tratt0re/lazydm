"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// electron/ipc/channels.js
var require_channels = __commonJS({
  "electron/ipc/channels.js"(exports2, module2) {
    "use strict";
    var CHANNELS = Object.freeze({
      appMeta: Object.freeze({
        create: "db:app-meta:create",
        get: "db:app-meta:get",
        list: "db:app-meta:list",
        update: "db:app-meta:update",
        remove: "db:app-meta:remove",
        upsert: "db:app-meta:upsert"
      }),
      campaigns: Object.freeze({
        list: "campaigns:list",
        get: "campaigns:get",
        create: "campaigns:create"
      }),
      cloud: Object.freeze({
        getStatus: "cloud:getStatus",
        skipWait: "cloud:skipWait",
        recheck: "cloud:recheck"
      }),
      documents: Object.freeze({
        list: "documents:list",
        read: "documents:read",
        write: "documents:write",
        saveCopy: "documents:saveCopy",
        create: "documents:create"
      }),
      index: Object.freeze({
        getStatus: "index:getStatus",
        rebuild: "index:rebuild"
      }),
      reset: Object.freeze({
        factoryReset: "db:reset:factory-reset"
      }),
      update: Object.freeze({
        check: "update:check",
        forceCheck: "update:force-check",
        openRelease: "update:open-release",
        ignoreVersion: "update:ignore-version"
      }),
      vault: Object.freeze({
        getCurrent: "vault:getCurrent",
        selectFolder: "vault:selectFolder",
        inspect: "vault:inspect",
        open: "vault:open",
        close: "vault:close"
      }),
      window: Object.freeze({
        reload: "window:reload"
      })
    });
    module2.exports = {
      CHANNELS
    };
  }
});

// electron/ipc/client.js
var require_client = __commonJS({
  "electron/ipc/client.js"(exports2, module2) {
    "use strict";
    var { CHANNELS } = require_channels();
    function createIpcClient2(invoke2) {
      const dbApi = {};
      Object.entries(CHANNELS).forEach(([resourceName, actionChannels]) => {
        const resourceApi = {};
        Object.entries(actionChannels).forEach(([actionName, channel]) => {
          resourceApi[actionName] = (payload) => invoke2(channel, payload);
        });
        dbApi[resourceName] = Object.freeze(resourceApi);
      });
      return Object.freeze(dbApi);
    }
    module2.exports = {
      createIpcClient: createIpcClient2
    };
  }
});

// package.json
var require_package = __commonJS({
  "package.json"(exports2, module2) {
    module2.exports = {
      name: "lazydm",
      version: "0.1.0",
      description: "LazyDM - Your lazy dungeon master assistant",
      author: "Tratt0re",
      repository: {
        type: "git",
        url: "https://github.com/yourusername/lazy_dm.git"
      },
      main: "electron/main.js",
      scripts: {
        ng: "ng",
        start: "ng serve",
        build: "ng build",
        "build:web": "node scripts/build-web.js",
        "build:preload": "node scripts/build-preload.js",
        "build:preload:prod": "node scripts/build-preload.js --prod",
        "build:prod": "npm run build:web && npm run build:preload:prod",
        "preload:watch": "node scripts/build-preload.js --watch",
        "build:desktop": "npm run build:prod && electron-builder --dir --publish never",
        dist: "npm run build:prod && electron-builder --publish never",
        "dist:mac": "npm run build:prod && electron-builder --mac --publish never",
        "dist:win": "npm run build:prod && electron-builder --win --x64 --publish never",
        "dist:linux": "npm run build:prod && electron-builder --linux --publish never",
        watch: "ng build --watch --configuration development",
        test: "ng test",
        postinstall: "electron-rebuild -f -w better-sqlite3",
        "electron:dev": "npm run build:preload && electronmon .",
        "electron:start": "npm run build:preload && electron .",
        "electron:prod": "npm run build:prod && electron . --prod",
        dev: 'concurrently -k "ng serve" "npm run preload:watch" "wait-on http://localhost:4200 && npm run electron:dev"'
      },
      prettier: {
        printWidth: 100,
        singleQuote: true,
        overrides: [
          {
            files: "*.html",
            options: {
              parser: "angular"
            }
          }
        ]
      },
      private: true,
      packageManager: "npm@11.8.0",
      build: {
        appId: "com.lazydm.desktop",
        productName: "LazyDM",
        icon: "src/assetts/icon/app_icon.png",
        directories: {
          output: "release",
          buildResources: "."
        },
        asar: true,
        asarUnpack: [
          "**/*.node"
        ],
        files: [
          "dist/lazydm/browser/**/*",
          "electron/**/*",
          "package.json"
        ],
        mac: {
          target: [
            "dmg",
            "zip"
          ],
          category: "public.app-category.utilities"
        },
        win: {
          icon: "src/assetts/icon/app_icon.png",
          target: [
            "nsis",
            "portable"
          ]
        },
        nsis: {
          artifactName: "lazydm-setup-${version}-${arch}.${ext}"
        },
        portable: {
          artifactName: "lazydm-portable-${version}-${arch}.${ext}"
        },
        linux: {
          target: [
            "AppImage"
          ],
          category: "Utility"
        }
      },
      dependencies: {
        "@angular/cdk": "^21.1.4",
        "@angular/common": "^21.1.0",
        "@angular/compiler": "^21.1.0",
        "@angular/core": "^21.1.0",
        "@angular/forms": "^21.1.0",
        "@angular/platform-browser": "^21.1.0",
        "@angular/router": "^21.1.0",
        "@codemirror/commands": "^6.11.1",
        "@codemirror/lang-markdown": "^6.5.2",
        "@codemirror/language": "^6.13.1",
        "@codemirror/language-data": "^6.5.2",
        "@codemirror/state": "^6.7.6",
        "@codemirror/view": "^6.43.14",
        "@ngx-translate/core": "^17.0.0",
        "@ngx-translate/http-loader": "^17.0.0",
        "better-sqlite3": "^12.6.2",
        "class-variance-authority": "^0.7.1",
        clsx: "^2.1.1",
        dompurify: "^3.4.16",
        echarts: "^6.0.0",
        "embla-carousel-angular": "^21.0.0",
        "embla-carousel-autoplay": "^8.6.0",
        "embla-carousel-class-names": "^8.6.0",
        "embla-carousel-wheel-gestures": "^8.1.0",
        exceljs: "^4.4.0",
        "lucide-angular": "^0.563.0",
        "markdown-it": "^15.0.2",
        "ngx-echarts": "^21.0.0",
        "ngx-sonner": "^3.1.0",
        rxjs: "~7.8.0",
        semver: "^7.7.4",
        "tailwind-merge": "^3.4.0",
        tslib: "^2.3.0",
        yaml: "^2.9.1"
      },
      devDependencies: {
        "@angular/build": "^21.1.4",
        "@angular/cli": "^21.1.4",
        "@angular/compiler-cli": "^21.1.0",
        "@electron/rebuild": "^4.0.3",
        "@tailwindcss/postcss": "^4.1.18",
        "@types/markdown-it": "^14.2.0",
        "@types/semver": "^7.7.1",
        concurrently: "^9.2.1",
        electron: "^40.4.0",
        "electron-builder": "^26.7.0",
        electronmon: "^2.0.4",
        jsdom: "^27.1.0",
        postcss: "^8.5.6",
        tailwindcss: "^4.1.18",
        "tailwindcss-animate": "^1.0.7",
        typescript: "~5.9.2",
        vitest: "^4.0.8",
        "wait-on": "^9.0.3"
      }
    };
  }
});

// electron/preload.js
var { contextBridge, ipcRenderer } = require("electron");
var { createIpcClient } = require_client();
var packageJson = require_package();
function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}
var ipcEventListenerStore = /* @__PURE__ */ new Map();
function getChannelListenerMap(channel) {
  if (!ipcEventListenerStore.has(channel)) {
    ipcEventListenerStore.set(channel, /* @__PURE__ */ new WeakMap());
  }
  return ipcEventListenerStore.get(channel);
}
function onIpcEvent(channel, listener) {
  if (typeof channel !== "string" || channel.trim().length === 0) {
    throw new Error("IPC event channel must be a non-empty string.");
  }
  if (typeof listener !== "function") {
    throw new Error("IPC event listener must be a function.");
  }
  const normalizedChannel = channel.trim();
  const listenerMap = getChannelListenerMap(normalizedChannel);
  if (listenerMap.has(listener)) {
    return;
  }
  const wrappedListener = (_event, payload) => listener(payload);
  listenerMap.set(listener, wrappedListener);
  ipcRenderer.on(normalizedChannel, wrappedListener);
}
function offIpcEvent(channel, listener) {
  if (typeof channel !== "string" || channel.trim().length === 0) {
    return;
  }
  if (typeof listener !== "function") {
    return;
  }
  const normalizedChannel = channel.trim();
  const listenerMap = ipcEventListenerStore.get(normalizedChannel);
  if (!listenerMap) {
    return;
  }
  const wrappedListener = listenerMap.get(listener);
  if (!wrappedListener) {
    return;
  }
  ipcRenderer.removeListener(normalizedChannel, wrappedListener);
  listenerMap.delete(listener);
}
var ipcClient = createIpcClient(invoke);
function normalizeText(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function resolveAuthorName(author) {
  if (typeof author === "string") {
    return normalizeText(author);
  }
  if (author && typeof author === "object" && "name" in author) {
    return normalizeText(author.name);
  }
  return null;
}
function resolveRepositoryUrl(repository) {
  const rawUrl = typeof repository === "string" ? repository : repository && typeof repository === "object" ? repository.url : null;
  const normalizedUrl = normalizeText(rawUrl);
  if (!normalizedUrl) {
    return null;
  }
  return normalizedUrl.replace(/^git\+/, "").replace(/\.git$/i, "");
}
var appInfo = Object.freeze({
  name: normalizeText(packageJson.build?.productName) ?? normalizeText(packageJson.name),
  version: normalizeText(packageJson.version),
  author: resolveAuthorName(packageJson.author),
  repositoryUrl: resolveRepositoryUrl(packageJson.repository)
});
contextBridge.exposeInMainWorld("electronAPI", {
  ipcClient,
  onIpcEvent,
  offIpcEvent,
  appInfo,
  platform: process.platform,
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  })
});
//# sourceMappingURL=preload.bundle.cjs.map
