import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

const sharedRules = {
  "no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      ignoreRestSiblings: true
    }
  ]
};

export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**", ".husky/**", "coverage/**"]
  },
  js.configs.recommended,
  {
    files: ["backend/src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node
      }
    },
    rules: sharedRules
  },
  {
    files: ["frontend/src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.browser
      }
    },
    plugins: {
      react,
      "react-hooks": reactHooks
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    rules: {
      ...sharedRules,
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      ...reactHooks.configs.recommended.rules,
      "react/prop-types": "off",
      "react-hooks/set-state-in-effect": "off"
    }
  }
];
