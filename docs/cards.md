# Lovelace cards

## Card types

- `custom:city-visitor-parking-card`
- If available in your installation: `custom:city-visitor-parking-active-card`

## Add a card

1. Go to your dashboard and select **Edit dashboard**.
2. Select **Add card**.
3. Pick **Manual** and paste the YAML.

## Minimal example

```yaml
type: custom:city-visitor-parking-card
title: Visitor parking
```

## Options

- `title`
- `icon`
- `theme`
- `config_entry_id` (use this when you have multiple config entries)
- `show_favorites`
- `show_start_time`
- `show_end_time`

## Resources (YAML dashboards only)

Storage mode registers resources automatically.

For YAML mode, add this as a `module` resource:

- `/city_visitor_parking/city-visitor-parking.js`

Breaking change: legacy resource URLs are no longer served.
If you were using the old card bundle URLs, see [MIGRATION.md](../MIGRATION.md).

## Card troubleshooting

- “Custom element doesn't exist”:
  - Check resources.
  - Restart Home Assistant.
  - Clear browser cache.
- Multiple config entries:
  - Set `config_entry_id`.
