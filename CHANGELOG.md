# Changelog

## 2026-02-18

### Added
- New action `SyncRowToFramer` for single-row sync workflows in Coda buttons.
- Compact status output for formulas:
  - `Sync ✅`
  - `Sync ✅ Publish ✅`
  - `Sync ✅ Publish ❌`
  - `Sync ❌` / `Sync ❌ Publish ❌`

### Changed
- `SyncTableToFramer` remains the full-table action and no longer doubles as row-sync mode.
- Row selector guidance updated to prefer slug-field values when API row IDs are not available.
- Documentation updated with `ModifyRows()` examples and row selector usage.
