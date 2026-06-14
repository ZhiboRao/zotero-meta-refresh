/**
 * 纯函数单元测试(在 Node 里跑,不依赖 Zotero)。
 * 覆盖相似度、姓名拆分、arXiv 提取、摘要重建等关键逻辑。
 *
 * Unit tests for the pure functions (run in Node, no Zotero needed).
 */

import { expect } from "chai";
import {
  extractArxivIdFromText,
  levenshtein,
  normalizeTitle,
  pickBestByTitle,
  similarity,
  splitDisplayName,
} from "../../src/modules/metarefresh/utils";
import { reconstructAbstract } from "../../src/modules/metarefresh/sources";
import { SourceRecord } from "../../src/modules/metarefresh/types";

describe("normalizeTitle", () => {
  it("lowercases, strips punctuation, collapses spaces", () => {
    expect(normalizeTitle("  BERT: Pre-Training!! ")).to.equal(
      "bert pre training",
    );
  });
});

describe("levenshtein", () => {
  it("identical = 0", () => expect(levenshtein("abc", "abc")).to.equal(0));
  it("empty handling", () => expect(levenshtein("", "abc")).to.equal(3));
  it("single edit", () => expect(levenshtein("kitten", "sitten")).to.equal(1));
});

describe("similarity", () => {
  it("exact match ≈ 1", () => {
    expect(
      similarity("Attention Is All You Need", "Attention Is All You Need"),
    ).to.be.closeTo(1, 1e-9);
  });
  it("subtitle-extended match clears 0.85", () => {
    const a = "BERT: Pre-training of Deep Bidirectional Transformers";
    const b =
      "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding";
    expect(similarity(a, b)).to.be.gte(0.85);
  });
  it("short, genuinely different stays below 0.85", () => {
    expect(
      similarity("Deep Learning", "Deep Learning for Healthcare Applications"),
    ).to.be.lt(0.85);
  });
  it("empty input → 0", () => expect(similarity("", "anything")).to.equal(0));
});

describe("splitDisplayName", () => {
  it("simple first last", () => {
    expect(splitDisplayName("Yann LeCun")).to.deep.equal({
      firstName: "Yann",
      lastName: "LeCun",
    });
  });
  it("keeps surname particle with the last name", () => {
    expect(splitDisplayName("Ludwig van Beethoven")).to.deep.equal({
      firstName: "Ludwig",
      lastName: "van Beethoven",
    });
  });
  it("handles 'Last, First'", () => {
    expect(splitDisplayName("Beethoven, Ludwig van")).to.deep.equal({
      firstName: "Ludwig van",
      lastName: "Beethoven",
    });
  });
  it("single token → lastName only", () => {
    expect(splitDisplayName("Plato")).to.deep.equal({
      firstName: "",
      lastName: "Plato",
    });
  });
  it("empty → empty", () => {
    expect(splitDisplayName("")).to.deep.equal({ firstName: "", lastName: "" });
  });
});

describe("extractArxivIdFromText", () => {
  it("from an arXiv abs URL", () => {
    expect(extractArxivIdFromText("https://arxiv.org/abs/1706.03762")).to.equal(
      "1706.03762",
    );
  });
  it("from an arXiv: prefix with version", () => {
    expect(extractArxivIdFromText("arXiv:2010.11929v2")).to.equal("2010.11929");
  });
  it("rejects a DOI-like token without arXiv context", () => {
    expect(extractArxivIdFromText("10.1234/5678.90123")).to.equal(null);
  });
  it("rejects an implausible month", () => {
    expect(extractArxivIdFromText("arxiv 1799.03762")).to.equal(null);
  });
});

describe("reconstructAbstract", () => {
  it("orders words by their positions", () => {
    expect(
      reconstructAbstract({ Hello: [0], world: [1, 3], cruel: [2] }),
    ).to.equal("Hello world cruel world");
  });
  it("empty/undefined → empty string", () => {
    expect(reconstructAbstract(undefined)).to.equal("");
  });
});

describe("pickBestByTitle", () => {
  const rec = (t: string): SourceRecord => ({
    source: "crossref",
    title: t,
    authors: [],
    publicationTitle: "",
    date: "",
    volume: "",
    issue: "",
    pages: "",
    DOI: "",
    abstractNote: "",
    type: "",
  });
  it("picks the closest title", () => {
    const cands = ["totally unrelated work", "attention is all you need"];
    const best = pickBestByTitle("Attention Is All You Need", cands, (c) =>
      rec(c),
    );
    expect(best?.title).to.equal("attention is all you need");
  });
  it("returns null for no candidates", () => {
    expect(pickBestByTitle("x", [], (c) => rec(String(c)))).to.equal(null);
  });
});
