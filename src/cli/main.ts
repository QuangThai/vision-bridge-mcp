#!/usr/bin/env node

import { runCliAsync } from "./run.js";

runCliAsync().then((code) => {
  process.exit(code);
});
