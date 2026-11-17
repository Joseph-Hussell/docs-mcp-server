/**
 * Seeds a web crawl from the site's sitemap, used when `scraper.useSitemap` is
 * on. Pages that nothing links to within the crawl are otherwise never found,
 * which happens on sites whose Markdown copies leave out the navigation and on
 * sites whose navigation is rendered client-side.
 */
import { logger } from "../../utils/logger";
import { FetchStatus, type RawContent } from "../fetcher/types";
import { convertToString } from "../utils/buffer";

/** Most child sitemaps read from one sitemap index. */
const MAX_CHILD_SITEMAPS = 50;
/** Most URLs taken from sitemaps for one scrape. */
const MAX_SITEMAP_URLS = 50_000;

/**
 * Reads the `<loc>` entries of a sitemap or sitemap index.
 *
 * @param xml The sitemap document.
 * @returns Whether it is a sitemap index, and its locations with XML entities decoded.
 */
export function parseSitemap(xml: string): { isIndex: boolean; locations: string[] } {
  const decode = (value: string) =>
    value
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  const locations = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) =>
    decode(match[1]),
  );
  return { isIndex: /<sitemapindex[\s>]/i.test(xml), locations };
}

/**
 * Lists the sitemap locations tried for a scrape: `sitemap.xml` in the start
 * URL's directory and in each directory above it, up to the site root.
 *
 * @param inputUrl The start URL of the scrape.
 * @returns The candidate sitemap URLs, nearest directory first.
 */
export function getSitemapCandidates(inputUrl: string): string[] {
  const start = new URL(inputUrl);
  let directory = start.pathname.endsWith("/")
    ? start.pathname
    : start.pathname.slice(0, start.pathname.lastIndexOf("/") + 1);
  const candidates: string[] = [];
  for (;;) {
    const candidate = new URL(start.origin);
    candidate.pathname = `${directory}sitemap.xml`.replace(/\/+/g, "/");
    candidates.push(candidate.toString());
    if (directory === "/" || directory === "") break;
    directory = directory.replace(/[^/]*\/$/, "");
  }
  return candidates;
}

/**
 * Finds a site's sitemap before a crawl and holds the page URLs it lists until
 * the crawl takes them.
 */
export class SitemapSeeder {
  private pending: string[] = [];

  /**
   * Creates a seeder.
   *
   * @param enabled Whether to look for a sitemap at all (`scraper.useSitemap`).
   */
  constructor(private readonly enabled: boolean) {}

  /**
   * Finds the site's sitemap and keeps the page URLs it lists as pending seeds.
   *
   * Tries the candidates from {@link getSitemapCandidates} in order and stops at
   * the first that lists any URL. A sitemap index is followed one level down,
   * reading at most {@link MAX_CHILD_SITEMAPS} child sitemaps. Failures are not
   * errors: the crawl then relies on links and llms.txt alone. Each call
   * replaces the pending URLs; when the seeder is disabled it clears them
   * without making any request.
   *
   * @param startUrl The start URL of the scrape.
   * @param fetch Fetches a URL with the crawl's fetcher and outbound access policy.
   */
  async probe(
    startUrl: string,
    fetch: (url: string) => Promise<RawContent>,
  ): Promise<void> {
    this.pending = [];
    if (!this.enabled) {
      return;
    }

    const fetchXml = async (
      url: string,
    ): Promise<{ source: string; xml: string } | null> => {
      try {
        const rawContent = await fetch(url);
        if (rawContent.status !== FetchStatus.SUCCESS) {
          logger.debug(`Sitemap probe failed for ${url}: ${rawContent.status}`);
          return null;
        }
        return {
          source: rawContent.source,
          xml: convertToString(rawContent.content, rawContent.charset),
        };
      } catch (error) {
        logger.debug(`Sitemap probe failed for ${url}: ${error}`);
        return null;
      }
    };

    for (const candidate of getSitemapCandidates(startUrl)) {
      const fetched = await fetchXml(candidate);
      if (!fetched) continue;
      const sitemap = parseSitemap(fetched.xml);
      let urls = sitemap.locations;
      if (sitemap.isIndex) {
        urls = [];
        for (const child of sitemap.locations.slice(0, MAX_CHILD_SITEMAPS)) {
          const childSitemap = await fetchXml(new URL(child, fetched.source).href);
          if (childSitemap) urls.push(...parseSitemap(childSitemap.xml).locations);
        }
      }
      if (urls.length === 0) {
        logger.debug(`Sitemap probe failed for ${candidate}: no URLs`);
        continue;
      }
      logger.info(`🗺️  Detected sitemap at ${fetched.source} (${urls.length} URLs)`);
      this.pending = urls
        .slice(0, MAX_SITEMAP_URLS)
        .map((url) => new URL(url, fetched.source).href);
      return;
    }
  }

  /**
   * Returns the page URLs found by the last {@link probe} and clears them, so
   * they seed a crawl only once.
   *
   * @returns The pending page URLs, or an empty list.
   */
  takePending(): string[] {
    const urls = this.pending;
    this.pending = [];
    return urls;
  }
}
