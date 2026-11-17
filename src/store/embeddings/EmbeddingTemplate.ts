/**
 * The placeholder an embedding input template replaces with the text to embed.
 */
export const EMBEDDING_TEMPLATE_PLACEHOLDER = "{text}";

/**
 * Checks whether a value can be used as an embedding input template.
 * A template is either empty, which leaves the text unchanged, or contains the
 * `{text}` placeholder.
 *
 * @param template The configured template.
 * @returns True when the template is empty or contains the placeholder.
 */
export function isValidEmbeddingTemplate(template: string): boolean {
  return template === "" || template.includes(EMBEDDING_TEMPLATE_PLACEHOLDER);
}

/**
 * Wraps a text in an embedding input template.
 *
 * Models such as EmbeddingGemma, Nomic Embed and E5 are trained with a task
 * prefix that differs between search queries and indexed documents. A template
 * carries that prefix. The first `{text}` placeholder is replaced with the text;
 * an empty template returns the text unchanged.
 *
 * @param template The template, e.g. `search_query: {text}`, or an empty string.
 * @param text The text to embed.
 * @returns The text to send to the embedding model.
 */
export function applyEmbeddingTemplate(template: string, text: string): string {
  if (template === "") {
    return text;
  }
  // A replacer function keeps `$` sequences in the text literal.
  return template.replace(EMBEDDING_TEMPLATE_PLACEHOLDER, () => text);
}
