/** Tests for the permit balance helpers of the new-reservation card. */
import { describe, expect, it } from "vitest";
import {
  formatBalanceLabel,
  normalizePaidParkingStatus,
  selectCardBalances,
} from "./helpers";
import type { BalancePayload, PaidParkingStatusResponse } from "./types";

const TIME: BalancePayload = { amount: 135, unit: "MINUTE", kind: "time" };
const MONEY: BalancePayload = { amount: 12.5, unit: "EURO", kind: "money" };
const TIMES: BalancePayload = { amount: 3, unit: "TIMES", kind: "times" };

const localizeKey = (key: string): string =>
  ({ "unit.hours": "h", "unit.minutes": "min" })[key] ?? key;

const payload = (balances: unknown): PaidParkingStatusResponse =>
  ({
    state: "paid",
    window_kind: null,
    window_start: null,
    window_end: null,
    balances,
    parking_areas: [],
  }) as PaidParkingStatusResponse;

describe("status balances", () => {
  it("keeps every well-formed balance in permit order", () => {
    expect(normalizePaidParkingStatus(payload([MONEY, TIME])).balances).toEqual(
      [MONEY, TIME],
    );
  });

  it("drops malformed balances and tolerates a missing list", () => {
    expect(
      normalizePaidParkingStatus(
        payload([
          { amount: Number.NaN, unit: "MINUTE", kind: "time" },
          { amount: 5, unit: "X", kind: "other" },
          null,
          { amount: 30, unit: "", kind: "time" },
        ]),
      ).balances,
    ).toEqual([{ amount: 30, unit: null, kind: "time" }]);
    expect(normalizePaidParkingStatus(payload(undefined)).balances).toEqual([]);
  });
});

describe("card balance selection", () => {
  it("shows every balance without a configured list", () => {
    expect(selectCardBalances([MONEY, TIME], undefined)).toEqual([MONEY, TIME]);
  });

  it("shows only configured kinds, in permit order", () => {
    expect(selectCardBalances([TIME, MONEY, TIMES], ["times", "time"])).toEqual(
      [TIME, TIMES],
    );
    expect(selectCardBalances([TIME, MONEY], [])).toEqual([]);
  });
});

describe("balance badge label", () => {
  it("formats time as hours and minutes", () => {
    expect(formatBalanceLabel(TIME, localizeKey, "en")).toEqual({
      text: "2h 15min",
      icon: "mdi:progress-clock",
    });
  });

  it("formats money as a euro amount in the user's language", () => {
    expect(formatBalanceLabel(MONEY, localizeKey, "en").text).toBe("€12.50");
    expect(formatBalanceLabel(MONEY, localizeKey, "nl").text).toMatch(
      /^€\s12,50$/,
    );
    expect(formatBalanceLabel(MONEY, localizeKey, "nl").icon).toBe("mdi:cash");
  });

  it("formats uses as a count", () => {
    expect(formatBalanceLabel(TIMES, localizeKey, "en")).toEqual({
      text: "3",
      icon: "mdi:ticket-outline",
    });
  });
});
