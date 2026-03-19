# Migration Guide

## Frontend Bundle Consolidation

The Lovelace frontend bundles were consolidated into a single file:

- New resource URL: `/city_visitor_parking/city-visitor-parking.js`

Legacy resource URLs are no longer served:

- `/city_visitor_parking/city-visitor-parking-card.js`
- `/city_visitor_parking/city-visitor-parking-active-card.js`

### What to change

For YAML dashboards, update your resources and keep only:

```yaml
resources:
  - url: /city_visitor_parking/city-visitor-parking.js
    type: module
```

Remove old `city-visitor-parking-card.js` and
`city-visitor-parking-active-card.js` entries.

### After updating

1. Restart Home Assistant.
2. Hard-refresh your browser (or clear cache) once.
