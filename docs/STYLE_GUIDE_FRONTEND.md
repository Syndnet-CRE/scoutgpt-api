# ScoutGPT Frontend Style Guide

**What IS, not what SHOULD BE**

This guide documents frontend patterns for the ScoutGPT API project.

---

## Status: No Frontend Codebase

**This repository is backend-only (Node.js/Express API).**

The ScoutGPT frontend exists in a separate repository (React/Vite). This backend API serves JSON responses to that frontend client.

---

## API Contract Patterns

Since this is the backend repo, the "frontend patterns" relevant here are the API contracts and data formats expected by the frontend client.

### Response Data Formats

**Pattern: Properties array with geospatial data**
```json
{
  "count": 15,
  "properties": [
    {
      "attomId": 123456789,
      "addressFull": "1102 S Congress Ave",
      "latitude": 30.2545,
      "longitude": -97.7466,
      "propertyUseStandardized": "369",
      "yearBuilt": 1985,
      "areaBuilding": 2400,
      "areaLotAcres": 0.5,
      "taxAssessedValueTotal": 350000,
      "lastSaleDate": "2021-03-15",
      "lastSalePrice": 325000
    }
  ]
}
```
**Citation:** Inferred from routes/properties.js:25 and services/propertyService.js:156-171

**Pattern: Chat response with property markers**
```json
{
  "text": "I found 12 multifamily properties...",
  "properties": [123456789, 987654321],
  "propertyMarkers": [
    {
      "attomId": 123456789,
      "latitude": 30.2545,
      "longitude": -97.7466
    }
  ],
  "intent": "property_search"
}
```
**Citation:** routes/chat.js:33-39, routes/chat.js:100-107

**Pattern: GeoJSON FeatureCollection for map layers**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "LineString", "coordinates": [[...]] },
      "properties": {
        "id": 12345,
        "diameter": 8,
        "material": "PVC",
        "source": "City of Austin"
      }
    }
  ]
}
```
**Citation:** services/gisService.js:129-133

### Field Naming Convention

**Pattern: camelCase for API responses**

All snake_case database columns are converted to camelCase before returning to frontend:

- `attom_id` → `attomId`
- `address_full` → `addressFull`
- `area_building` → `areaBuilding`
- `last_sale_date` → `lastSaleDate`

**Citation:** utils/normalize.js:1-16

**Exception:** GeoJSON properties may retain original field names from GIS sources.
**Citation:** services/gisService.js:96-120

---

## CORS Configuration

**Pattern: Permissive CORS for development**
```javascript
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```
**Citation:** server.js:10-14

**Note:** `CORS_ORIGIN` can be set to specific frontend origin in production.

---

## Client Integration Notes

Based on the API structure, the frontend is expected to:

1. **Send chat messages** as `POST /api/chat` with:
   ```json
   {
     "messages": [{ "role": "user", "content": "..." }],
     "context": {
       "selectedProperty": 123456789,
       "bbox": "-97.8,30.2,-97.7,30.3"
     }
   }
   ```
   **Citation:** routes/chat.js:9-19

2. **Render property markers** on a map using `latitude`/`longitude` from responses.
   **Citation:** routes/chat.js:91-95

3. **Display GeoJSON layers** for zoning, flood zones, and infrastructure.
   **Citation:** services/gisService.js:135-138

4. **Handle intents** returned in chat responses (`property_search`, `general_chat`, `clarification_needed`).
   **Citation:** routes/chat.js:32-51

---

**Last Updated:** 2026-02-20
**Snapshot of:** Main branch, commit b939d44
