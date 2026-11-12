import { describe, expect, it } from "vitest";
import {
  EMPTY_ZONE_STATUS,
  applyZoneToStatus,
  buildZoneServiceData,
  normalizeZoneStatus,
  normalizeZones,
  resolveSelectedZone,
} from "./helpers";
import type { ZoneStatusResponse, ZoneStatusZone } from "./types";

const ZONE_10: ZoneStatusZone = {
  zone_id: "10",
  name: "Centrum",
  state: "chargeable",
  window_kind: "current",
  window_start: "2026-11-12T08:00:00+00:00",
  window_end: "2026-11-12T22:00:00+00:00",
  next_change_time: "2026-11-12T22:00:00+00:00",
};

const ZONE_630: ZoneStatusZone = {
  zone_id: "630",
  name: "Kralingen",
  state: "free",
  window_kind: "next",
  window_start: "2026-11-13T09:00:00+00:00",
  window_end: "2026-11-13T17:00:00+00:00",
  next_change_time: "2026-11-13T09:00:00+00:00",
};

const PAYLOAD: ZoneStatusResponse = {
  state: ZONE_10.state,
  window_kind: ZONE_10.window_kind,
  window_start: ZONE_10.window_start,
  window_end: ZONE_10.window_end,
  remaining_balance: 120,
  balance_unit: "MINUTE",
  zones: [ZONE_10, ZONE_630],
};

describe("zone selection", () => {
  it("defaults to the first zone and falls back when the id disappears", () => {
    const zones = normalizeZones(PAYLOAD);
    expect(resolveSelectedZone(zones, undefined)?.zone_id).toBe("10");
    expect(resolveSelectedZone(zones, "630")?.zone_id).toBe("630");
    expect(resolveSelectedZone(zones, "999")?.zone_id).toBe("10");
    expect(resolveSelectedZone([], "630")).toBeNull();
  });

  it("drops zones without an id and tolerates a missing zones key", () => {
    const zones = normalizeZones({
      ...PAYLOAD,
      zones: [{ ...ZONE_10, zone_id: "" }, ZONE_630],
    });
    expect(zones.map((zone) => zone.zone_id)).toEqual(["630"]);
    expect(
      normalizeZones({
        ...PAYLOAD,
        zones: undefined,
      } as unknown as ZoneStatusResponse),
    ).toEqual([]);
  });

  it("uses the selected zone window and keeps the permit balance", () => {
    const status = applyZoneToStatus(normalizeZoneStatus(PAYLOAD), ZONE_630);
    expect(status).toEqual({
      state: "free",
      kind: "next",
      start: ZONE_630.window_start,
      end: ZONE_630.window_end,
      remainingMinutes: 120,
      balanceUnit: "MINUTE",
    });
  });

  it("does not overlay cached zones on a failed status", () => {
    expect(applyZoneToStatus(EMPTY_ZONE_STATUS, ZONE_630)).toBe(
      EMPTY_ZONE_STATUS,
    );
  });
});

describe("start_reservation zone payload", () => {
  it("sends the selected zone, or the first zone by default", () => {
    const zones = normalizeZones(PAYLOAD);
    expect(buildZoneServiceData(zones, "630")).toEqual({ zone_id: "630" });
    expect(buildZoneServiceData(zones, undefined)).toEqual({ zone_id: "10" });
  });

  it("omits zone_id when the permit has no zones", () => {
    const zones = normalizeZones({ ...PAYLOAD, zones: [] });
    expect(buildZoneServiceData(zones, "630")).toEqual({});
  });
});
