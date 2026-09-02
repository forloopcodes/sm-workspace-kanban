import { useEffect, useRef, type ReactNode } from "react";
import styled from "styled-components";
import { EDITOR_SPACING, Icon, IconButton, t, useFocusTrap } from "@soft-machine/sdk";

const Backdrop = styled.div`
  position: absolute;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  padding: ${EDITOR_SPACING.containerPadding};
  background: color-mix(in srgb, ${t.bg.secondary} 72%, transparent);

  @container (max-width: 420px) {
    padding: 0;
    place-items: stretch;
    background: ${t.bg.elevated};
  }
`;

const Card = styled.div<{ $width: number }>`
  width: min(${({ $width }) => $width}px, 100%);
  max-height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: ${t.borderWidth} solid ${t.border};
  border-radius: calc(${t.radius} * 1.5);
  background: ${t.bg.elevated};
  box-shadow: ${t.shadowLg};
  animation: kanban-modal-in 0.15s ease-out;
  @keyframes kanban-modal-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  @container (max-width: 420px) {
    width: 100%;
    height: 100%;
    max-height: none;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }
`;

const Header = styled.div`
  flex: 0 0 auto;
  min-height: 42px;
  padding: 0 8px 0 ${EDITOR_SPACING.containerPadding};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
`;

const Heading = styled.div`
  min-width: 0;
  font-size: ${t.typography.md};
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Body = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 ${EDITOR_SPACING.containerPadding} ${EDITOR_SPACING.containerPadding};
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Footer = styled.div`
  flex: 0 0 auto;
  padding: 8px ${EDITOR_SPACING.containerPadding} ${EDITOR_SPACING.containerPadding};
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  border-top: ${t.borderWidth} solid ${t.border};
  min-width: 0;
  flex-wrap: wrap;
`;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  width?: number;
  children: ReactNode;
  closeOnBackdrop?: boolean;
  ariaLabel?: string;
}

/** Open modals across the plugin, oldest first; only the topmost handles Escape. */
const openModals: symbol[] = [];

export function Modal({ open, onClose, title, headerActions, footer, width = 460, children, closeOnBackdrop = true, ariaLabel }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const id = useRef(Symbol("modal"));
  useFocusTrap(cardRef, open);

  useEffect(() => {
    if (!open) return;
    openModals.push(id.current);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (openModals[openModals.length - 1] !== id.current) return;
      // Let open dropdowns/menus inside the modal take the first Escape.
      if (document.querySelector("[role='menu'], [role='listbox']")) return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const index = openModals.indexOf(id.current);
      if (index >= 0) openModals.splice(index, 1);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <Backdrop
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <Card ref={cardRef} $width={width} role="dialog" aria-modal="true" aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}>
        <Header>
          <Heading>{title}</Heading>
          <div style={{ display: "flex", alignItems: "center", gap: 2, flex: "0 0 auto" }}>
            {headerActions}
            <IconButton title="Close" aria-label="Close" onClick={onClose}>
              <Icon name="X" size={14} />
            </IconButton>
          </div>
        </Header>
        <Body>{children}</Body>
        {footer ? <Footer>{footer}</Footer> : null}
      </Card>
    </Backdrop>
  );
}
