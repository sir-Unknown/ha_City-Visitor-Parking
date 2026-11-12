import { describe, expect, it } from "vitest";
import {
  EMPTY_ZONE_STATUS,
  applyZoneToStatus,
  dropForeignZoneId,
  formatReservationZone,
  formatZoneWindow,
  getZoneEditorVisibility,
  normalizeZoneStatus,
  normalizeZones,
  resolveCardZone,
  resolveHour12,
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

const ZONE_632: ZoneStatusZone = {
  ...ZONE_630,
  zone_id: "632",
  name: "Noord",
};

describe("card zone resolution", () => {
  const zones = [ZONE_10, ZONE_630, ZONE_632];
  const resolve = (options: Parameters<typeof resolveCardZone>[1]) =>
    resolveCardZone(zones, options)?.zone_id;

  it("lets a shown zone field prefer the user's pick over the preset", () => {
    expect(resolve({ showZone: true })).toBe("10");
    expect(resolve({ showZone: true, configZoneId: "630" })).toBe("630");
    expect(
      resolve({ showZone: true, configZoneId: "630", pickedZoneId: "632" }),
    ).toBe("632");
    expect(
      resolve({ showZone: true, configZoneId: "630", pickedZoneId: "999" }),
    ).toBe("630");
  });

  it("uses only the preset when the zone field is hidden", () => {
    expect(
      resolve({ showZone: false, configZoneId: "630", pickedZoneId: "632" }),
    ).toBe("630");
    expect(resolve({ showZone: false, pickedZoneId: "632" })).toBe("10");
    expect(resolve({ showZone: false, configZoneId: "999" })).toBe("10");
  });

  it("returns no zone for permits without zones", () => {
    expect(
      resolveCardZone([], { showZone: true, configZoneId: "630" }),
    ).toBeNull();
  });
});

describe("zone selection", () => {
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

describe("card editor zone settings", () => {
  it("shows the zone picker only for a configured permit with a choice", () => {
    expect(
      getZoneEditorVisibility({
        permitConfigured: true,
        permitZoneCount: 3,
        anyPermitHasZones: false,
      }),
    ).toEqual({ showZoneSelect: true, showZoneToggle: true });
    expect(
      getZoneEditorVisibility({
        permitConfigured: true,
        permitZoneCount: 1,
        anyPermitHasZones: true,
      }),
    ).toEqual({ showZoneSelect: false, showZoneToggle: false });
  });

  it("shows only the toggle without a permit when any permit has zones", () => {
    expect(
      getZoneEditorVisibility({
        permitConfigured: false,
        permitZoneCount: 0,
        anyPermitHasZones: true,
      }),
    ).toEqual({ showZoneSelect: false, showZoneToggle: true });
    expect(
      getZoneEditorVisibility({
        permitConfigured: false,
        permitZoneCount: 0,
        anyPermitHasZones: false,
      }),
    ).toEqual({ showZoneSelect: false, showZoneToggle: false });
  });

  it("drops a zone that does not belong to a changed or cleared permit", () => {
    const zonesByEntryId = new Map([["b", [ZONE_10, ZONE_630]]]);
    const config = { type: "t", config_entry_id: "a", zone_id: "630" };
    expect(dropForeignZoneId(config, "a", zonesByEntryId)).toBe(config);
    expect(
      dropForeignZoneId(
        { ...config, config_entry_id: "c" },
        "a",
        zonesByEntryId,
      ),
    ).toEqual({ type: "t", config_entry_id: "c" });
    expect(
      dropForeignZoneId(
        { ...config, config_entry_id: undefined },
        "a",
        zonesByEntryId,
      ),
    ).toEqual({ type: "t", config_entry_id: undefined });
    expect(
      dropForeignZoneId(
        { ...config, config_entry_id: "b" },
        "a",
        zonesByEntryId,
      ),
    ).toEqual({ ...config, config_entry_id: "b" });
  });
});

describe("zone window line", () => {
  const templates: Record<string, string> = {
    "label.zone_window_current": "Paid parking now: {start} – {end}",
    "label.zone_window_next": "Next paid parking: {start} – {end}",
    "label.zone_window_none": "No upcoming paid parking",
  };
  const localizeFn = (key: string): string => templates[key] ?? key;
  const options = {
    language: "en-GB",
    hour12: false,
    timeZone: "Europe/Amsterdam",
    now: new Date("2026-11-12T12:00:00+00:00"),
  };

  it("shows today's current window as times", () => {
    expect(formatZoneWindow(ZONE_10, localizeFn, options)).toBe(
      "Paid parking now: 09:00 – 23:00",
    );
  });

  it("adds the day for a later window and an end on another day", () => {
    expect(formatZoneWindow(ZONE_630, localizeFn, options)).toBe(
      "Next paid parking: Fri 13 Nov, 10:00 – 18:00",
    );
    expect(
      formatZoneWindow(
        {
          ...ZONE_630,
          window_start: "2026-11-13T08:00:00+00:00",
          window_end: "2026-11-14T00:00:00+00:00",
        },
        localizeFn,
        options,
      ),
    ).toBe("Next paid parking: Fri 13 Nov, 09:00 – Sat 14 Nov, 01:00");
  });

  it("keeps a window ending at midnight on its start day", () => {
    expect(
      formatZoneWindow(
        { ...ZONE_10, window_end: "2026-11-12T23:00:00+00:00" },
        localizeFn,
        options,
      ),
    ).toBe("Paid parking now: 09:00 – 00:00");
  });

  it("follows the user's language and clock", () => {
    expect(
      formatZoneWindow(ZONE_630, localizeFn, {
        ...options,
        language: "nl",
      }),
    ).toBe("Next paid parking: vr 13 nov, 10:00 – 18:00");
    expect(
      formatZoneWindow(ZONE_10, localizeFn, { ...options, hour12: true }),
    ).toMatch(/^Paid parking now: 09:00\s?am – 11:00\s?pm$/i);
    expect(resolveHour12({ time_format: "12" })).toBe(true);
    expect(resolveHour12({ time_format: "24" })).toBe(false);
    expect(resolveHour12({ time_format: "language" })).toBeUndefined();
  });

  it("says so when a free zone has no next window", () => {
    expect(
      formatZoneWindow(
        {
          ...ZONE_630,
          window_kind: null,
          window_start: null,
          window_end: null,
        },
        localizeFn,
        options,
      ),
    ).toBe("No upcoming paid parking");
    expect(formatZoneWindow(null, localizeFn, options)).toBeNull();
  });
});

describe("active reservation zone label", () => {
  it("prefers the zone name, falls back to the id, else nothing", () => {
    expect(
      formatReservationZone({ zone_id: "630", zone_name: "Kralingen" }),
    ).toBe("Kralingen");
    expect(formatReservationZone({ zone_id: "630" })).toBe("630");
    expect(formatReservationZone({})).toBeNull();
  });
});
