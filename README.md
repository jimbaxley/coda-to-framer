# Framer API Sync Pack

A Coda Pack that syncs entire Coda tables to Framer collections via a Vercel serverless function.

**Pack ID**: `48333`  
**Status**: Active

Includes two actions:
- `SyncTableToFramer` for full-table sync
- `SyncRowToFramer` for single-row sync from buttons/`ModifyRows()`

## Architecture

This is part of a three-component system:

1. **Coda Extractor Pack** - Extracts data from Coda (reference implementation)
2. **Framer API Sync Pack** (this) - Triggers syncs from within Coda
3. **Vercel API** - Serverless function that orchestrates: fetch Coda data → transform → push to Framer

## How It Works

```
User clicks "Sync Table to Framer" button in Coda
    ↓
Pack formula calls Vercel API with:
  - Coda document ID (inferred from context)
  - Coda table ID/name
  - Framer project URL
  - Framer API key (user-authenticated)
  - Collection name (will be created if missing)
  - Slug field ID (for unique row identifiers)
    ↓
Worker:
1. Fetches table data from Coda API (using shared service token)
2. Normalizes columns and rows
3. Transforms Coda types → Framer field types
4. Creates/updates Framer collection
5. Pushes items to collection
6. Returns status
    ↓
Status appears in Coda
```

## Setup

### Prerequisites

1. **Vercel API** deployed (`coda-to-framer-node`)
2. **Coda API token** (service account) stored in Vercel environment variables
3. **Framer account** with API access

### Installation

1. **Install the pack in Coda**:
   - Register and upload: `npm run upload`
   - Note the Pack ID from the output
   - Add to your Coda workspace

2. **Configure Vercel API URL**:
   - Your Vercel endpoint: `https://coda-to-framer-node.vercel.app/api/sync`
   - You'll enter this as a parameter when using the formula

3. **Authenticate with Framer**:
   - When prompted, connect your Framer account
   - Visit https://www.framer.com/developers/server-api-introduction for API key

### Coda maker quick start

Current callback model is **backend writes directly to Coda API** (no inbound Coda webhook endpoint is required for this flow).

1. Create these columns in your source table: `Sync Status` (text), `Last Sync Job ID` (text), and optionally `Sync Message`.
2. Call `SyncRowToFramer(...)` or `SyncTableToFramer(...)` directly (no wrapper required to run sync).
3. Pass friendly callback values:
   - `logTableIdOrName`: table to update
   - `logRowId`: row selector (slug value or `i-...`)
   - `statusColumnId`: column name (for example `Sync Status`) or `c-...`
4. Save job IDs using `ExtractSyncJobId(...)`.
5. Poll with `GetSyncStatus(...)` until `IsSyncTerminalStatus(...)` is true.

### Advanced callback notes

- IDs are optional in common flows. Names/selectors are supported.
- `messageColumnId` and `sourceStatusColumnId` are reserved for expanded callback behavior.

## Usage

Use `SyncTableToFramer` for full-table sync:

```coda
=SyncTableToFramer(
  "https://coda-to-framer-node.vercel.app/api/sync",
  "https://framer.com/projects/your-project-id",
  "TableName",
  "MyFramerCollection",
  "cUeRj7vZKT"
)
```

The action returns quickly with a pending message like `Sync ⏳ Accepted (job: ...)`.
Use the returned job ID with `GetSyncStatus(...)` when you want to poll for completion.

Use `SyncRowToFramer` for single-row sync (for button actions, including `ModifyRows()` workflows):

```coda
=SyncRowToFramer(
   "https://coda-to-framer-node.vercel.app/api/sync",
   "https://framer.com/projects/your-project-id",
   "TableName",
   "MyFramerCollection",
   "cUeRj7vZKT",
   thisRow.[Short Name],
   false
)
```

`SyncRowToFramer` accepts either:
- API row ID (`i-...`) if you have it, or
- a unique slug selector value (recommended) from the same column used by `slugFieldId`.

### Parameters

### Basic parameters (most makers)

- Worker URL
- Framer Project URL
- Table ID or Name
- Collection Name
- Slug Field ID
- Row ID (for `SyncRowToFramer`)
- Publish (optional)
- Initial Delay (ms) (optional)

### Callback parameters (optional)

- Log Table ID/Name
- Log Row ID (row selector or row ID)
- Status Column ID (name or ID)
- Message Column ID (reserved)
- Source Status Column ID (reserved)

### Full parameter reference

`SyncTableToFramer`

- **Worker URL** (required): Your Vercel API endpoint (e.g., `https://coda-to-framer-node.vercel.app/api/sync`)
- **Framer Project URL** (required): Your Framer project (e.g., `https://framer.com/projects/abc123`)
- **Table ID or Name** (required): The Coda table to sync (table name or ID)
- **Collection Name** (required): Name for the Framer collection (created if missing)
- **Slug Field ID** (required): Column ID to use as the unique identifier (e.g., `cUeRj7vZKT`)
- **Row Limit** (optional): Maximum rows to sync (default: 100, max: 500)
- **Publish** (optional): If true, backend publishes/deploys after successful sync
- **Delete Missing** (optional): If true, removes items from Framer that are not present in the current Coda table snapshot
- **Initial Delay (ms)** (optional): Delay before backend extraction to allow recent Coda UI edits to become API-visible
- **Log Table ID/Name** (optional): Coda table where backend callback status should be written
- **Log Row ID** (optional): Row ID in the log table used by backend callback
- **Status Column ID** (optional): Target status column name or ID for callback writes
- **Message Column ID** (optional): Target detailed message column ID for callback writes
- **Source Status Column ID** (optional): Optional source-row status mirror column ID

`SyncRowToFramer`

- **Worker URL** (required): Your Vercel API endpoint (e.g., `https://coda-to-framer-node.vercel.app/api/sync`)
- **Framer Project URL** (required): Your Framer project (e.g., `https://framer.com/projects/abc123`)
- **Table ID or Name** (required): Source Coda table name or ID
- **Collection Name** (required): Target Framer managed collection
- **Slug Field ID** (required): Column name or ID used as slug
- **Row ID** (required): API row ID (`i-...`) or unique slug selector value (for example `thisRow.[Short Name]`)
- **Publish** (optional): If true, backend publishes/deploys after successful sync
- **Initial Delay (ms)** (optional): Delay before backend extraction to allow recent Coda UI edits to become API-visible
- **Log Table ID/Name** (optional): Coda table where backend callback status should be written
- **Log Row ID** (optional): Row ID in the log table used by backend callback
- **Status Column ID** (optional): Target status column name or ID for callback writes
- **Message Column ID** (optional): Target detailed message column ID for callback writes
- **Source Status Column ID** (optional): Optional source-row status mirror column ID

`GetSyncStatus`

- **Worker URL** (required): Your Vercel API endpoint
- **Job ID** (required): Job ID returned by sync action

`ExtractSyncJobId`

- **Sync Response** (required): Text returned by `SyncTableToFramer` or `SyncRowToFramer`

`IsSyncTerminalStatus`

- **Status Text** (required): Text from `GetSyncStatus(...)` or your status column

`NormalizeSyncStatus`

- **Status Text** (required): Text from `GetSyncStatus(...)` or your status column
- Returns one of: `pending`, `running`, `succeeded`, `failed`, `unknown`

### Finding Your IDs

**Document ID**: Automatically detected from the current doc  
**Table Name/ID**: "MyTable" or use the table ID from the URL  
**Column/Field ID**: Use the format like `cUeRj7vZKT` (found in Coda's API explorer or pack formulas)  
**Row selector**: Pass API row ID (`i-...`) or the slug value (for example `thisRow.[Short Name]`)  
**Framer Project URL**: `https://framer.com/projects/abc123`

### `ModifyRows()` pattern

You can call `SyncRowToFramer(...)` inside a button formula and write the immediate pending status text back to the same row:

```coda
ModifyRows(
   thisRow,
   thisTable.[Sync Status],
   SyncRowToFramer(
      "https://coda-to-framer-node.vercel.app/api/sync",
      thisTable.[Framer Project URL],
      thisTable.[Source Table ID],
      thisTable.[Collection Name],
      thisTable.[Slug Column ID],
      thisRow.[Short Name],
      false
   )
)
```

`ModifyRows(...)` is optional. Use it only when you want to write immediate returned text in the same button step.

### Polling pattern with `GetSyncStatus`

Use a follow-up button or automation step to poll by job ID:

```coda
ModifyRows(
   thisRow,
   thisTable.[Sync Status],
   GetSyncStatus(
      "https://coda-to-framer-node.vercel.app/api/sync",
      thisRow.[Last Sync Job ID]
   )
)
```

### Store job ID without manual parsing

Use `ExtractSyncJobId(...)` to save the job ID from the pending response text:

```coda
WithName(
   SyncRowToFramer(
      "https://coda-to-framer-node.vercel.app/api/sync",
      thisTable.[Framer Project URL],
      thisTable.[Source Table ID],
      thisTable.[Collection Name],
      thisTable.[Slug Column ID],
      thisRow.[Short Name],
      false
   ),
   _resp,
   ModifyRows(
      thisRow,
      thisTable.[Sync Status], _resp,
      thisTable.[Last Sync Job ID], ExtractSyncJobId(_resp)
   )
)
```

### Stop polling when terminal

Use `IsSyncTerminalStatus(...)` in your button/automation condition:

```coda
If(
   IsSyncTerminalStatus(thisRow.[Sync Status]),
   thisRow.[Sync Status],
   ModifyRows(
      thisRow,
      thisTable.[Sync Status],
      GetSyncStatus(
         "https://coda-to-framer-node.vercel.app/api/sync",
         thisRow.[Last Sync Job ID]
      )
   )
)
```

### Branching by normalized status

Use a stable enum for automations:

```coda
SwitchIf(
   NormalizeSyncStatus(thisRow.[Sync Status]) = "succeeded", "Done",
   NormalizeSyncStatus(thisRow.[Sync Status]) = "failed", "Needs attention",
   NormalizeSyncStatus(thisRow.[Sync Status]) = "running", "In progress",
   NormalizeSyncStatus(thisRow.[Sync Status]) = "pending", "Queued",
   "Unknown"
)
```

## Webhook note

- This package currently uses **direct Coda API callback writes** from backend.
- A dedicated inbound webhook receiver in Coda is optional architecture for future expansion, but not required by the current implementation.

### Naming compatibility

- Existing formula parameter names stay the same for backward compatibility (`logRowId`, `statusColumnId`).
- Backend now also accepts clearer callback aliases (`statusRow`, `statusColumn`, `statusSlugField`) so naming can evolve without breaking existing docs/formulas.

## Do I need `ModifyRows(...)`?

- No. `ModifyRows(...)` is not required to run sync.
- Use `ModifyRows(...)` only if you want to immediately write the returned pending text into a specific cell.
- If callback fields are configured, backend can write status asynchronously without wrapping the sync call.

## Development

### Build

```bash
npm install
npm run build
```

### Validate

```bash
npm run validate
```

### Upload & Release

```bash
npm run upload
coda release build/pack.js 1.0.0
```

## Architecture Details

### Authentication Model (Vercel)

- **Coda Data Extraction**: Uses shared `CODA_API_TOKEN` (service account) stored in Vercel environment variables.
- **Framer Push**: Uses `FRAMER_API_KEY` stored in Vercel environment variables.

**Notes**:
- Keep both secrets configured in the Vercel project for the deployed `/api/sync` function.
- The pack sends sync parameters to Vercel; secret management lives in Vercel, not the pack.

### Optional backend retry/fallback tuning

The Vercel backend (`coda-to-framer-node`) supports optional environment variables for reliability/performance tuning:

- `CODA_API_RETRY_ATTEMPTS`, `CODA_API_RETRY_DELAY_MS`
- `CODA_STATE_RETRY_ATTEMPTS`, `CODA_STATE_RETRY_DELAY_MS`
- `FRAMER_RETRY_ATTEMPTS`, `FRAMER_RETRY_DELAY_MS`
- `FRAMER_CONNECT_TIMEOUT_MS`, `FRAMER_OPERATION_TIMEOUT_MS`
- `FRAMER_ADD_CHUNK_SIZE`, `FRAMER_ADD_CHUNK_TIMEOUT_MS`, `FRAMER_ADD_PER_ITEM_TIMEOUT_MS`

Behavior notes:
- When Coda returns transient empty slug values right after UI edits, backend retries Coda snapshot/mapping before final response.
- When Framer bulk `addItems` times out, backend falls back to chunked adds first, then per-item only for failed chunks.

## Folder Structure

```
framer-api-sync/
├── src/
│   └── pack.ts        # Main pack with SyncTableToFramer formula
├── build.js           # esbuild configuration
├── package.json       # Dependencies
├── tsconfig.json      # TypeScript config
├── manifest.json      # Pack metadata
├── coda.config.json   # Coda CLI configuration
├── .gitignore
└── README.md          # This file
```

## Related Projects

- **[Coda Extractor Pack](https://github.com/jimbaxley/coda-extractor)** - For manual formula-based data extraction
- **[coda-to-framer-node](https://github.com/jimbaxley/coda-to-framer-node)** - Vercel serverless backend that powers this pack

## Limitations

- **Maximum 500 rows per sync** (Coda API limit)
- **Single-row sync requires a valid row selector**
- **Requires valid slug field** - Each row must have a value in the slug column to be synced
- **Vercel function timeout** - Long-running sync/publish calls can time out (try reducing row count or publishing separately)

## Support

- **Vercel Backend**: [coda-to-framer-node](https://github.com/jimbaxley/coda-to-framer-node) - See repo for deployment instructions
- **Framer API Docs**: https://www.framer.com/developers/server-api-introduction
- **Coda API Docs**: https://coda.io/developers/apis/v1
