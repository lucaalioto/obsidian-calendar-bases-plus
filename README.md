# Calendar Bases Plus

A fork of **[Calendar Bases](https://github.com/edrickleong/obsidian-calendar-bases)**
by [Edrick Leong](https://github.com/edrickleong), adding the ability to create a
note directly from a day on the calendar.

All of the original plugin's work — the Bases calendar view itself, drag to
reschedule, hover previews, the context menu — is his. This fork only adds note
creation. Released under the same MIT licence; see `LICENSE`.

The upstream README is kept as `README.upstream.md`.

## What this fork adds

- A **+** on each day cell (always visible on touch devices, revealed on hover
  on desktop) that creates a note dated to that day.
- A popup for the note's name and properties, so you never leave the calendar.
- Three view options under **New notes**:
  - **Folder** — where new notes are created (native folder picker).
  - **Name** — default note name; supports `{{date}}`.
  - **Fields to prompt for** — properties to ask for, written as `name` or
    `name=default`. A `true`/`false` default becomes a toggle; a property named
    `tags` gets an autocomplete of tags already used in the vault, ordered by
    how recently they were used.
- Notes are written with frontmatter and an empty body, so template plugins
  such as Templater still apply their folder templates.

The **+** is hidden when the view's start date is not a writable `note.`
property, since there would be nowhere to record the clicked date.

## Installing

This is not in the community plugin store. Use
[BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install BRAT from Community Plugins.
2. BRAT → *Add a beta plugin* → this repository's URL.
3. Enable **Calendar Bases Plus**.

Do not run this alongside the original Calendar Bases — both register the
`calendar` Bases view type.

Because the plugin id differs from `calendar-bases`, updating the original from
the community store will not overwrite this one.

## Building

Requires Node.

```
npm install
npm run build
```

Outputs `main.js`; ship it with `manifest.json` and `styles.css`.

## Upstream

The note-creation work is offered upstream at
[issue #41](https://github.com/edrickleong/obsidian-calendar-bases/issues/41).
If it lands there, this fork can be retired.
