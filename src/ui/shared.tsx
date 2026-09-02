import { useEffect, useState, type RefObject } from "react";
import styled, { css } from "styled-components";
import { EDITOR_SPACING, Icon, IconButton, t } from "@soft-machine/sdk";

/** Observe an element's width (px). Returns 0 until measured. */
export function useElementWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
import { toneColor, priorityColor } from "../state/tones";
import type { Priority, Tone } from "../state/types";

/* ---------------------------------------------------------------------------
 * Layout shell shared by both panels
 * ------------------------------------------------------------------------ */

export const Root = styled.div`
  container-type: inline-size;
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  color: ${t.text.primary};
  background: ${t.bg.secondary};
`;

export const TopBar = styled.div`
  flex: 0 0 auto;
  min-width: 0;
  min-height: 42px;
  padding: 0 ${EDITOR_SPACING.containerPadding};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: ${t.bg.tertiary};
  border-bottom: ${t.borderWidth} solid ${t.border};

  @container (max-width: 520px) {
    min-height: 0;
    padding-block: 6px;
    align-items: stretch;
    flex-direction: column;
    gap: 4px;
  }
`;

export const ToolbarGroup = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 4px;

  @container (max-width: 520px) {
    width: 100%;
    &:last-child {
      overflow-x: auto;
      scrollbar-width: none;
    }
    &:last-child::-webkit-scrollbar {
      display: none;
    }
  }
`;

export const PanelTitle = styled.div`
  min-width: 0;
  font-size: ${t.typography.md};
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const CreateButton = styled.button`
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: ${t.radius};
  color: ${t.accent.text};
  background: ${t.accent.primary};
  cursor: pointer;
  &:hover {
    background: color-mix(in srgb, ${t.accent.primary} 82%, black);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const ToolButton = styled(IconButton)``;

export const Workspace = styled.div`
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
`;

export const Sidebar = styled.aside<{ $open: boolean }>`
  flex: 0 0 ${({ $open }) => ($open ? "224px" : "0px")};
  width: ${({ $open }) => ($open ? "224px" : "0px")};
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: ${t.bg.tertiary};
  border-right: ${({ $open }) => ($open ? `${t.borderWidth} solid ${t.border}` : "none")};
  transition: flex-basis 0.15s ease, width 0.15s ease;
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
  @container (max-width: 760px) {
    display: none;
  }
`;

export const SidebarSection = styled.div`
  flex: 0 0 auto;
  min-height: 0;
  padding: 8px ${EDITOR_SPACING.containerPadding} 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const SidebarGrow = styled(SidebarSection)`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
`;

export const SidebarHeading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 22px;
  font-size: ${t.typography.xs};
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: ${t.text.muted};
`;

export const SidebarFooter = styled.div`
  flex: 0 0 auto;
  padding: 10px ${EDITOR_SPACING.containerPadding};
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: ${t.borderWidth} solid ${t.border};
  min-width: 0;
`;

export const FooterText = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  & > span:first-child {
    font-size: ${t.typography.sm};
    color: ${t.text.primary};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  & > span:last-child {
    font-size: ${t.typography.xs};
    color: ${t.text.muted};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

export const Count = styled.span`
  font-family: ${t.fontMono};
  font-size: ${t.typographyMono.micro};
  color: ${t.text.muted};
  font-variant-numeric: tabular-nums;
`;

export const rowStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  min-width: 0;
  padding: 0 6px;
  border: none;
  border-radius: ${t.radius};
  background: transparent;
  color: ${t.text.primary};
  font: inherit;
  font-size: ${t.typography.base};
  text-align: left;
  cursor: pointer;
  &:hover {
    background: ${t.bg.secondary};
  }
`;

export const SidebarRow = styled.div<{ $active?: boolean }>`
  ${rowStyles}
  width: 100%;
  &:focus-visible {
    outline: none;
    background: ${t.bg.secondary};
  }
  ${({ $active }) =>
    $active &&
    css`
      background: ${t.bg.secondary};
    `}
  & > span {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

export const RowActions = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  ${SidebarRow}:hover &,
  ${SidebarRow}:focus-within & {
    opacity: 1;
  }
`;

export const Canvas = styled.main`
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
`;

/* ---------------------------------------------------------------------------
 * States
 * ------------------------------------------------------------------------ */

export const StateView = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 16px;
  color: ${t.text.muted};
  background: ${t.bg.tertiary};
  text-align: center;
`;

export const StateTitle = styled.div`
  font-size: ${t.typography.md};
  font-weight: 500;
  color: ${t.text.primary};
`;

export const StateText = styled.div`
  max-width: 360px;
  font-size: ${t.typography.sm};
  color: ${t.text.muted};
`;

export const Spinner = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid ${t.border};
  border-top-color: ${t.accent.primary};
  border-radius: 50%;
  animation: kanban-spin 0.8s linear infinite;
  @keyframes kanban-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export function LoadingState({ title = "Opening board…", text = "Connecting to the shared workspace board." }: { title?: string; text?: string }) {
  return (
    <StateView role="status" aria-live="polite">
      <Spinner />
      <StateTitle>{title}</StateTitle>
      <StateText>{text}</StateText>
    </StateView>
  );
}

export function ErrorState({
  title = "Kanban unavailable",
  text = "The collaborative document could not be opened. Try reopening this panel.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <StateView role="alert">
      <Icon name="AlertCircle" size={28} />
      <StateTitle>{title}</StateTitle>
      <StateText>{text}</StateText>
    </StateView>
  );
}

export const EmptyBlock = styled.div`
  padding: 16px 12px;
  font-size: ${t.typography.sm};
  color: ${t.text.muted};
  text-align: center;
`;

/* ---------------------------------------------------------------------------
 * Small atoms
 * ------------------------------------------------------------------------ */

export const ToneDot = styled.span<{ $tone: Tone | null | undefined; $size?: number }>`
  flex: 0 0 auto;
  width: ${({ $size }) => $size ?? 8}px;
  height: ${({ $size }) => $size ?? 8}px;
  border-radius: 50%;
  background: ${({ $tone }) => toneColor($tone ?? "gray")};
`;

export const Chip = styled.span<{ $tone?: Tone | null; $muted?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  min-width: 0;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: ${t.typography.xs};
  line-height: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ $tone, $muted }) => ($muted ? t.text.muted : $tone ? toneColor($tone) : t.text.secondary)};
  background: ${({ $tone, $muted }) => ($muted ? t.bg.tertiary : $tone ? `color-mix(in srgb, ${toneColor($tone)} 16%, transparent)` : t.bg.tertiary)};
`;

export const MetaChip = styled.span<{ $tone?: "danger" | "warning" | "muted" | "default" }>`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 18px;
  padding: 0 4px;
  border-radius: ${t.radius};
  font-size: ${t.typography.xs};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: ${({ $tone }) => ($tone === "danger" ? t.status.error : $tone === "warning" ? t.status.warning : $tone === "default" ? t.text.secondary : t.text.muted)};
  background: ${({ $tone }) => ($tone === "danger" ? `color-mix(in srgb, ${t.status.error} 14%, transparent)` : "transparent")};
`;

export const Kbd = styled.kbd`
  font-family: ${t.fontMono};
  font-size: ${t.typographyMono.micro};
  padding: 0 4px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  color: ${t.text.muted};
  background: ${t.bg.tertiary};
`;

export const Muted = styled.span`
  color: ${t.text.muted};
  font-size: ${t.typography.sm};
`;

export const Truncate = styled.span`
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const SearchBox = styled.div`
  width: min(220px, 30vw);
  min-width: 0;
  height: 26px;
  padding: 0 6px;
  display: flex;
  align-items: center;
  gap: 5px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  color: ${t.text.muted};
  background: ${t.bg.elevated};
  &:focus-within {
    border-color: color-mix(in srgb, ${t.border} 92%, white 8%);
  }
  @container (max-width: 520px) {
    flex: 1 0 132px;
    width: auto;
  }
`;

export const SearchInput = styled.input`
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

export const BareButton = styled.button`
  width: 18px;
  height: 18px;
  padding: 0;
  display: grid;
  place-items: center;
  border: none;
  border-radius: ${t.radius};
  color: ${t.text.muted};
  background: transparent;
  cursor: pointer;
  &:hover {
    color: ${t.text.primary};
    background: ${t.bg.tertiary};
  }
`;

export const InlineInput = styled.input`
  min-width: 0;
  width: 100%;
  padding: 2px 4px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  font: inherit;
  font-size: inherit;
  font-weight: inherit;
  color: ${t.text.primary};
  background: ${t.bg.elevated};
  outline: none;
  &:focus {
    border-color: color-mix(in srgb, ${t.border} 92%, white 8%);
  }
`;

const PriorityGlyph = styled.span<{ $priority: Priority }>`
  display: inline-flex;
  align-items: center;
  color: ${({ $priority }) => priorityColor($priority)};
`;

export function PriorityIcon({ priority, size = 12 }: { priority: Priority; size?: number }) {
  if (priority === "none") return null;
  const name = priority === "urgent" ? "AlertTriangle" : priority === "high" ? "ArrowUp" : priority === "medium" ? "Minus" : "ArrowDown";
  return (
    <PriorityGlyph $priority={priority} aria-label={`${priority} priority`} title={`${priority} priority`}>
      <Icon name={name} size={size} />
    </PriorityGlyph>
  );
}

export const FieldRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  & > label {
    flex: 0 0 96px;
    font-size: ${t.typography.sm};
    color: ${t.text.muted};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  & > *:not(label) {
    flex: 1;
    min-width: 0;
  }
  @container (max-width: 360px) {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    & > label {
      flex: 0 0 auto;
    }
  }
`;

export const Stack = styled.div<{ $gap?: number }>`
  display: flex;
  flex-direction: column;
  gap: ${({ $gap }) => $gap ?? 8}px;
  min-width: 0;
`;

export const Row = styled.div<{ $gap?: number; $wrap?: boolean; $justify?: string }>`
  display: flex;
  align-items: center;
  gap: ${({ $gap }) => $gap ?? 6}px;
  min-width: 0;
  flex-wrap: ${({ $wrap }) => ($wrap ? "wrap" : "nowrap")};
  justify-content: ${({ $justify }) => $justify ?? "flex-start"};
`;

export const SectionTitle = styled.div`
  font-size: ${t.typography.xs};
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: ${t.text.muted};
`;

export const GhostButton = styled.button<{ $active?: boolean; $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: ${t.radius};
  font: inherit;
  font-size: ${t.typography.sm};
  color: ${({ $danger }) => ($danger ? t.status.error : t.text.muted)};
  background: ${({ $active }) => ($active ? t.bg.tertiary : "transparent")};
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    color: ${({ $danger }) => ($danger ? t.status.error : t.text.primary)};
    background: ${t.bg.tertiary};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const PickerButton = styled.button<{ $filled?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  min-width: 0;
  max-width: 100%;
  padding: 0 8px;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: ${t.radius};
  font: inherit;
  font-size: ${t.typography.sm};
  color: ${({ $filled }) => ($filled ? t.text.primary : t.text.muted)};
  background: ${t.bg.elevated};
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  &:hover {
    color: ${t.text.primary};
    border-color: color-mix(in srgb, ${t.text.muted} 35%, ${t.border});
  }
  & > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

export const SegmentGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: ${t.radius};
  background: ${t.bg.secondary};
`;

export const Segment = styled.button<{ $active?: boolean }>`
  height: 20px;
  padding: 0 8px;
  border: none;
  border-radius: calc(${t.radius} - 1px);
  font: inherit;
  font-size: ${t.typography.xs};
  color: ${({ $active }) => ($active ? t.text.primary : t.text.muted)};
  background: ${({ $active }) => ($active ? t.bg.elevated : "transparent")};
  cursor: pointer;
  white-space: nowrap;
  &:hover {
    color: ${t.text.primary};
  }
`;
