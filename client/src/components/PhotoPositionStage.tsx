import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { PhotoPosition } from "../lib/cards";

type Props = {
  enabled: boolean;
  position: PhotoPosition;
  onChange: (position: PhotoPosition) => void;
  children: ReactNode;
};

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function PhotoPositionStage({ enabled, position, onChange, children }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: PhotoPosition;
  } | null>(null);

  const moveTo = useCallback(
    (clientX: number, clientY: number, origin: PhotoPosition, startX: number, startY: number) => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect?.width || !rect.height) return;
      const dx = ((clientX - startX) / rect.width) * 100;
      const dy = ((clientY - startY) / rect.height) * 100;
      onChange({
        x: clamp(origin.x - dx),
        y: clamp(origin.y - dy)
      });
    },
    [onChange]
  );

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled || event.button !== 0) return;
    event.preventDefault();
    stageRef.current?.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: position
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    moveTo(event.clientX, event.clientY, drag.origin, drag.startX, drag.startY);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try {
      stageRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
  }

  return (
    <div
      ref={stageRef}
      className={`captain-photo-stage${enabled ? " is-draggable" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {children}
      {enabled ? <span className="captain-photo-drag-hint">Drag photo to reframe</span> : null}
    </div>
  );
}
