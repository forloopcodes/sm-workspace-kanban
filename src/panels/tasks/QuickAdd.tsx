import { forwardRef, useMemo, useState, type KeyboardEvent } from "react";
import styled from "styled-components";
import { EDITOR_SPACING, Icon, Select, t } from "@soft-machine/sdk";
import { formatDue } from "../../state/dates";
import { parseQuickAdd, type QuickAddContext } from "../../state/nlp";
import type { Board } from "../../state/types";
import { Chip, Kbd } from "../../ui/shared";

const Wrap = styled.div`
  flex: 0 0 auto;
  padding: 8px ${EDITOR_SPACING.containerPadding};
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-bottom: ${t.borderWidth} solid ${t.border};
  background: ${t.bg.tertiary};
`;

const Box = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 8px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: calc(${t.radius} * 1.5);
  background: ${t.bg.elevated};
  color: ${t.text.muted};
  &:focus-within {
    border-color: color-mix(in srgb, ${t.border} 92%, white 8%);
  }
`;

const Field = styled.input`
  flex: 1;
  min-width: 0;
  padding: 0;
  border: none;
  outline: none;
  font: inherit;
  font-size: ${t.typography.base};
  color: ${t.text.primary};
  background: transparent;
  &::placeholder {
    color: ${t.text.muted};
  }
`;

const BoardPick = styled(Select)`
  max-width: 120px;
  @container (max-width: 380px) {
    display: none;
  }
`;

const Preview = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 18px;
  font-size: ${t.typography.xs};
  color: ${t.text.muted};
`;

export interface QuickAddProps {
  boards: Board[];
  targetBoardId: string | null;
  onTargetBoardChange: (boardId: string) => void;
  parseContext: QuickAddContext;
  onSubmit: (text: string) => void;
  showBoardPicker: boolean;
}

export const QuickAdd = forwardRef<HTMLInputElement, QuickAddProps>(function QuickAdd({ boards, targetBoardId, onTargetBoardChange, parseContext, onSubmit, showBoardPicker }, ref) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, parseContext) : null), [text, parseContext]);

  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      setText("");
      (event.target as HTMLInputElement).blur();
    }
  };

  return (
    <Wrap>
      <Box>
        <Icon name="Plus" size={12} />
        <Field
          ref={ref}
          data-interaction-id="quick-add"
          value={text}
          placeholder="Add a task — “Fix login tomorrow 3pm !high #bug @me ~2h”"
          aria-label="Quick add task"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {showBoardPicker ? (
          <BoardPick aria-label="Board for new tasks" value={targetBoardId ?? ""} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onTargetBoardChange(event.target.value)}>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </BoardPick>
        ) : null}
        <Kbd aria-hidden>N</Kbd>
      </Box>
      {parsed && parsed.chips.length > 0 ? (
        <Preview aria-live="polite">
          <span>{parsed.title || "Untitled"}</span>
          {parsed.chips.map((chip, index) => (
            <Chip key={`${chip.kind}-${index}`} $muted={chip.kind === "label" ? false : true} $tone={chip.kind === "label" ? "blue" : chip.kind === "priority" ? "amber" : undefined}>
              {chip.kind === "due" ? `due ${formatDue(parsed.dueAt)}` : chip.kind === "start" ? `start ${formatDue(parsed.startAt)}` : chip.kind === "assignee" ? `@${chip.text}` : chip.kind === "label" ? `#${chip.text}` : chip.kind === "estimate" ? `~${chip.text}` : `!${chip.text}`}
            </Chip>
          ))}
        </Preview>
      ) : null}
    </Wrap>
  );
});
