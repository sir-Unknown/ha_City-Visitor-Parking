# Migration Guide

## Frontend Bundle Consolidation

The Lovelace frontend bundles were consolidated to a single served resource:

- `/city_visitor_parking/city-visitor-parking-card.js`

The legacy active-card resource URL is no longer served:

- `/city_visitor_parking/city-visitor-parking-active-card.js`

### What to change

For YAML dashboards, keep this resource:

```yaml
resources:
  - url: /city_visitor_parking/city-visitor-parking-card.js
    type: module
```

Remove `city-visitor-parking-active-card.js` if it is still listed.

### After updating

1. Restart Home Assistant.
2. Hard-refresh your browser (or clear cache) once.
