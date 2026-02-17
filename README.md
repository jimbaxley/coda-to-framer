# Framer API Sync Pack

A Coda Pack that syncs entire Coda tables to Framer collections via a Vercel serverless function.

**Pack ID**: `48333`  
**Status**: Active

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

## Usage

In your Coda document, use the `SyncTableToFramer` formula (action):

```coda
=SyncTableToFramer(
  "https://coda-to-framer-node.vercel.app/api/sync",
  "https://framer.com/projects/your-project-id",
  "TableName",
  "MyFramerCollection",
  "cUeRj7vZKT"
)
```

### Parameters

- **Worker URL** (required): Your Vercel API endpoint (e.g., `https://coda-to-framer-node.vercel.app/api/sync`)
- **Framer Project URL** (required): Your Framer project (e.g., `https://framer.com/projects/abc123`)
- **Table ID or Name** (required): The Coda table to sync (table name or ID)
- **Collection Name** (required): Name for the Framer collection (created if missing)
- **Slug Field ID** (required): Column ID to use as the unique identifier (e.g., `cUeRj7vZKT`)
- **Row Limit** (optional): Maximum rows to sync (default: 100, max: 500)

### Finding Your IDs

**Document ID**: Automatically detected from the current doc  
**Table Name/ID**: "MyTable" or use the table ID from the URL  
**Column/Field ID**: Use the format like `cUeRj7vZKT` (found in Coda's API explorer or pack formulas)  
**Framer Project URL**: `https://framer.com/projects/abc123`

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

### Hybrid Authentication (Option C)

- **Coda Data Extraction**: Uses shared `CODA_API_TOKEN` (service account) stored in Cloudflare Worker secrets
- **Framer Push**: Uses user-authenticated Framer API key (passed from Coda Pack to Worker)

**Benefits**:
- User-specific Framer authentication (different Framer projects per user)
- Coda extraction uses shared service quota (simplifies setup)
- Both tokens encrypted

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
- **Requires valid slug field** - Each row must have a value in the slug column to be synced
- **Worker response timeout** - Syncs timing out (try reducing row count)

## Support

- **Vercel Backend**: [coda-to-framer-node](https://github.com/jimbaxley/coda-to-framer-node) - See repo for deployment instructions
- **Framer API Docs**: https://www.framer.com/developers/server-api-introduction
- **Coda API Docs**: https://coda.io/developers/apis/v1
