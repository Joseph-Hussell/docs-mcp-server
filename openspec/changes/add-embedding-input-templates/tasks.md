## 1. Template

- [x] 1.1 Add `src/store/embeddings/EmbeddingTemplate.ts` with the placeholder constant, `isValidEmbeddingTemplate` and `applyEmbeddingTemplate`, and unit tests for the empty template, replacement, text after the placeholder, `$` sequences in the text and a placeholder inside the text

## 2. Configuration

- [x] 2.1 Add `embeddings.queryTemplate` and `embeddings.documentTemplate` (default empty) to the defaults and the schema, rejecting a non-empty value without `{text}`; verify with environment-variable cases in `src/utils/config.test.ts`
- [x] 2.2 Detect legacy generated config files by a fixed list of the embedding settings they contain, and verify with a test that fails under the previous detection

## 3. Store

- [x] 3.1 Apply the document template in `embedDocumentsWithRetry` and the query template in `findByContent`; verify in `src/store/DocumentStore.test.ts` that chunks and queries are sent wrapped, and that a truncated text keeps the template

## 4. Documentation

- [x] 4.1 Add a "Task Prefixes" section to `docs/guides/embedding-models.md` and the two rows to `docs/setup/configuration.md`
