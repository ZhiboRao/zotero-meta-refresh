import { defineConfig } from "zotero-plugin-scaffold";
import pkg from "./package.json";

export default defineConfig({
  source: ["src", "addon"],
  dist: ".scaffold/build",
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,

  build: {
    assets: ["addon/**/*.*"],
    // 保持 scaffold 默认的 manifest 生成(makeManifest 默认 enable)。它会注入
    // applications.zotero.update_url —— 所有能正常安装的 Zotero 插件都带这个字段,
    // 缺了它 Zotero 9 会以"无法安装/不兼容"拒绝。指向的 repo 不存在也无妨:
    // 安装只校验 URL 格式,更新检查失败 Zotero 会静默跳过。
    // Keep scaffold's default manifest generation. It injects
    // applications.zotero.update_url — every installable Zotero plugin has it,
    // and Zotero 9 rejects the xpi ("could not be installed / incompatible")
    // without it. The repo need not exist: install only validates URL format;
    // a failing update check is silently ignored.
    define: {
      ...pkg.config,
      author: pkg.author,
      description: pkg.description,
      homepage: pkg.homepage,
      buildVersion: pkg.version,
      buildTime: "{{buildTime}}",
    },
    prefs: {
      prefix: pkg.config.prefsPrefix,
    },
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        define: {
          __env__: `"${process.env.NODE_ENV}"`,
        },
        bundle: true,
        target: "firefox115",
        outfile: `.scaffold/build/addon/content/scripts/${pkg.config.addonRef}.js`,
      },
    ],
  },

  test: {
    waitForPlugin: `() => Zotero.${pkg.config.addonInstance}.data.initialized`,
  },

  // If you need to see a more detailed log, uncomment the following line:
  // logLevel: "trace",
});
