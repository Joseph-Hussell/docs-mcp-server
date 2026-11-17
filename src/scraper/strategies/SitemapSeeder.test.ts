import { describe, expect, it, vi } from "vitest";
import { mockSite } from "../../../test/mock-site";
import { type AppConfig, loadConfig } from "../../utils/config";
import { ScrapeMode, type ScraperOptions, type ScraperProgressEvent } from "../types";
import { getSitemapCandidates, parseSitemap } from "./SitemapSeeder";
import { WebScraperStrategy } from "./WebScraperStrategy";

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
/** A sitemap listing `urls`. */
const sitemapXml = (...urls: string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((url) => `<url><loc>${url}</loc></url>`)
    .join("")}</urlset>`;
const XML = { type: "application/xml" };

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

describe("parseSitemap", () => {
  it("decodes XML entities in the listed locations", () => {
    const { locations } = parseSitemap(
      sitemapXml("https://example.com/page?a=1&amp;b=&lt;2&gt;&quot;&apos;"),
    );

    expect(locations).toEqual(["https://example.com/page?a=1&b=<2>\"'"]);
  });

  it("recognizes a sitemap index", () => {
    const index = parseSitemap(
      `<sitemapindex><sitemap><loc>${ROOT}a.xml</loc></sitemap></sitemapindex>`,
    );
    const urlset = parseSitemap(sitemapXml(`${ROOT}page`));

    expect(index).toEqual({ isIndex: true, locations: [`${ROOT}a.xml`] });
    expect(urlset.isIndex).toBe(false);
  });
});

describe("getSitemapCandidates", () => {
  it("tries the start directory and each directory above it", () => {
    expect(getSitemapCandidates("https://site.test/docs/guides/")).toEqual([
      "https://site.test/docs/guides/sitemap.xml",
      "https://site.test/docs/sitemap.xml",
      "https://site.test/sitemap.xml",
    ]);
  });

  it("starts from the directory of a file-like start URL", () => {
    expect(getSitemapCandidates("https://site.test/docs/guide.html?x=1")).toEqual([
      "https://site.test/docs/sitemap.xml",
      "https://site.test/sitemap.xml",
    ]);
  });
});

describe("sitemap seeding", () => {
  const site = mockSite("https://example.com");

  const withSitemap = () =>
    new WebScraperStrategy({
      ...config,
      scraper: { ...config.scraper, useSitemap: true },
    });

  it("crawls the in-scope pages a sitemap lists even when nothing links to them", async () => {
    site
      .page("/docs/", html("Docs"))
      .notFound("/docs/llms.txt")
      .notFound("/llms.txt")
      .page(
        "/docs/sitemap.xml",
        sitemapXml(
          `${ROOT}docs/orphan`,
          `${ROOT}docs/deep/page?x=1&amp;y=2`,
          `${ROOT}blog/post`,
        ),
        XML,
      )
      .page("/docs/orphan", html("Orphan"))
      .page("/docs/deep/page?x=1&y=2", html("Deep"));

    const events = await crawl({ url: `${ROOT}docs/`, maxDepth: 1 }, withSitemap());

    expect(storedUrls(events)).toEqual(
      expect.arrayContaining([`${ROOT}docs/orphan`, `${ROOT}docs/deep/page?x=1&y=2`]),
    );
    // Outside the start URL's subtree
    expect(site.wasRequested("/blog/post")).toBe(false);
  });

  it("follows a sitemap index at the site root", async () => {
    site
      .page("/docs/", html("Docs"))
      .notFound("/docs/llms.txt")
      .notFound("/llms.txt")
      .notFound("/docs/sitemap.xml")
      .page(
        "/sitemap.xml",
        `<sitemapindex><sitemap><loc>${ROOT}docs-sitemap.xml</loc></sitemap></sitemapindex>`,
        XML,
      )
      .page("/docs-sitemap.xml", sitemapXml(`${ROOT}docs/listed`), XML)
      .page("/docs/listed", html("Listed"));

    const events = await crawl({ url: `${ROOT}docs/`, maxDepth: 1 }, withSitemap());

    expect(storedUrls(events)).toContain(`${ROOT}docs/listed`);
  });

  it("applies exclude patterns to sitemap entries", async () => {
    site
      .page("/docs/", html("Docs"))
      .notFound("/docs/llms.txt")
      .notFound("/llms.txt")
      .page(
        "/docs/sitemap.xml",
        sitemapXml(`${ROOT}docs/keep`, `${ROOT}docs/v1/old`),
        XML,
      )
      .page("/docs/keep", html("Keep"));

    await crawl(
      { url: `${ROOT}docs/`, maxDepth: 1, excludePatterns: ["/\\/v1\\//"] },
      withSitemap(),
    );

    expect(site.wasRequested("/docs/keep")).toBe(true);
    expect(site.wasRequested("/docs/v1/old")).toBe(false);
  });

  it("does not count a stale sitemap entry toward the failure threshold", async () => {
    site
      .page("/docs/", html("Docs"))
      .notFound("/docs/llms.txt")
      .notFound("/llms.txt")
      .page("/docs/sitemap.xml", sitemapXml(`${ROOT}docs/gone`, `${ROOT}docs/here`), XML)
      .notFound("/docs/gone")
      .page("/docs/here", html("Here"));

    const events = await crawl(
      {
        url: `${ROOT}docs/`,
        maxDepth: 1,
        abortOnFailureRate: 0.1,
      } as Partial<ScraperOptions>,
      withSitemap(),
    );

    expect(storedUrls(events)).toContain(`${ROOT}docs/here`);
  });

  it("does not look for a sitemap when the setting is off", async () => {
    site.page("/docs/", html("Docs")).notFound("/docs/llms.txt").notFound("/llms.txt");

    await crawl({ url: `${ROOT}docs/`, maxDepth: 0 });

    expect(site.wasRequested("/docs/sitemap.xml")).toBe(false);
    expect(site.wasRequested("/sitemap.xml")).toBe(false);
  });
});
