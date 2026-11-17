## Context

`DocumentStore` embeds text in two places: chunks during indexing (`embedDocumentsWithRetry`) and the query during search (`findByContent`). Both pass raw text to a LangChain `Embeddings` client. The store therefore already knows which kind of text it sends, which is the information a task prefix depends on.

## Decisions

**Template with a `{text}` placeholder, not a prefix string.** Environment values are trimmed before schema parsing, and most task prefixes end in a space. A placeholder makes the position of the text explicit and survives trimming. It also covers models that wrap the text on both sides.

**Apply at the call sites in the store, not in a wrapper around the client.** `initializeEmbeddings` checks `instanceof FixedDimensionEmbeddings` on the client, which an outer wrapper would hide, and the dimension probe (`embedQuery("test")`) needs no template.

**Apply the document template inside `embedDocumentsWithRetry`, at the request.** The retry truncates an oversized single text to its first half. Applying the template at the request keeps the prefix on the truncated text.

**No change detection for the document template.** See the proposal. The setting can join the stored embedding identity later without changing its shape.

## Program Design

```
src/
  store/
~   DocumentStore.ts                 # applies the templates at the two embedding requests
    embeddings/
+     EmbeddingTemplate.ts           # placeholder constant, validation, application
+     EmbeddingTemplate.test.ts
  utils/
~   config.ts                        # two settings, validation, fixed legacy key list
```

```ts
export const EMBEDDING_TEMPLATE_PLACEHOLDER = "{text}";
/** True for an empty template or one that contains the placeholder. */
export function isValidEmbeddingTemplate(template: string): boolean;
/** Replaces the first placeholder with the text; an empty template returns the text. Never throws. */
export function applyEmbeddingTemplate(template: string, text: string): string;
```

Batch sizing (`embeddings.batchChars`) counts the text before the template is applied, as it already does for provider-side tokenization overhead.
