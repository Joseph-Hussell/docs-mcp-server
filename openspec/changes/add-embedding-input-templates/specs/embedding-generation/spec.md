## ADDED Requirements

### Requirement: Embedding Input Templates
The system SHALL support two optional templates, `embeddings.queryTemplate` and `embeddings.documentTemplate`, each a string in which the placeholder `{text}` stands for the text to embed. Both SHALL default to empty. When `embeddings.queryTemplate` is not empty, the system SHALL embed each search query as the template with the first `{text}` replaced by the query. When `embeddings.documentTemplate` is not empty, the system SHALL embed each chunk as the template with the first `{text}` replaced by the chunk's embedding input, metadata header included. An empty template SHALL leave the text unchanged. The templates SHALL affect only the text sent to the embedding model, not stored chunk content or full-text search. Loading a configuration with a non-empty template that lacks `{text}` SHALL fail.

#### Scenario: Query template
- **WHEN** `embeddings.queryTemplate` is `search_query: {text}`
- **AND** a search runs for `enable row level security`
- **THEN** the text sent to the embedding model SHALL be `search_query: enable row level security`

#### Scenario: Document template
- **WHEN** `embeddings.documentTemplate` is `search_document: {text}`
- **AND** a chunk is indexed
- **THEN** the text sent to the embedding model SHALL be `search_document: ` followed by the metadata header and the chunk content
- **AND** the chunk content in the database SHALL remain unchanged

#### Scenario: Truncated text keeps the template
- **WHEN** `embeddings.documentTemplate` is not empty
- **AND** a single text is truncated after an input size error
- **THEN** the retried text SHALL still be wrapped in the template

#### Scenario: No templates configured
- **WHEN** both templates are empty
- **THEN** queries and chunks SHALL be sent to the embedding model unchanged

#### Scenario: Template without placeholder
- **WHEN** `DOCS_MCP_EMBEDDINGS_QUERY_TEMPLATE` is `search_query:`
- **THEN** loading the configuration SHALL fail with a message naming the setting and the placeholder
