/**
 * Markdown variants for every crawled web page, used when
 * `scraper.preferMarkdownVariants` is on. Sites such as Supabase and Neon
 * publish a Markdown copy of each page at the page URL plus `.md`, which is far
 * smaller than the HTML and needs no browser render.
 */
import { logger } from "../../utils/logger";
import { FetchStatus, type RawContent } from "../fetcher/types";

/** Callbacks through which {@link fetchPreferringMarkdownVariant} reaches the network. */
export interface MarkdownVariantFetchOptions {
  /** Fetches a URL with the crawl's fetcher and fetch options. */
  fetch: (url: string) => Promise<RawContent>;
  /** Whether a successfully fetched variant is Markdown the crawl can use. */
  isAcceptable: (content: RawContent) => boolean;
}

/**
 * Builds the URL of a page's sibling Markdown variant: the page URL with `.md`
 * appended (`/docs/guide` to `/docs/guide.md`), the convention of sites that
 * publish a Markdown copy of every page. A directory URL asks for its
 * `index.html.md`, as for llms.txt entries.
 *
 * @param url The page URL.
 * @returns The URL of its Markdown variant.
 */
export function buildSiblingMarkdownVariantUrl(url: string): string {
  const variant = new URL(url);
  variant.pathname = variant.pathname.endsWith("/")
    ? `${variant.pathname}index.html.md`
    : `${variant.pathname}.md`;
  return variant.toString();
}

/**
 * Fetches a page's sibling Markdown variant and falls back to the page itself.
 *
 * The variant is used when it is fetched successfully and `isAcceptable`
 * accepts it. Any other status, a variant served as something other than
 * Markdown, or an error while fetching it leads to a fetch of the page URL.
 *
 * @param pageUrl The page URL.
 * @param options The fetch and acceptability callbacks.
 * @returns The variant's content, or the page's own content.
 */
export async function fetchPreferringMarkdownVariant(
  pageUrl: string,
  options: MarkdownVariantFetchOptions,
): Promise<RawContent> {
  const variantUrl = buildSiblingMarkdownVariantUrl(pageUrl);
  try {
    const variant = await options.fetch(variantUrl);
    if (variant.status === FetchStatus.SUCCESS && options.isAcceptable(variant)) {
      logger.debug(`Using Markdown variant ${variantUrl} for ${pageUrl}`);
      return variant;
    }
    logger.debug(
      `Markdown variant ${variantUrl} not used for ${pageUrl}: status=${variant.status}, contentType=${variant.mimeType}`,
    );
  } catch (error) {
    logger.debug(`Markdown variant ${variantUrl} not used for ${pageUrl}: ${error}`);
  }

  return options.fetch(pageUrl);
}
