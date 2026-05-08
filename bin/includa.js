#!/usr/bin/env node
import { ensureBrowsers } from "../src/setup/ensure-browsers.js"
ensureBrowsers()
await import("./cli.js")
