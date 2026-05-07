import { chromium } from "playwright"

export class BrowserPool {
  constructor({ concurrency, headless }) {
    this.concurrency = Math.max(1, concurrency)
    this.headless = headless
    this.browser = null
    this.contexts = []
  }

  async init() {
    this.browser = await chromium.launch({ headless: this.headless })
    for (let i = 0; i < this.concurrency; i += 1) {
      const context = await this.browser.newContext({ serviceWorkers: "block" })
      this.contexts.push(context)
    }
  }

  async run(urls, worker, signal) {
    const results = new Array(urls.length)
    let cursor = 0

    const workers = this.contexts.map((context, workerId) => (async () => {
      while (cursor < urls.length) {
        if (signal?.aborted) break
        const index = cursor
        cursor += 1

        const url = urls[index]
        results[index] = await worker({ context, workerId, url, index })
      }
    })())

    await Promise.all(workers)
    return results
  }

  async close() {
    const errors = []
    for (const context of this.contexts) {
      try { await context.close() } catch (error) { errors.push(error) }
    }
    if (this.browser) {
      try { await this.browser.close() } catch (error) { errors.push(error) }
    }
    this.contexts = []
    this.browser = null
    if (errors.length > 0) {
      throw new AggregateError(errors, `Failed to close ${errors.length} browser resource(s)`)
    }
  }
}
