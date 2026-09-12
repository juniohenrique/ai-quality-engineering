import { describe, expect, it } from "vitest";
import { projectName } from "./index.js";

describe("project bootstrap", () => {
  it("exposes the project name", () => {
    expect(projectName).toBe("ai-quality-engineering");
  });
});
