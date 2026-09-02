# Kanban

Multiplayer kanban boards for shared development workspaces, with a companion Tasks panel for scheduling.

## Panels

**Kanban** — boards, columns and cards shared live with everyone in the workspace.

- Multiple boards per workspace, created from templates (Basic, Software, Bug triage, Sprint)
- Drag cards between columns and reorder columns; drops commit once and stay stable under concurrent edits
- Card editor: title, live co-edited description, checklist, comments, activity, labels, assignees, priority, start/due dates, estimate, reminder, recurrence, cover color and custom fields
- Swimlanes by assignee, priority, label or a custom select field
- WIP limits, done-column semantics, archive, undo/redo
- Presence: who is on the board, who is editing or moving which card
- Search, filters (mine, unassigned, overdue, labels, people, priority, hide completed) — private per person
- Context menus on cards, columns and boards; keyboard shortcuts (`C` new card, `/` search, `\` sidebar)

**Tasks** — every card across boards as a list, schedule or timeline.

- Quick add with natural language: `Fix login tomorrow 3pm !high #bug @me ~2h`
- List view grouped by due date, board, column, assignee, priority or label
- Schedule view with Overdue / Today / Tomorrow / This week / Next week / Later buckets; drag to reschedule
- Timeline view with start→due bars you can drag and resize
- Export due dates as ICS or all tasks as CSV

## Customization

Board settings (gear icon) cover columns and WIP limits, labels, custom fields (text, number, select, date, checkbox, URL, person), display options (chips, density, column width, swimlanes) and automations.

Automation rules run when cards are created, moved, changed or completed, and on timers when a due or start date passes:

```
When   a card moves to Done
If     assignees is empty
Then   mark complete · assign me · add label · set due +3d · notify
```

Rules run on the client that makes the change; timed rules use compare-and-set stamps so they fire once even with many people online.

## Local installation

```bash
git clone https://github.com/forloopcodes/sm-workspace-kanban.git /soft-machine/plugins/kanban
```

Enable **Kanban** from the workspace plugin manager, then open the Kanban and Tasks panels.

## Development

Source is plain TypeScript/React under `src/`; the workspace bundles it on save. Pure modules have tests:

```bash
bun test
```

## Assets

SVG and 512×512 PNG icons live in [`assets/`](./assets/).
