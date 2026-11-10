import { describe, expect, it } from "vitest";
import { addDays, jstNow, parseTime, weekday } from "../src/time";
import { normalizePhone } from "../src/util";

describe("normalizePhone", () => {
  it.each([
    ["075-123-4567", "+81751234567"],
    ["090 1234 5678", "+819012345678"],
    ["０９０−１２３４−５６７８", "+819012345678"],
    ["+1 415 555 0100", "+14155550100"],
    ["12", null],
    ["", null],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe("time", () => {
  it("UTC 15:30 は日本時間の翌日 0:30", () => {
    expect(jstNow(Date.parse("2026-11-10T15:30:00Z"))).toEqual({ date: "2026-11-11", min: 30 });
  });
  it("曜日と日付の計算", () => {
    expect(weekday("2026-12-02")).toBe(3);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(parseTime("18:30")).toBe(1110);
    expect(parseTime("18:60")).toBeNull();
  });
});
