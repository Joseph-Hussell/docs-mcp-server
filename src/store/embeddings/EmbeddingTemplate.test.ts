import { describe, expect, it } from "vitest";
import { applyEmbeddingTemplate, isValidEmbeddingTemplate } from "./EmbeddingTemplate";

describe("applyEmbeddingTemplate", () => {
  it("returns the text unchanged for an empty template", () => {
    expect(applyEmbeddingTemplate("", "how do I enable RLS?")).toBe(
      "how do I enable RLS?",
    );
  });

  it("replaces the placeholder with the text", () => {
    expect(
      applyEmbeddingTemplate("task: search result | query: {text}", "enable RLS"),
    ).toBe("task: search result | query: enable RLS");
  });

  it("keeps text after the placeholder", () => {
    expect(applyEmbeddingTemplate("<doc>{text}</doc>", "body")).toBe("<doc>body</doc>");
  });

  it("inserts replacement patterns in the text literally", () => {
    expect(applyEmbeddingTemplate("passage: {text}", "costs $1 and $& more")).toBe(
      "passage: costs $1 and $& more",
    );
  });

  it("leaves a placeholder inside the text alone", () => {
    expect(applyEmbeddingTemplate("query: {text}", "what does {text} mean")).toBe(
      "query: what does {text} mean",
    );
  });
});

describe("isValidEmbeddingTemplate", () => {
  it("accepts an empty template and one with the placeholder", () => {
    expect(isValidEmbeddingTemplate("")).toBe(true);
    expect(isValidEmbeddingTemplate("search_document: {text}")).toBe(true);
  });

  it("rejects a template without the placeholder", () => {
    expect(isValidEmbeddingTemplate("search_document: ")).toBe(false);
  });
});
