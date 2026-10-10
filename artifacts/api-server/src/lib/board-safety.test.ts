import { describe, expect, it } from "vitest";
import { findObjectionableTerms } from "./board-safety";

describe("Board automatic content flags", () => {
  it("matches configured terms as whole words regardless of case and punctuation", () => {
    expect(findObjectionableTerms("That was Damn!")).toEqual(["damn"]);
    expect(findObjectionableTerms("Shit, then fuck.")).toEqual(["fuck", "shit"]);
  });

  it("does not flag likely false positives that only contain similar letter sequences", () => {
    expect(findObjectionableTerms(
      "The assistant in class visited Scunthorpe; the shitake dish was damnation-era folklore.",
    )).toEqual([]);
    expect(findObjectionableTerms("fuckery")).toEqual([]);
  });
});
