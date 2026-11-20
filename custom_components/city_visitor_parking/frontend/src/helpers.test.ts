/** Tests for the device and config entry helpers shared by the Lovelace cards. */
import { describe, expect, it } from "vitest";
import {
  DOMAIN,
  buildPermitTitleMap,
  filterDomainDevices,
  filterDomainDevicesForEntry,
  getConfigEntryId,
  resolvePermitLabelsByDevice,
  startedReservationMessage,
} from "./helpers";
import type { DeviceEntry, PermitEntry } from "./types";

const entries: PermitEntry[] = [
  { entry_id: "entry-a", title: "Home - 111" },
  { entry_id: "entry-b", title: "Office - 222" },
  { entry_id: "entry-c", title: null },
];

describe("resolvePermitLabelsByDevice", () => {
  it("labels each device with the title of its own config entry", () => {
    // The device registry exposes a single `config_entry_id` per device.
    const devices: DeviceEntry[] = [
      { id: "device-a", config_entry_id: "entry-a" },
      { id: "device-b", config_entry_id: "entry-b" },
    ];

    const labels = resolvePermitLabelsByDevice(
      devices,
      buildPermitTitleMap(entries),
    );

    expect(labels.get("device-a")).toBe("Home - 111");
    expect(labels.get("device-b")).toBe("Office - 222");
  });

  it("falls back to the entry id when the entry has no title", () => {
    const labels = resolvePermitLabelsByDevice(
      [{ id: "device-c", config_entry_id: "entry-c" }],
      buildPermitTitleMap(entries),
    );

    expect(labels.get("device-c")).toBe("entry-c");
  });

  it("falls back to the entry id when the entry is unknown", () => {
    const labels = resolvePermitLabelsByDevice(
      [{ id: "device-x", config_entry_id: "entry-gone" }],
      buildPermitTitleMap(entries),
    );

    expect(labels.get("device-x")).toBe("entry-gone");
  });

  it("skips devices without a config entry id", () => {
    // Older registry payloads listed `config_entries` instead.
    const legacyDevice = {
      id: "device-legacy",
      config_entries: ["entry-a"],
    } as unknown as DeviceEntry;

    const labels = resolvePermitLabelsByDevice(
      [legacyDevice, { id: "device-empty", config_entry_id: "" }],
      buildPermitTitleMap(entries),
    );

    expect(labels.size).toBe(0);
  });
});

describe("filterDomainDevices", () => {
  it("keeps only devices owned by this integration", () => {
    const devices: DeviceEntry[] = [
      {
        id: "ours",
        identifiers: [[DOMAIN, "entry-a"]],
        config_entry_id: "entry-a",
      },
      {
        id: "other",
        identifiers: [["other_domain", "x"]],
        config_entry_id: "entry-z",
      },
      { id: "no-identifiers" },
    ];

    expect(filterDomainDevices(devices).map((device) => device.id)).toEqual([
      "ours",
    ]);
  });
});

describe("filterDomainDevicesForEntry", () => {
  const devices: DeviceEntry[] = [
    {
      id: "device-a",
      identifiers: [[DOMAIN, "entry-a"]],
      config_entry_id: "entry-a",
    },
    {
      id: "device-b",
      identifiers: [[DOMAIN, "entry-b"]],
      config_entry_id: "entry-b",
    },
    // Same config entry id, but owned by another integration.
    {
      id: "foreign",
      identifiers: [["other_domain", "x"]],
      config_entry_id: "entry-b",
    },
  ];

  it("selects only the device of the requested permit entry", () => {
    expect(
      filterDomainDevicesForEntry(devices, "entry-b").map(
        (device) => device.id,
      ),
    ).toEqual(["device-b"]);
  });

  it("returns nothing for an entry without a device", () => {
    expect(filterDomainDevicesForEntry(devices, "entry-c")).toEqual([]);
  });
});

describe("getConfigEntryId", () => {
  it("returns the configured entry id", () => {
    expect(getConfigEntryId({ config_entry_id: "entry-a" })).toBe("entry-a");
  });

  it("returns null when no entry is configured", () => {
    expect(getConfigEntryId({})).toBeNull();
    expect(getConfigEntryId({ config_entry_id: null })).toBeNull();
    expect(getConfigEntryId(undefined)).toBeNull();
  });
});

describe("startedReservationMessage", () => {
  const templates: Record<string, string> = {
    "message.reservation_started": "started until {end}",
    "message.reservation_planned": "planned {start} to {end}",
  };
  const localizeKey = (key: string) => templates[key] ?? key;
  // Local times, so the result does not depend on the test machine's zone.
  const now = new Date(2026, 10, 20, 21, 0);

  it("shows when a running reservation ends, as a time for today", () => {
    expect(
      startedReservationMessage(
        {
          status: "active",
          start_time: new Date(2026, 10, 20, 21, 0).toISOString(),
          end_time: new Date(2026, 10, 20, 23, 42).toISOString(),
        },
        now,
        "en-GB",
        localizeKey,
      ),
    ).toBe("started until 23:42");
  });

  it("shows start and end of a planned reservation with the day", () => {
    expect(
      startedReservationMessage(
        {
          status: "planned",
          start_time: new Date(2026, 10, 21, 10, 0).toISOString(),
          end_time: new Date(2026, 10, 21, 11, 0).toISOString(),
        },
        now,
        "en-GB",
        localizeKey,
      ),
    ).toMatch(/^planned Sat.*10:00 to Sat.*11:00$/);
  });
});
