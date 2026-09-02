import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import styled from "styled-components";
import { Button, Checkbox, Icon, IconButton, Input, Select, TextArea, Toggle, UserAvatar, t, toast } from "@soft-machine/sdk";
import { formatRelative } from "../../state/dates";
import { useKanban } from "../../state/KanbanContext";
import { useActivity, useCard, useColumns, useComments, useMembers } from "../../state/hooks";
import { describeRecurrence } from "../../state/recurrence";
import type { Assignee, Card, CustomFieldDefinition } from "../../state/types";
import { DatePicker } from "../../ui/DatePicker";
import { Modal } from "../../ui/Modal";
import { FieldRow, GhostButton, Muted, Row, SectionTitle, Stack, ToneDot } from "../../ui/shared";
import { useYText } from "../../ui/useYText";
import { AssigneePicker, LabelPicker, PrioritySelect, RecurrenceEditor, ReminderSelect, ToneSwatches } from "./pickers";

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  gap: 16px;
  min-width: 0;
  @container (max-width: 640px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Main = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
`;

const Side = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
`;

const TitleInput = styled.textarea`
  width: 100%;
  resize: none;
  padding: 4px 6px;
  border: ${t.borderWidth} solid transparent;
  border-radius: ${t.radius};
  font: inherit;
  font-size: ${t.typography.lg};
  font-weight: 500;
  line-height: 1.3;
  color: ${t.text.primary};
  background: transparent;
  outline: none;
  &:hover {
    border-color: ${t.border};
  }
  &:focus {
    border-color: color-mix(in srgb, ${t.border} 92%, white 8%);
    background: ${t.bg.secondary};
  }
`;

const Description = styled(TextArea)`
  width: 100%;
  min-height: 96px;
  resize: vertical;
`;

const ChecklistRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  min-width: 0;
  & > span {
    flex: 1;
    min-width: 0;
    font-size: ${t.typography.base};
    overflow-wrap: anywhere;
  }
  & > button {
    opacity: 0;
  }
  &:hover > button,
  &:focus-within > button {
    opacity: 1;
  }
`;

const ChecklistText = styled.span<{ $done?: boolean }>`
  text-decoration: ${({ $done }) => ($done ? "line-through" : "none")};
  color: ${({ $done }) => ($done ? t.text.muted : t.text.primary)};
`;

const Progress = styled.div`
  height: 3px;
  border-radius: 2px;
  background: ${t.bg.tertiary};
  overflow: hidden;
  & > div {
    height: 100%;
    background: ${t.status.connected};
    transition: width 0.2s ease;
    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }
`;

const CommentItem = styled.div`
  display: flex;
  gap: 8px;
  min-width: 0;
`;

const CommentBody = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  & > header {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: ${t.typography.sm};
    & > strong {
      font-weight: 500;
      color: ${t.text.primary};
    }
    & > span {
      color: ${t.text.muted};
      font-size: ${t.typography.xs};
    }
  }
  & > p {
    margin: 0;
    font-size: ${t.typography.base};
    color: ${t.text.primary};
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
`;

const ActivityRow = styled.div`
  display: flex;
  gap: 6px;
  font-size: ${t.typography.xs};
  color: ${t.text.muted};
  & > strong {
    font-weight: 500;
    color: ${t.text.secondary};
  }
  & > span:last-child {
    margin-left: auto;
    flex: 0 0 auto;
  }
`;

const CardNumber = styled.span`
  font-family: ${t.fontMono};
  font-size: ${t.typographyMono.xs};
  color: ${t.text.muted};
`;

const PeerNotice = styled.div<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 20px;
  border-radius: 999px;
  font-size: ${t.typography.xs};
  color: ${t.text.primary};
  background: color-mix(in srgb, ${({ $color }) => $color} 20%, transparent);
  &::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${({ $color }) => $color};
  }
`;

export interface CardEditorProps {
  cardId: string;
  onClose: () => void;
  /** Cross-panel action shown in the footer, e.g. "Open in Tasks" or "Open in board". */
  crossAction?: { label: string; icon: "LayoutList" | "LayoutDashboard"; onClick: (cardId: string) => void };
  onDeleted?: (record: { card: Card; comments: import("../../state/types").Comment[] }) => void;
}

export function CardEditor({ cardId, onClose, crossAction, onDeleted }: CardEditorProps) {
  const { store, viewer, peers, setPresence } = useKanban();
  const card = useCard(cardId);
  const columns = useColumns(card?.boardId);
  const comments = useComments(cardId);
  const activity = useActivity(cardId);
  const members = useMembers();
  const snapshotBoard = card ? store?.snapshot.boards[card.boardId] ?? null : null;

  const [title, setTitle] = useState(card?.title ?? "");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  // Re-derive on every card snapshot change so a restored/undone card never leaves a detached Y.Text bound.
  const [yText, setYText] = useState<ReturnType<NonNullable<typeof store>["getCardText"]>>(null);
  useEffect(() => {
    const next = store && card ? store.getCardText(card.id) : null;
    setYText((prev) => (prev === next ? prev : next));
  }, [store, card]);
  const [estimateDraft, setEstimateDraft] = useState<string | null>(null);
  const description = useYText(yText, descriptionRef);
  const [checklistDraft, setChecklistDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [showActivity, setShowActivity] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setTitle(card?.title ?? "");
  }, [card?.title]);

  useEffect(() => {
    setPresence({ viewingCardId: cardId, editingCardId: cardId, editingField: null });
    return () => setPresence({ viewingCardId: null, editingCardId: null, editingField: null });
  }, [cardId, setPresence]);

  const editingPeers = peers.filter((peer) => peer.user && peer.value.editingCardId === cardId);

  const viewerAssignee: Assignee | null = viewer.id ? { id: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl } : null;

  const commitTitle = useCallback(() => {
    if (!card || !store) return;
    const next = title.trim();
    if (next && next !== card.title) store.updateCard(card.id, { title: next });
    else setTitle(card.title);
  }, [card, store, title]);

  if (!card || !store || !snapshotBoard) {
    return (
      <Modal open onClose={onClose} title="Card">
        <Muted>This card no longer exists.</Muted>
      </Modal>
    );
  }

  const board = snapshotBoard;
  const doneCount = card.checklist.filter((item) => item.done).length;
  const completed = Boolean(card.completedAt);

  const onTitleKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitTitle();
      (event.target as HTMLTextAreaElement).blur();
    }
  };

  const addComment = () => {
    if (!commentDraft.trim()) return;
    store.addComment(card.id, commentDraft);
    setCommentDraft("");
  };

  const remove = () => {
    const record = store.deleteCard(card.id);
    onClose();
    if (record) {
      onDeleted?.(record);
      toast("Card deleted", { action: { label: "Undo", onClick: () => store.restoreCard(record) } });
    }
  };

  const footer = (
    <>
      {crossAction ? (
        <GhostButton type="button" onClick={() => crossAction.onClick(card.id)}>
          <Icon name={crossAction.icon} size={12} />
          {crossAction.label}
        </GhostButton>
      ) : null}
      <GhostButton
        type="button"
        onClick={() => {
          const id = store.duplicateCard(card.id);
          if (id) toast.success("Card duplicated");
        }}
      >
        <Icon name="Copy" size={12} />
        Duplicate
      </GhostButton>
      <GhostButton
        type="button"
        onClick={() => {
          store.setArchived(card.id, !card.archived);
          if (!card.archived) {
            onClose();
            toast("Card archived", { action: { label: "Undo", onClick: () => store.setArchived(card.id, false) } });
          }
        }}
      >
        <Icon name="Box" size={12} />
        {card.archived ? "Restore" : "Archive"}
      </GhostButton>
      <span style={{ flex: 1 }} />
      {confirmDelete ? (
        <>
          <Button $variant="secondary" $compact onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button $variant="danger" $compact onClick={remove}>
            Delete card
          </Button>
        </>
      ) : (
        <GhostButton type="button" $danger onClick={() => setConfirmDelete(true)}>
          <Icon name="Trash2" size={12} />
          Delete
        </GhostButton>
      )}
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      width={760}
      title={
        <Row $gap={8}>
          <CardNumber>#{card.number}</CardNumber>
          <Muted>in</Muted>
          <Row $gap={4}>
            <ToneDot $tone={columns.find((c) => c.id === card.columnId)?.tone ?? "gray"} />
            <span style={{ fontWeight: 500 }}>{columns.find((c) => c.id === card.columnId)?.name ?? "column"}</span>
          </Row>
          {editingPeers.map((peer) => (
            <PeerNotice key={peer.clientId} $color={peer.user!.color}>
              {peer.user!.name} is here
            </PeerNotice>
          ))}
        </Row>
      }
      headerActions={
        <Row $gap={6} style={{ marginRight: 4 }}>
          <Muted>{completed ? "Completed" : "Open"}</Muted>
          <Toggle checked={completed} onChange={() => store.toggleComplete(card.id)} title={completed ? "Reopen" : "Mark complete"} />
        </Row>
      }
      footer={footer}
      ariaLabel={`Card ${card.title}`}
    >
      <Layout>
        <Main>
          <TitleInput
            ref={titleRef}
            rows={1}
            value={title}
            aria-label="Card title"
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={onTitleKey}
            onFocus={() => setPresence({ editingField: "title" })}
          />

          <Stack $gap={6}>
            <SectionTitle>Description</SectionTitle>
            <Description
              ref={descriptionRef}
              rows={4}
              placeholder="Add details, links, acceptance criteria…"
              aria-label="Description"
              value={description.value}
              onChange={description.onChange}
              onSelect={description.onSelect}
              onKeyUp={description.onKeyUp}
              onFocus={() => {
                description.onFocus();
                setPresence({ editingField: "description" });
              }}
              onBlur={() => setPresence({ editingField: null })}
            />
            {editingPeers.some((peer) => peer.value.editingField === "description") ? (
              <Muted>{editingPeers.filter((p) => p.value.editingField === "description").map((p) => p.user!.name).join(", ")} also editing the description — edits merge live.</Muted>
            ) : null}
          </Stack>

          <Stack $gap={6}>
            <Row $justify="space-between">
              <SectionTitle>Checklist</SectionTitle>
              {card.checklist.length > 0 ? (
                <Muted>
                  {doneCount}/{card.checklist.length}
                </Muted>
              ) : null}
            </Row>
            {card.checklist.length > 0 ? (
              <Progress aria-hidden>
                <div style={{ width: `${Math.round((doneCount / card.checklist.length) * 100)}%` }} />
              </Progress>
            ) : null}
            {card.checklist.map((item) => (
              <ChecklistRow key={item.id}>
                <Checkbox checked={item.done} onChange={(checked: boolean) => store.updateChecklistItem(card.id, item.id, { done: checked })} aria-label={item.text} />
                <ChecklistText $done={item.done}>{item.text}</ChecklistText>
                <IconButton title="Remove item" aria-label={`Remove ${item.text}`} onClick={() => store.removeChecklistItem(card.id, item.id)}>
                  <Icon name="X" size={12} />
                </IconButton>
              </ChecklistRow>
            ))}
            <Row $gap={6}>
              <Input
                $fullWidth
                value={checklistDraft}
                placeholder="Add checklist item"
                aria-label="New checklist item"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setChecklistDraft(event.target.value)}
                onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                  if (event.key === "Enter" && checklistDraft.trim()) {
                    store.addChecklistItem(card.id, checklistDraft);
                    setChecklistDraft("");
                  }
                }}
              />
              <GhostButton
                type="button"
                disabled={!checklistDraft.trim()}
                onClick={() => {
                  store.addChecklistItem(card.id, checklistDraft);
                  setChecklistDraft("");
                }}
              >
                Add
              </GhostButton>
            </Row>
          </Stack>

          <Stack $gap={8}>
            <SectionTitle>Comments</SectionTitle>
            {comments.length === 0 ? <Muted>No comments yet.</Muted> : null}
            {comments.map((comment) => (
              <CommentItem key={comment.id}>
                <UserAvatar name={comment.authorName} avatarUrl={null} size={20} />
                <CommentBody>
                  <header>
                    <strong>{comment.authorName}</strong>
                    <span title={comment.createdAt}>
                      {formatRelative(comment.createdAt)}
                      {comment.editedAt ? " · edited" : ""}
                    </span>
                    {comment.authorId && comment.authorId === viewer.id ? (
                      <IconButton title="Delete comment" aria-label="Delete comment" onClick={() => store.deleteComment(comment.id)} style={{ marginLeft: "auto" }}>
                        <Icon name="Trash2" size={11} />
                      </IconButton>
                    ) : null}
                  </header>
                  <p>{comment.body}</p>
                </CommentBody>
              </CommentItem>
            ))}
            <Row $gap={6} style={{ alignItems: "flex-end" }}>
              <TextArea
                rows={2}
                value={commentDraft}
                placeholder="Write a comment… (⌘/Ctrl+Enter to send)"
                aria-label="New comment"
                style={{ flex: 1, resize: "vertical" }}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setCommentDraft(event.target.value)}
                onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    addComment();
                  }
                }}
              />
              <Button $variant="secondary" $compact disabled={!commentDraft.trim()} onClick={addComment}>
                Comment
              </Button>
            </Row>
          </Stack>

          <Stack $gap={6}>
            <Row $justify="space-between">
              <SectionTitle>Activity</SectionTitle>
              <GhostButton type="button" onClick={() => setShowActivity((v) => !v)}>
                {showActivity ? "Hide" : `Show (${activity.length})`}
              </GhostButton>
            </Row>
            {showActivity
              ? activity.map((entry) => (
                  <ActivityRow key={entry.id}>
                    <strong>{entry.actor}</strong>
                    <span>{entry.summary}</span>
                    <span title={entry.at}>{formatRelative(entry.at)}</span>
                  </ActivityRow>
                ))
              : null}
            {showActivity && activity.length === 0 ? <Muted>No activity recorded.</Muted> : null}
          </Stack>
        </Main>

        <Side>
          <FieldRow>
            <label>Column</label>
            <Select aria-label="Column" value={card.columnId} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => store.moveCard(card.id, event.target.value, Number.MAX_SAFE_INTEGER)}>
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </Select>
          </FieldRow>
          <FieldRow>
            <label>Priority</label>
            <PrioritySelect value={card.priority} onChange={(priority) => store.updateCard(card.id, { priority })} />
          </FieldRow>
          <FieldRow>
            <label>Assignees</label>
            <AssigneePicker
              members={members}
              selected={card.assignees}
              viewer={viewerAssignee}
              onToggle={(member) =>
                store.updateCard(card.id, {
                  assignees: card.assignees.some((a) => a.id === member.id) ? card.assignees.filter((a) => a.id !== member.id) : [...card.assignees, member],
                })
              }
            />
          </FieldRow>
          <FieldRow>
            <label>Labels</label>
            <LabelPicker
              labels={board.labels}
              selected={card.labels}
              onToggle={(labelId) => store.updateCard(card.id, { labels: card.labels.includes(labelId) ? card.labels.filter((id) => id !== labelId) : [...card.labels, labelId] })}
              onCreate={(name) => {
                const label = store.addLabel(board.id, name);
                if (label && !card.labels.includes(label.id)) store.updateCard(card.id, { labels: [...card.labels, label.id] });
              }}
            />
          </FieldRow>
          <FieldRow>
            <label>Start</label>
            <DatePicker value={card.startAt} onChange={(value) => store.updateCard(card.id, { startAt: value })} placeholder="Set start" icon="Play" />
          </FieldRow>
          <FieldRow>
            <label>Due</label>
            <DatePicker value={card.dueAt} onChange={(value) => store.updateCard(card.id, { dueAt: value })} placeholder="Set due date" />
          </FieldRow>
          <FieldRow>
            <label>Reminder</label>
            <ReminderSelect value={card.reminderMinutes} disabled={!card.dueAt} onChange={(value) => store.updateCard(card.id, { reminderMinutes: value })} />
          </FieldRow>
          <FieldRow>
            <label>Estimate (h)</label>
            <Input
              type="number"
              min={0}
              step={0.5}
              aria-label="Estimate in hours"
              value={estimateDraft ?? (card.estimate ?? "")}
              placeholder="—"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setEstimateDraft(event.target.value)}
              onBlur={() => {
                if (estimateDraft === null) return;
                const value = estimateDraft.trim() === "" ? null : Number(estimateDraft);
                if (value === null || Number.isFinite(value)) store.updateCard(card.id, { estimate: value });
                setEstimateDraft(null);
              }}
              onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
            />
          </FieldRow>
          <FieldRow>
            <label>Repeat</label>
            <RecurrenceEditor value={card.recurrence} onChange={(value) => store.updateCard(card.id, { recurrence: value })} />
          </FieldRow>
          {card.recurrence ? <Muted style={{ paddingLeft: 104 }}>{describeRecurrence(card.recurrence)} · next occurrence is created on completion</Muted> : null}
          <FieldRow>
            <label>Cover</label>
            <ToneSwatches value={card.cover} allowNone onChange={(cover) => store.updateCard(card.id, { cover })} />
          </FieldRow>
          {board.fields.length > 0 ? (
            <>
              <SectionTitle style={{ marginTop: 6 }}>Fields</SectionTitle>
              {board.fields.map((field) => (
                <FieldRow key={field.id}>
                  <label title={field.name}>{field.name}</label>
                  <CustomFieldInput field={field} value={card.fields[field.id] ?? null} members={members} onChange={(value) => store.updateCard(card.id, { fields: { [field.id]: value } })} />
                </FieldRow>
              ))}
            </>
          ) : null}
          <Muted style={{ marginTop: 8 }}>
            Created by {card.createdBy || "someone"} · {formatRelative(card.createdAt)}
            {card.completedAt ? ` · completed ${formatRelative(card.completedAt)}` : ""}
          </Muted>
        </Side>
      </Layout>
    </Modal>
  );
}

export function CustomFieldInput({
  field,
  value,
  onChange,
  members,
}: {
  field: CustomFieldDefinition;
  value: Card["fields"][string];
  onChange: (value: Card["fields"][string]) => void;
  members: Assignee[];
}) {
  switch (field.kind) {
    case "checkbox":
      return <Checkbox checked={Boolean(value)} onChange={(checked: boolean) => onChange(checked)} aria-label={field.name} />;
    case "number":
      return <Input type="number" aria-label={field.name} value={value === null || value === undefined ? "" : String(value)} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value === "" ? null : Number(event.target.value))} />;
    case "date":
      return <DatePicker value={typeof value === "string" ? value : null} onChange={(next) => onChange(next)} allowTime={false} placeholder="Set date" />;
    case "select":
      return (
        <Select aria-label={field.name} value={typeof value === "string" ? value : ""} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value || null)}>
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      );
    case "person":
      return (
        <Select aria-label={field.name} value={typeof value === "string" ? value : ""} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value || null)}>
          <option value="">—</option>
          {members.map((member) => (
            <option key={member.id} value={member.name}>
              {member.name}
            </option>
          ))}
        </Select>
      );
    case "url":
      return <Input type="url" aria-label={field.name} placeholder="https://" value={typeof value === "string" ? value : ""} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value || null)} />;
    default:
      return <Input aria-label={field.name} value={typeof value === "string" ? value : ""} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value || null)} />;
  }
}
