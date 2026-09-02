import styled from "styled-components";
import { Tooltip, UserAvatar, t } from "@soft-machine/sdk";
import type { Assignee } from "../state/types";

const Stack = styled.div<{ $size: number }>`
  display: inline-flex;
  align-items: center;
  flex-direction: row-reverse;
  & > * {
    margin-left: ${({ $size }) => -Math.round($size / 4)}px;
  }
  & > *:last-child {
    margin-left: 0;
  }
`;

const Ring = styled.span<{ $size: number; $color?: string | null }>`
  display: inline-grid;
  place-items: center;
  width: ${({ $size }) => $size + 4}px;
  height: ${({ $size }) => $size + 4}px;
  border-radius: 50%;
  background: ${({ $color }) => $color ?? t.bg.tertiary};
  padding: 2px;
  & img,
  & > * {
    border-radius: 50%;
  }
`;

const Overflow = styled.span<{ $size: number }>`
  display: inline-grid;
  place-items: center;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: 50%;
  font-size: ${t.typography.micro};
  font-variant-numeric: tabular-nums;
  color: ${t.text.muted};
  background: ${t.bg.tertiary};
`;

export interface AvatarPerson extends Assignee {
  color?: string | null;
  hint?: string;
}

export function AvatarStack({ people, size = 18, max = 4, className }: { people: AvatarPerson[]; size?: number; max?: number; className?: string }) {
  if (people.length === 0) return null;
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;
  return (
    <Stack $size={size} className={className} aria-label={people.map((p) => p.name).join(", ")}>
      {overflow > 0 ? <Overflow $size={size}>+{overflow}</Overflow> : null}
      {visible
        .slice()
        .reverse()
        .map((person) => (
          <Tooltip key={person.id} content={person.hint ? `${person.name} · ${person.hint}` : person.name} delay={200}>
            <Ring $size={size} $color={person.color}>
              <UserAvatar name={person.name} avatarUrl={person.avatarUrl ?? null} size={size} />
            </Ring>
          </Tooltip>
        ))}
    </Stack>
  );
}
