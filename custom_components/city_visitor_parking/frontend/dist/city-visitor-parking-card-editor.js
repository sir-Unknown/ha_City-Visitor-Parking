// src/city-visitor-parking-card-editor.ts
var CARD_CONFIG_FORM = {
  schema: [
    {
      name: "config_entry_id",
      selector: { config_entry: { integration: "city_visitor_parking" } },
      required: false,
      description: "Optioneel. Kies een vergunning om de kaart aan een item te koppelen. Laat leeg om een keuzeveld te tonen."
    },
    {
      name: "title",
      selector: { text: {} },
      required: false,
      description: "Optioneel. Aangepaste titel bovenaan de kaart."
    },
    {
      name: "icon",
      selector: { icon: {} },
      required: false,
      description: "Optioneel. Pictogram naast de titel."
    },
    {
      name: "theme",
      selector: { theme: {} },
      required: false,
      description: "Optioneel. Thema dat alleen op deze kaart wordt toegepast."
    },
    {
      name: "show_favorites",
      selector: { boolean: {} },
      default: true,
      description: "Toon de favorietenkeuze in het reserveringsformulier."
    },
    {
      name: "show_start_time",
      selector: { boolean: {} },
      default: true,
      description: "Sta het kiezen van een starttijd toe in het reserveringsformulier."
    },
    {
      name: "show_end_time",
      selector: { boolean: {} },
      default: true,
      description: "Sta het kiezen van een eindtijd toe in het reserveringsformulier."
    }
  ]
};
var getCardConfigForm = () => CARD_CONFIG_FORM;
export {
  getCardConfigForm
};
