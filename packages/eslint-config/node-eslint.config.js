import globals from "globals";
import { config } from "./base.js";

export default [
  ...config,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
];
