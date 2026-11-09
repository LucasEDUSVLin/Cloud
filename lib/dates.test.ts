import { describe, expect, it } from "vitest";
import { addDays, csvDate, mondayOfWeek } from "./dates";

describe("dates", () => {
  it("validates CSV dates instead of normalizing invalid dates", () => {
    expect(csvDate("29-02-2024 23:59")).toBe("2024-02-29");
    expect(csvDate("29-02-2026 12:00")).toBeNull();
    expect(csvDate("01-01-2026 24:00")).toBeNull();
    expect(csvDate("")).toBeNull();
  });

  it("starts the week on Monday across a month and year boundary", () => {
    expect(mondayOfWeek("2027-01-01")).toBe("2026-12-28");
    expect(addDays("2026-12-28", 6)).toBe("2027-01-03");
  });
});
