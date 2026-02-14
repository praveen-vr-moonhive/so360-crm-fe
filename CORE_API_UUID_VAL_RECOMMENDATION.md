# Document: Core API UUID Validation Requirements

## Issue Summary
The SO360 Core/CRM backend fails with an internal server error (500) when the `X-Org-Id` or `X-Tenant-Id` headers contain non-UUID strings (e.g., `default-org`). This is caused by strict database syntax checks on UUID types.

## Observed Behavior
When a request is made to endpoints like `GET /deals/pipeline` or `GET /leads` with an invalid UUID format:
```json
{
  "statusCode": 500,
  "timestamp": "2026-01-26T14:14:47.716Z",
  "path": "/leads",
  "message": "Supabase error: invalid input syntax for type uuid: \"default-org\" (code: 22P02)"
}
```

## Recommended Fix in Core API
1.  **Header Validation Middleware**:
    *   Implement a middleware to validate `X-Org-Id` and `X-Tenant-Id` headers before they reach the controller.
    *   If the ID is not a valid UUID, return a `400 Bad Request` with a clear message (e.g., "Invalid Organization ID format") instead of a `500 Internal Server Error`.
2.  **Flexible Mock Handling (Development only)**:
    *   In development environments, consider allowing specific mock strings (like `default-tenant`) and mapping them to a fixed dummy UUID instead of throwing a database exception.

## Impacts on MFEs
Currently, the CRM MFE uses a "Shell Sync" pattern which may pass mock strings during initial boot or configuration. The lack of graceful error responses from Core APIs causes the MFE frontend to fail silently (e.g., empty pipelines).

## Current CRM Mitigation
The CRM MFE has implemented a client-side "Self-Healing" mechanism:
- **UUID Pre-validation**: Warns in console if non-UUIDs are detected.
- **Fail-Safe Merge**: If specialized grouping endpoints fail due to ID issues, the MFE falls back to manual client-side data merging using base endpoints.
