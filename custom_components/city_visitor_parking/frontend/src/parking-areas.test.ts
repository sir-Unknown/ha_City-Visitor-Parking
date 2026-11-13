import { describe, expect, it } from "vitest";
import {
  EMPTY_ZONE_STATUS,
  applyParkingAreaToStatus,
  dropForeignParkingAreaId,
  formatReservationParkingArea,
  getParkingAreaEditorVisibility,
  normalizeZoneStatus,
  normalizeParkingAreas,
  resolveCardParkingArea,
} from "./helpers";
import type { ZoneStatusResponse, ParkingAreaStatus } from "./types";

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

const PAYLOAD: ZoneStatusResponse = {
  state: PARKING_AREA_10.state,
  window_kind: PARKING_AREA_10.window_kind,
  window_start: PARKING_AREA_10.window_start,
  window_end: PARKING_AREA_10.window_end,
  remaining_balance: 120,
  balance_unit: "MINUTE",
  parking_areas: [PARKING_AREA_10, PARKING_AREA_630],
};

const PARKING_AREA_632: ParkingAreaStatus = {
  ...PARKING_AREA_630,
  parking_area_id: "632",
  name: "Noord",
};

describe("card parking area resolution", () => {
  const parkingAreas = [PARKING_AREA_10, PARKING_AREA_630, PARKING_AREA_632];
  const resolve = (options: Parameters<typeof resolveCardParkingArea>[1]) =>
    resolveCardParkingArea(parkingAreas, options)?.parking_area_id;

  it("lets a shown parking area field prefer the user's pick over the preset", () => {
    expect(resolve({ showParkingArea: true })).toBe("10");
    expect(resolve({ showParkingArea: true, configParkingAreaId: "630" })).toBe(
      "630",
    );
    expect(
      resolve({
        showParkingArea: true,
        configParkingAreaId: "630",
        pickedParkingAreaId: "632",
      }),
    ).toBe("632");
    expect(
      resolve({
        showParkingArea: true,
        configParkingAreaId: "630",
        pickedParkingAreaId: "999",
      }),
    ).toBe("630");
  });

  it("uses only the preset when the parking area field is hidden", () => {
    expect(
      resolve({
        showParkingArea: false,
        configParkingAreaId: "630",
        pickedParkingAreaId: "632",
      }),
    ).toBe("630");
    expect(
      resolve({ showParkingArea: false, pickedParkingAreaId: "632" }),
    ).toBe("10");
    expect(
      resolve({ showParkingArea: false, configParkingAreaId: "999" }),
    ).toBe("10");
  });

  it("returns no parking area for permits without parking areas", () => {
    expect(
      resolveCardParkingArea([], {
        showParkingArea: true,
        configParkingAreaId: "630",
      }),
    ).toBeNull();
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
      } as unknown as ZoneStatusResponse),
    ).toEqual([]);
  });

  it("uses the selected parking area window and keeps the permit balance", () => {
    const status = applyParkingAreaToStatus(
      normalizeZoneStatus(PAYLOAD),
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
    expect(applyParkingAreaToStatus(EMPTY_ZONE_STATUS, PARKING_AREA_630)).toBe(
      EMPTY_ZONE_STATUS,
    );
  });
});

describe("card editor parking area settings", () => {
  it("shows the parking area picker only for a configured permit with a choice", () => {
    expect(
      getParkingAreaEditorVisibility({
        permitConfigured: true,
        permitParkingAreaCount: 3,
        anyPermitHasParkingAreas: false,
      }),
    ).toEqual({ showParkingAreaSelect: true, showParkingAreaToggle: true });
    expect(
      getParkingAreaEditorVisibility({
        permitConfigured: true,
        permitParkingAreaCount: 1,
        anyPermitHasParkingAreas: true,
      }),
    ).toEqual({ showParkingAreaSelect: false, showParkingAreaToggle: false });
  });

  it("shows only the toggle without a permit when any permit has parking areas", () => {
    expect(
      getParkingAreaEditorVisibility({
        permitConfigured: false,
        permitParkingAreaCount: 0,
        anyPermitHasParkingAreas: true,
      }),
    ).toEqual({ showParkingAreaSelect: false, showParkingAreaToggle: true });
    expect(
      getParkingAreaEditorVisibility({
        permitConfigured: false,
        permitParkingAreaCount: 0,
        anyPermitHasParkingAreas: false,
      }),
    ).toEqual({ showParkingAreaSelect: false, showParkingAreaToggle: false });
  });

  it("drops a parking area that does not belong to a changed or cleared permit", () => {
    const parkingAreasByEntryId = new Map([
      ["b", [PARKING_AREA_10, PARKING_AREA_630]],
    ]);
    const config = { type: "t", config_entry_id: "a", parking_area_id: "630" };
    expect(dropForeignParkingAreaId(config, "a", parkingAreasByEntryId)).toBe(
      config,
    );
    expect(
      dropForeignParkingAreaId(
        { ...config, config_entry_id: "c" },
        "a",
        parkingAreasByEntryId,
      ),
    ).toEqual({ type: "t", config_entry_id: "c" });
    expect(
      dropForeignParkingAreaId(
        { ...config, config_entry_id: undefined },
        "a",
        parkingAreasByEntryId,
      ),
    ).toEqual({ type: "t", config_entry_id: undefined });
    expect(
      dropForeignParkingAreaId(
        { ...config, config_entry_id: "b" },
        "a",
        parkingAreasByEntryId,
      ),
    ).toEqual({ ...config, config_entry_id: "b" });
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
