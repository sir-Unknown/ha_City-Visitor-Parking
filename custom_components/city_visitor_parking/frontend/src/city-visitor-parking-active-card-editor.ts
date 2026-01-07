const ACTIVE_CARD_CONFIG_FORM = {
  schema: [
    {
      name: "config_entry_id",
      selector: { config_entry: { integration: "city_visitor_parking" } },
      required: false,
      description:
        "Optional. Limit the list to one permit. Leave empty to show all permits.",
    },
    {
      name: "title",
      selector: { text: {} },
      required: false,
      description: "Optional custom title shown at the top of the card.",
    },
    {
      name: "icon",
      selector: { icon: {} },
      required: false,
      description: "Optional icon shown next to the title.",
    },
    {
      name: "theme",
      selector: { theme: {} },
      required: false,
      description: "Optional theme name applied to this card only.",
    },
  ],
} as const;

export const getActiveCardConfigForm = (): {
  readonly schema: ReadonlyArray<Record<string, unknown>>;
} => ACTIVE_CARD_CONFIG_FORM;
