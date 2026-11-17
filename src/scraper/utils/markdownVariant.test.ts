import { describe, expect, it, vi } from "vitest";
import { mockSite } from "../../../test/mock-site";
import { type AppConfig, loadConfig } from "../../utils/config";
import { WebScraperStrategy } from "../strategies/WebScraperStrategy";
import { ScrapeMode, type ScraperOptions, type ScraperProgressEvent } from "../types";
import { buildSiblingMarkdownVariantUrl } from "./markdownVariant";

// Building realistic request headers loads a large browser-fingerprint model on
// every fetcher construction, which only costs time here.
vi.mock("../fetcher/FingerprintGenerator", () => ({
  FingerprintGenerator: class {
    generateHeaders(): Record<string, string> {
      return {};
    }
  },
}));

const baseConfig = loadConfig();
const config: AppConfig = {
  ...baseConfig,
  scraper: {
    ...baseConfig.scraper,
    // One item at a time, so a site receives its requests in queue order.
    maxConcurrency: 1,
    fetcher: { ...baseConfig.scraper.fetcher, maxRetries: 0 },
    security: {
      ...baseConfig.scraper.security,
      // The mock hosts pass the access policy without a DNS lookup.
      network: { ...baseConfig.scraper.security.network, allowPrivateNetworks: true },
    },
  },
};

const ROOT = "https://example.com/";

/** An HTML page headed `title`. */
const html = (title: string): string =>
  `<html><head><title>${title}</title></head><body><h1>${title}</h1></body></html>`;
const MARKDOWN = { type: "text/markdown" };

const opts = (overrides: Partial<ScraperOptions> = {}): ScraperOptions => ({
  url: ROOT,
  library: "test",
  version: "1.0",
  maxPages: 50,
  maxDepth: 1,
  scrapeMode: ScrapeMode.Fetch,
  ...overrides,
});

/** Crawls, with a fresh strategy unless one is given, and returns every progress event. */
async function crawl(
  overrides: Partial<ScraperOptions> = {},
  strategy = new WebScraperStrategy(config),
): Promise<ScraperProgressEvent[]> {
  const events: ScraperProgressEvent[] = [];
  await strategy.scrape(opts(overrides), async (event) => {
    events.push(event);
  });
  return events;
}

const storedUrls = (events: ScraperProgressEvent[]): string[] =>
  events.flatMap((event) => (event.result ? [event.result.url] : []));

describe("buildSiblingMarkdownVariantUrl", () => {
  it("appends .md to a page URL", () => {
    expect(buildSiblingMarkdownVariantUrl("https://example.com/docs/guide")).toBe(
      "https://example.com/docs/guide.md",
    );
  });

  it("asks a directory URL for its index.html.md", () => {
    expect(buildSiblingMarkdownVariantUrl("https://example.com/docs/")).toBe(
      "https://example.com/docs/index.html.md",
    );
  });

  it("appends .md to the path and keeps the query string", () => {
    expect(buildSiblingMarkdownVariantUrl("https://example.com/docs/guide?lang=en")).toBe(
      "https://example.com/docs/guide.md?lang=en",
    );
  });
});

describe("Markdown variants for every page", () => {
  const site = mockSite("https://example.com");

  /** Paths the site was asked for, llms.txt probes excluded, in arrival order. */
  const pages = (): string[] =>
    site.requests.map((request) => request.path).filter((p) => !p.endsWith("/llms.txt"));

  const preferring = () =>
    new WebScraperStrategy({
      ...config,
      scraper: { ...config.scraper, preferMarkdownVariants: true },
    });

  it("fetches each crawled page's .md variant and records it under the page URL", async () => {
    site
      .page(
        "/docs/guide.md",
        "# Guide\n\nSee [Auth](https://example.com/docs/auth).",
        MARKDOWN,
      )
      .page("/docs/auth.md", "# Auth\n\nBody.", MARKDOWN);

    const events = await crawl(
      { url: `${ROOT}docs/guide`, maxDepth: 1, scope: "hostname" },
      preferring(),
    );

    expect(pages()).toEqual(["/docs/guide.md", "/docs/auth.md"]);
    expect(storedUrls(events)).toEqual([`${ROOT}docs/guide`, `${ROOT}docs/auth`]);
    expect(events[1]?.result).toMatchObject({ contentType: "text/markdown" });
  });

  it("falls back to the page itself when the .md variant is missing", async () => {
    site.notFound("/docs/guide.md").page("/docs/guide", html("Guide"));

    const events = await crawl({ url: `${ROOT}docs/guide`, maxDepth: 0 }, preferring());

    expect(pages()).toEqual(["/docs/guide.md", "/docs/guide"]);
    expect(storedUrls(events)).toEqual([`${ROOT}docs/guide`]);
  });

  it("rejects a .md variant served as HTML", async () => {
    site.page("/docs/guide.md", html("Not Markdown")).page("/docs/guide", html("Guide"));

    await crawl({ url: `${ROOT}docs/guide`, maxDepth: 0 }, preferring());

    expect(pages()).toEqual(["/docs/guide.md", "/docs/guide"]);
  });

  it("asks a directory URL for its index.html.md", async () => {
    site.page("/docs/index.html.md", "# Docs\n\nBody.", MARKDOWN);

    await crawl({ url: `${ROOT}docs/`, maxDepth: 0 }, preferring());

    expect(pages()).toEqual(["/docs/index.html.md"]);
  });

  it("leaves crawled pages alone when the setting is off", async () => {
    site.page("/docs/guide", html("Guide"));

    await crawl({ url: `${ROOT}docs/guide`, maxDepth: 0 });

    expect(pages()).toEqual(["/docs/guide"]);
  });
});
