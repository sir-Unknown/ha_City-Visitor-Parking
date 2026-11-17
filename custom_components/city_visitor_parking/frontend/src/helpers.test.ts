/** Tests for the device and config entry helpers shared by the Lovelace cards. */
import { describe, expect, it } from "vitest";
import {
  DOMAIN,
  buildPermitTitleMap,
  filterDomainDevices,
  getConfigEntryId,
  resolvePermitLabelsByDevice,
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

  it("keeps one device per permit entry so cards can pick by entry", () => {
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
    ];

    const domainDevices = filterDomainDevices(devices);

    expect(
      domainDevices.filter((device) => device.config_entry_id === "entry-b"),
    ).toEqual([devices[1]]);
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
