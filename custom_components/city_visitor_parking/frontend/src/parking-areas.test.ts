import { describe, expect, it } from "vitest";
import {
  EMPTY_PAID_PARKING_STATUS,
  applyParkingAreaToStatus,
  formatReservationParkingArea,
  normalizePaidParkingStatus,
  normalizeParkingAreas,
  offersParkingAreaChoice,
  parkingAreaFreeInput,
  resolveCardParkingArea,
  resolveCardParkingAreaId,
} from "./helpers";
import type { PaidParkingStatusResponse, ParkingAreaStatus } from "./types";

const PARKING_AREA_10: ParkingAreaStatus = {
  parking_area_id: "10",
  name: "Centrum",
  state: "paid",
  window_kind: "current",
  window_start: "2026-11-12T08:00:00+00:00",
  window_end: "2026-11-12T22:00:00+00:00",
  next_change_time: "2026-11-12T22:00:00+00:00",
};

const PARKING_AREA_630: ParkingAreaStatus = {
  parking_area_id: "630",
  name: "Kralingen",
  state: "free",
  window_kind: "next",
  window_start: "2026-11-13T09:00:00+00:00",
  window_end: "2026-11-13T17:00:00+00:00",
  next_change_time: "2026-11-13T09:00:00+00:00",
};

const PAYLOAD: PaidParkingStatusResponse = {
  state: PARKING_AREA_10.state,
  window_kind: PARKING_AREA_10.window_kind,
  window_start: PARKING_AREA_10.window_start,
  window_end: PARKING_AREA_10.window_end,
  remaining_balance: 120,
  balance_unit: "MINUTE",
  parking_areas: [PARKING_AREA_10, PARKING_AREA_630],
  parking_area_free_input: false,
};

const PARKING_AREA_632: ParkingAreaStatus = {
  ...PARKING_AREA_630,
  parking_area_id: "632",
  name: "Noord",
};

describe("card parking area resolution", () => {
  const parkingAreas = [PARKING_AREA_10, PARKING_AREA_630, PARKING_AREA_632];
  const resolve = (pickedParkingAreaId: string | null | undefined) =>
    resolveCardParkingArea(parkingAreas, pickedParkingAreaId)?.parking_area_id;

  it("uses the user's pick, else the integration's default parking area", () => {
    expect(resolve("632")).toBe("632");
    expect(resolve(undefined)).toBe("10");
    expect(resolve(null)).toBe("10");
    expect(resolve("999")).toBe("10");
  });

  it("returns no parking area for permits without parking areas", () => {
    expect(resolveCardParkingArea([], "630")).toBeNull();
  });
});

describe("free parking area input", () => {
  it("offers a choice for several parking areas, or one plus free input", () => {
    expect(offersParkingAreaChoice([PARKING_AREA_10], false)).toBe(false);
    expect(offersParkingAreaChoice([PARKING_AREA_10], true)).toBe(true);
    expect(offersParkingAreaChoice([], true)).toBe(false);
    expect(
      offersParkingAreaChoice([PARKING_AREA_10, PARKING_AREA_630], false),
    ).toBe(true);
  });

  it("reads free input only for a permit with parking areas", () => {
    expect(
      parkingAreaFreeInput({ ...PAYLOAD, parking_area_free_input: true }),
    ).toBe(true);
    expect(parkingAreaFreeInput(PAYLOAD)).toBe(false);
    expect(
      parkingAreaFreeInput({
        ...PAYLOAD,
        parking_areas: [],
        parking_area_free_input: true,
      }),
    ).toBe(false);
  });

  it("books a typed ID only with free input, else the default", () => {
    const parkingAreas = [PARKING_AREA_10];
    expect(resolveCardParkingAreaId(parkingAreas, " 2222 ", true)).toBe("2222");
    expect(resolveCardParkingAreaId(parkingAreas, "2222", false)).toBe("10");
    expect(resolveCardParkingAreaId(parkingAreas, "", true)).toBe("10");
    expect(resolveCardParkingAreaId([], "2222", true)).toBeNull();
  });
});

describe("parking area selection", () => {
  it("drops parking areas without an id and tolerates a missing parking areas key", () => {
    const parkingAreas = normalizeParkingAreas({
      ...PAYLOAD,
      parking_areas: [
        { ...PARKING_AREA_10, parking_area_id: "" },
        PARKING_AREA_630,
      ],
    });
    expect(
      parkingAreas.map((parkingArea) => parkingArea.parking_area_id),
    ).toEqual(["630"]);
    expect(
      normalizeParkingAreas({
        ...PAYLOAD,
        parking_areas: undefined,
      } as unknown as PaidParkingStatusResponse),
    ).toEqual([]);
  });

  it("uses the selected parking area window and keeps the permit balance", () => {
    const status = applyParkingAreaToStatus(
      normalizePaidParkingStatus(PAYLOAD),
      PARKING_AREA_630,
    );
    expect(status).toEqual({
      state: "free",
      kind: "next",
      start: PARKING_AREA_630.window_start,
      end: PARKING_AREA_630.window_end,
      remainingMinutes: 120,
      balanceUnit: "MINUTE",
    });
  });

  it("does not overlay cached parking areas on a failed status", () => {
    expect(
      applyParkingAreaToStatus(EMPTY_PAID_PARKING_STATUS, PARKING_AREA_630),
    ).toBe(EMPTY_PAID_PARKING_STATUS);
  });
});

describe("active reservation parking area label", () => {
  it("prefers the parking area name, falls back to the id, else nothing", () => {
    expect(
      formatReservationParkingArea({
        parking_area_id: "630",
        parking_area_name: "Kralingen",
      }),
    ).toBe("Kralingen");
    expect(formatReservationParkingArea({ parking_area_id: "630" })).toBe(
      "630",
    );
    expect(formatReservationParkingArea({})).toBeNull();
  });
});
