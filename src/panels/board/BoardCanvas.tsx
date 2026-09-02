import { useCallback, useMemo, useRef, useState, type PointerEvent } from "react";
import styled from "styled-components";
import { CrossListDragProvider, Icon, t, useCrossListDrag } from "@soft-machine/sdk";
import { PRIORITIES, type Card, type Column as ColumnModel } from "../../state/types";
import { PRIORITY_RANK, priorityLabel } from "../../state/tones";
import { InlineInput, Muted, Segment, SegmentGroup, useElementWidth } from "../../ui/shared";
import { useBoardUi, type Lane } from "./boardContext";
import { Column } from "./Column";

const Scroller = styled.div`
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scrollbar-width: thin;
`;

const LaneRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 0;
  flex: 1 1 auto;
  @container (max-width: 520px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const LaneHeader = styled.div`
  position: sticky;
  left: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: ${t.typography.xs};
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: ${t.text.muted};
  & > span:last-child {
    font-family: ${t.fontMono};
    font-size: ${t.typographyMono.micro};
  }
`;

const AddColumn = styled.button`
  flex: 0 0 auto;
  width: 200px;
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px dashed ${t.border};
  border-radius: calc(${t.radius} * 1.25);
  font: inherit;
  font-size: ${t.typography.sm};
  color: ${t.text.muted};
  background: transparent;
  cursor: pointer;
  &:hover {
    color: ${t.text.primary};
    border-color: color-mix(in srgb, ${t.text.muted} 35%, ${t.border});
    background: ${t.bg.tertiary};
  }
  @container (max-width: 520px) {
    width: 100%;
  }
`;

const AddColumnForm = styled.form`
  flex: 0 0 auto;
  width: 200px;
  padding: 6px;
  border-radius: calc(${t.radius} * 1.25);
  background: ${t.bg.tertiary};
  @container (max-width: 520px) {
    width: 100%;
  }
`;

const CompactSwitcher = styled.div`
  display: flex;
  padding: 8px 12px 0;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const Frame = styled.div`
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

const NARROW_BREAKPOINT = 520;

export interface BoardCanvasProps {
  cardsByColumn: Record<string, Card[]>;
}

export function BoardCanvas({ cardsByColumn }: BoardCanvasProps) {
  const ui = useBoardUi();
  const { board, columns, display, store } = ui;
  const [addingColumn, setAddingColumn] = useState(false);
  const [columnName, setColumnName] = useState("");
  const [compactColumn, setCompactColumn] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(frameRef);
  const narrow = width > 0 && width < NARROW_BREAKPOINT;

  const lanes = useMemo<Lane[]>(() => buildLanes(ui, cardsByColumn), [ui, cardsByColumn]);
  const activeCompactColumn = columns.find((c) => c.id === compactColumn) ?? columns[0];

  const submitColumn = (event: React.FormEvent) => {
    event.preventDefault();
    const name = columnName.trim();
    if (name) store.createColumn(board.id, name);
    setColumnName("");
    setAddingColumn(false);
  };

  const addControl = addColumnControl();

  return (
    <Frame ref={frameRef}>
      <CrossListDragProvider>
        {narrow ? (
          <>
            <CompactSwitcher>
              <SegmentGroup>
                {columns.map((column) => (
                  <Segment key={column.id} type="button" $active={activeCompactColumn?.id === column.id} onClick={() => setCompactColumn(column.id)}>
                    {column.name} · {(cardsByColumn[column.id] ?? []).length}
                  </Segment>
                ))}
              </SegmentGroup>
            </CompactSwitcher>
            <Scroller>
              {activeCompactColumn ? (
                <Column
                  column={activeCompactColumn}
                  cards={cardsByColumn[activeCompactColumn.id] ?? []}
                  listId={`${activeCompactColumn.id}::compact`}
                  group={`cards:${board.id}`}
                  totalCount={(cardsByColumn[activeCompactColumn.id] ?? []).length}
                />
              ) : (
                <Muted>No columns yet.</Muted>
              )}
              {addControl}
            </Scroller>
          </>
        ) : (
          <Scroller>
            {lanes.map((lane, index) => (
              <LaneBlock key={lane.key} lane={lane} cardsByColumn={cardsByColumn} trailing={index === 0 ? addControl : null} />
            ))}
            {lanes.length === 0 ? (
              <LaneRow>
                <ColumnsRow lane={null} cardsByColumn={cardsByColumn} />
                {addControl}
              </LaneRow>
            ) : null}
          </Scroller>
        )}
      </CrossListDragProvider>
    </Frame>
  );

  function addColumnControl() {
    if (addingColumn) {
      return (
        <AddColumnForm onSubmit={submitColumn}>
          <InlineInput
            autoFocus
            value={columnName}
            placeholder="Column name"
            aria-label="New column name"
            onChange={(event) => setColumnName(event.target.value)}
            onBlur={() => {
              if (!columnName.trim()) setAddingColumn(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setColumnName("");
                setAddingColumn(false);
              }
            }}
          />
        </AddColumnForm>
      );
    }
    return (
      <AddColumn type="button" onClick={() => setAddingColumn(true)}>
        <Icon name="Plus" size={12} />
        Add column
      </AddColumn>
    );
  }

}

function LaneBlock({ lane, cardsByColumn, trailing }: { lane: Lane; cardsByColumn: Record<string, Card[]>; trailing: React.ReactNode }) {
  const { columns } = useBoardUi();
  const count = columns.reduce((sum, column) => sum + (cardsByColumn[column.id] ?? []).filter(lane.match).length, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
      <LaneHeader>
        <span>{lane.label}</span>
        <span>{count}</span>
      </LaneHeader>
      <LaneRow>
        <ColumnsRow lane={lane} cardsByColumn={cardsByColumn} />
        {trailing}
      </LaneRow>
    </div>
  );
}

function ColumnsRow({ lane, cardsByColumn }: { lane: Lane | null; cardsByColumn: Record<string, Card[]> }) {
  const ui = useBoardUi();
  const { board, columns, store } = ui;

  const onReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      const column = columns[fromIndex];
      if (column) store.moveColumn(column.id, toIndex);
    },
    [columns, store]
  );

  const drag = useCrossListDrag({
    listId: `columns:${board.id}:${lane?.key ?? "all"}`,
    group: `columns:${board.id}:${lane?.key ?? "all"}`,
    items: columns,
    direction: "horizontal",
    onReorder,
    onReceive: () => {},
  }) as {
    getItemState: (id: string) => { isDragging: boolean; showDropBefore: boolean; showDropAfter: boolean };
    getItemHandlers: (id: string) => { onPointerDown: (event: PointerEvent<HTMLElement>) => void; ref: (element: HTMLElement | null) => void };
    listRef: (element: HTMLDivElement | null) => void;
  };

  return (
    <div ref={drag.listRef} style={{ display: "flex", gap: 10, alignItems: "flex-start", minHeight: 0, maxHeight: "100%" }}>
      {columns.map((column) => {
        const all = cardsByColumn[column.id] ?? [];
        const cards = lane ? all.filter(lane.match) : all;
        const handlers = drag.getItemHandlers(column.id);
        const state = drag.getItemState(column.id);
        return (
          <Column
            key={column.id}
            column={column}
            cards={cards}
            listId={lane ? `${column.id}::${lane.key}` : column.id}
            group={`cards:${board.id}`}
            laneValue={lane?.value}
            totalCount={all.length}
            columnDrag={{ ref: handlers.ref, onPointerDown: handlers.onPointerDown, ...state }}
          />
        );
      })}
    </div>
  );
}

function buildLanes(ui: ReturnType<typeof useBoardUi>, cardsByColumn: Record<string, Card[]>): Lane[] {
  const { display, board } = ui;
  const all = Object.values(cardsByColumn).flat();
  switch (display.swimlane) {
    case "assignee": {
      const seen = new Map<string, { id: string; name: string }>();
      for (const card of all) for (const a of card.assignees) if (!seen.has(a.id)) seen.set(a.id, a);
      const lanes: Lane[] = Array.from(seen.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((member) => ({
          key: `assignee:${member.id}`,
          label: member.name,
          value: { kind: "assignee", value: member.id },
          match: (card: Card) => card.assignees.some((a) => a.id === member.id),
        }));
      lanes.push({ key: "assignee:none", label: "Unassigned", value: { kind: "assignee", value: null }, match: (card) => card.assignees.length === 0 });
      return lanes;
    }
    case "priority":
      return ([...PRIORITIES] as Card["priority"][])
        .sort((a, b) => PRIORITY_RANK[b] - PRIORITY_RANK[a])
        .map((priority) => ({
          key: `priority:${priority}`,
          label: priorityLabel(priority),
          value: { kind: "priority", value: priority },
          match: (card: Card) => card.priority === priority,
        }));
    case "label": {
      const lanes: Lane[] = board.labels.map((label) => ({
        key: `label:${label.id}`,
        label: label.name,
        value: { kind: "label", value: label.id },
        match: (card: Card) => card.labels.includes(label.id),
      }));
      lanes.push({ key: "label:none", label: "No label", value: { kind: "label", value: null }, match: (card) => card.labels.length === 0 });
      return lanes;
    }
    case "field": {
      const field = board.fields.find((f) => f.id === display.swimlaneFieldId);
      if (!field) return [];
      const values = field.kind === "select" ? (field.options ?? []) : Array.from(new Set(all.map((c) => String(c.fields[field.id] ?? "")).filter(Boolean)));
      const lanes: Lane[] = values.map((value) => ({
        key: `field:${field.id}:${value}`,
        label: `${field.name}: ${value}`,
        value: { kind: "field", value: `${field.id}::${value}` },
        match: (card: Card) => String(card.fields[field.id] ?? "") === value,
      }));
      lanes.push({
        key: `field:${field.id}:none`,
        label: `No ${field.name}`,
        value: { kind: "field", value: `${field.id}::` },
        match: (card) => card.fields[field.id] === undefined || card.fields[field.id] === null || card.fields[field.id] === "",
      });
      return lanes;
    }
    default:
      return [];
  }
}

export type { ColumnModel };
