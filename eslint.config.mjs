// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";

export default zotero({
  overrides: [
    {
      files: ["**/*.ts"],
      rules: {
        // We disable this rule here because the template
        // contains some unused examples and variables
        "@typescript-eslint/no-unused-vars": "off",
      },
    },
    {
      // 单元测试用箭头函数风格,放宽 mocha 的风格规则。
      // Unit tests use arrow-function style; relax mocha's stylistic rules.
      files: ["test/**/*.ts"],
      rules: {
        "mocha/no-mocha-arrows": "off",
        "mocha/consistent-spacing-between-blocks": "off",
        "mocha/max-top-level-suites": "off",
      },
    },
  ],
});
