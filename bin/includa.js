#!/usr/bin/env node
import { installConsoleCapture } from "../src/utils/console-capture.js"
import { ensureBrowsers } from "../src/setup/ensure-browsers.js"

// Capture console output into the shared log bus before anything logs, so the
// dashboard's in-app console (and the on-disk log) see startup messages too.
installConsoleCapture()

ensureBrowsers()
await import("./cli.js")
