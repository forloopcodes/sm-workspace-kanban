import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import * as Y from "yjs";
import { TEXT_ORIGIN } from "../state/store";

/**
 * Bind a textarea to a Y.Text. Local edits become minimal insert/delete
 * operations; remote edits update the value while preserving the caret via
 * relative positions.
 */
export function useYText(text: Y.Text | null, ref: RefObject<HTMLTextAreaElement>) {
  const [value, setValue] = useState(() => text?.toString() ?? "");
  const relative = useRef<{ anchor: Y.RelativePosition; head: Y.RelativePosition } | null>(null);
  const pendingCaret = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    if (!text) {
      setValue("");
      return;
    }
    setValue(text.toString());
    const observer = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
      if (transaction.origin !== TEXT_ORIGIN && relative.current && text.doc && document.activeElement === ref.current) {
        const anchor = Y.createAbsolutePositionFromRelativePosition(relative.current.anchor, text.doc);
        const head = Y.createAbsolutePositionFromRelativePosition(relative.current.head, text.doc);
        if (anchor && head) pendingCaret.current = { start: anchor.index, end: head.index };
      }
      setValue(text.toString());
    };
    text.observe(observer);
    return () => text.unobserve(observer);
  }, [text, ref]);

  useLayoutEffect(() => {
    if (pendingCaret.current && ref.current) {
      const { start, end } = pendingCaret.current;
      pendingCaret.current = null;
      try {
        ref.current.setSelectionRange(start, end);
      } catch {
        /* ignore */
      }
    }
  }, [value, ref]);

  const rememberCaret = useCallback(() => {
    const element = ref.current;
    if (!element || !text) return;
    relative.current = {
      anchor: Y.createRelativePositionFromTypeIndex(text, element.selectionStart ?? 0),
      head: Y.createRelativePositionFromTypeIndex(text, element.selectionEnd ?? 0),
    };
  }, [ref, text]);

  const onChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const next = event.target.value;
      if (!text || !text.doc) {
        setValue(next);
        return;
      }
      const current = text.toString();
      if (next === current) return;
      let prefix = 0;
      const max = Math.min(current.length, next.length);
      while (prefix < max && current[prefix] === next[prefix]) prefix += 1;
      let suffix = 0;
      while (suffix < max - prefix && current[current.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix += 1;
      const deleteCount = current.length - prefix - suffix;
      const inserted = next.slice(prefix, next.length - suffix);
      // Typing uses its own origin so the textarea's native undo handles it (not the board undo stack).
      text.doc.transact(() => {
        if (deleteCount > 0) text.delete(prefix, deleteCount);
        if (inserted) text.insert(prefix, inserted);
      }, TEXT_ORIGIN);
      setValue(next);
      // Caret follows the local edit naturally; refresh the relative anchor.
      window.setTimeout(rememberCaret, 0);
    },
    [text, rememberCaret]
  );

  return { value, onChange, onSelect: rememberCaret, onKeyUp: rememberCaret, onFocus: rememberCaret };
}
