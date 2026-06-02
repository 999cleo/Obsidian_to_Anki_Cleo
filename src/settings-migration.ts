// Plugin settings migration / defaults backfill.
//
// Historically the upstream Kai plugin only ran this block inside
// SettingsTab.display(), meaning a user could load the plugin and sync without
// ever opening the settings tab. The disk state would still hold legacy keys
// (`Tag` instead of `Default Tags`, `Add Obsidian Tags` instead of
// `Add Inline Tags`, etc.) and code paths like `setting-to-data.ts` would crash
// on `undefined.split(",")`.
//
// In this fork the function is called from `loadSettings()` so every plugin
// start guarantees a migrated, well-formed Defaults block, no matter whether
// the user has ever opened the settings UI.
//
// Keep this in lock-step with SettingsTab.addDefaultSettings — any new default
// added there should be added here too.

export function migrateAndBackfillSettings(settings: any): any {
    if (!settings || typeof settings !== "object") return settings
    if (!settings.Defaults || typeof settings.Defaults !== "object") {
        settings.Defaults = {}
    }
    const D = settings.Defaults

    const ensure = (k: string, v: any) => {
        if (!Object.prototype.hasOwnProperty.call(D, k)) D[k] = v
    }
    const renameIfPresent = (oldKey: string, newKey: string) => {
        if (Object.prototype.hasOwnProperty.call(D, oldKey)) {
            D[newKey] = D[oldKey]
            delete D[oldKey]
        }
    }

    // Field-name migrations (old key -> new key). Run BEFORE backfill so the
    // value carries over rather than getting overwritten by a default.
    renameIfPresent("Add Obsidian Tags", "Add Inline Tags")
    renameIfPresent("Tag", "Default Tags")
    renameIfPresent("Format Obsidian Tags as Anki Hierarchical Tags", "Convert to Anki Hierarchy")
    renameIfPresent("Add Obsidian YAML Tags", "Add Frontmatter Tags")

    // Backfill missing defaults.
    ensure("Scan Directory", "")
    ensure("Scan Tags", "")
    ensure("Add Context", false)
    ensure("Add Aliases", false)
    ensure("Scheduling Interval", 0)
    ensure("CurlyCloze - Highlights to Clozes", false)
    ensure("Add Inline Tags", false)
    ensure("Default Tags", "Obsidian_to_Anki")
    ensure("Convert to Anki Hierarchy", true)
    ensure("CurlyCloze - Keyword", "Cloze")
    ensure("Smart Scan", true)
    ensure("Add Frontmatter Tags", false)
    ensure("Bulk Delete IDs", false)
    ensure("Regex Required Tags", false)
    ensure("Add File Link - Link Label", "Obsidian")
    ensure("Save Note ID to Frontmatter", false)
    ensure("Render Clozes in Reading View", false)
    ensure("Render Clozes - Highlight", false)
    ensure("Cloze Deletion Context Menu", false)
    ensure("Show Status Bar", true)
    ensure("AnkiConnect API Key", "")

    // Defaults likely present from original Pseudonium installs but worth
    // pinning here so syncFiles never crashes on undefined access.
    ensure("Add File Link", false)
    ensure("CurlyCloze", false)
    ensure("ID Comments", true)
    ensure("Deck", "Default")

    // Top-level structures setting-to-data.ts iterates over.
    if (!settings.CUSTOM_REGEXPS || typeof settings.CUSTOM_REGEXPS !== "object") {
        settings.CUSTOM_REGEXPS = {}
    }
    if (!settings.REGEXP_TAGS || typeof settings.REGEXP_TAGS !== "object") {
        settings.REGEXP_TAGS = {}
    }
    if (!settings.FILE_LINK_FIELDS || typeof settings.FILE_LINK_FIELDS !== "object") {
        settings.FILE_LINK_FIELDS = {}
    }
    if (!settings.CONTEXT_FIELDS || typeof settings.CONTEXT_FIELDS !== "object") {
        settings.CONTEXT_FIELDS = {}
    }
    if (!settings.ALIAS_FIELDS || typeof settings.ALIAS_FIELDS !== "object") {
        settings.ALIAS_FIELDS = {}
    }
    if (!settings.FOLDER_DECKS || typeof settings.FOLDER_DECKS !== "object") {
        settings.FOLDER_DECKS = {}
    }
    if (!settings.FOLDER_TAGS || typeof settings.FOLDER_TAGS !== "object") {
        settings.FOLDER_TAGS = {}
    }
    if (!Array.isArray(settings.IGNORED_FILE_GLOBS)) {
        settings.IGNORED_FILE_GLOBS = []
    }
    if (!settings.Syntax || typeof settings.Syntax !== "object") {
        settings.Syntax = {}
    }
    const S = settings.Syntax
    if (!S["Begin Note"]) S["Begin Note"] = "START"
    if (!S["End Note"]) S["End Note"] = "END"
    if (!S["Begin Inline Note"]) S["Begin Inline Note"] = "STARTI"
    if (!S["End Inline Note"]) S["End Inline Note"] = "ENDI"
    if (!S["Target Deck Line"]) S["Target Deck Line"] = "TARGET DECK"
    if (!S["File Tags Line"]) S["File Tags Line"] = "FILE TAGS"
    if (!S["Delete Note Line"]) S["Delete Note Line"] = "DELETE"
    if (!S["Frozen Fields Line"]) S["Frozen Fields Line"] = "FROZEN"

    return settings
}
