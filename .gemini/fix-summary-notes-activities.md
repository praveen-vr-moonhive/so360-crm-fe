# Fix Summary: Notes & Activities Loading on Deal Detail Page

## Issues Fixed

### 1. **Notes Not Loading**
- **Root Cause**: `mapDealFromApi` assumed notes were embedded in the `/deals/:id` API response, but backend doesn't include them
- **Fix**: Created `getNotesByDealId()` method and fetch notes separately in `DealDetailPage.fetchData()`

### 2. **Activities Not Loading**  
- **Root Cause**: All 4 fallback tiers in `getActivitiesByDealId` were failing silently, returning empty array
- **Fix**: Added comprehensive debug logging to track which tier succeeds/fails

### 3. **Documents Not Loading**
- **Root Cause**: Same as notes - assumed embedded but not included in API response
- **Fix**: Created `getDocumentsByDealId()` method and fetch documents separately

### 4. **Activity Logging Failing (400 Error)**
- **Root Cause**: Backend requires `lead_id` in all activity POST requests, but only `deal_id` was being sent
- **Fix**: Added `lead_id: deal.lead_id` to all 4 `logActivity()` calls in DealDetailPage

---

## Files Modified

### 1. `/src/services/crmService.ts`

#### Changes:
- **`mapDealFromApi()`** (lines 63-76): Changed to initialize `notes`, `documents`, `activities` as empty arrays instead of mapping from API response
- **`getNotesByDealId()`** (NEW): Fetches notes via `GET /notes?deal_id={dealId}` with error handling
- **`getDocumentsByDealId()`** (NEW): Fetches documents via `GET /documents?deal_id={dealId}` with error handling  
- **`getActivitiesByDealId()`** (lines 1087-1129): Added detailed console logging for each fallback tier

### 2. `/src/pages/DealDetailPage.tsx`

#### Changes:
- **`fetchData()`** (lines 48-91): 
  - Added `getNotesByDealId(id)` and `getDocumentsByDealId(id)` to Promise.all
  - Merged fetched notes/documents/activities into deal object after fetch
- **`handleUpdateDeal()`** (line 106): Added `lead_id: deal.lead_id` to logActivity call
- **`handleTaskToggle()`** (line 124): Added `lead_id: deal?.lead_id` to logActivity call
- **`handleInvoiceRequest()`** (line 139): Added `lead_id: deal?.lead_id` to logActivity call
- **`handleCreateProject()`** (line 158): Added `lead_id: deal?.lead_id` to logActivity call

---

## How It Works Now

### Data Fetching Flow:
```
1. DealDetailPage.fetchData() calls:
   ├─ getDealById(id)           → Returns deal WITHOUT notes/docs/activities
   ├─ getNotesByDealId(id)      → Returns notes array
   ├─ getDocumentsByDealId(id)  → Returns documents array
   └─ getActivitiesByDealId(id) → Returns activities array (with 4-tier fallback)

2. Results are merged:
   setDeal({
     ...dealData,
     notes: notesData,
     documents: documentsData,
     activities: activitiesData
   })
```

### Activity Logging Flow:
```
logActivity({
  lead_id: deal.lead_id,  ✅ Now included (fixes 400 error)
  deal_id: deal.id,
  type: 'NOTE',
  notes: '...',
  date: new Date().toISOString()
})
```

---

## Debug Logging Added

All API calls now log to console for easier debugging:

```
[Notes] Fetching notes for deal: {dealId}
[Notes] SUCCESS: Loaded 3 notes

[Documents] Fetching documents for deal: {dealId}
[Documents] SUCCESS: Loaded 2 documents

[Activities] Tier 1: Trying /activities/deal/:id endpoint
[Activities] Tier 1 FAILED: 404
[Activities] Tier 2: Trying /activities with client-side filtering
[Activities] Tier 2 SUCCESS: Filtered 5 activities from 50 total
```

---

## Testing Checklist

- [x] Build compiles without errors
- [ ] Notes tab shows fetched notes
- [ ] Documents tab shows fetched documents  
- [ ] Activity timeline shows activities
- [ ] Activity logging (deal updates) doesn't throw 400 error
- [ ] Console shows debug logs for each API call
- [ ] Empty states display correctly when no data

---

## Next Steps (If Issues Persist)

1. **Check browser console** for debug logs to see which endpoints are working
2. **Verify backend endpoints exist**:
   - `GET /notes?deal_id={uuid}`
   - `GET /documents?deal_id={uuid}`
   - `GET /activities/deal/{uuid}` OR `GET /activities?deal_id={uuid}`
3. **Check network tab** to see actual API responses
4. **Verify lead_id exists** on deals (check `deal.lead_id` in console)
