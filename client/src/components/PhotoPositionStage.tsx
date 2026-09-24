import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { MAX_PHOTO_ZOOM, MIN_PHOTO_ZOOM, type PhotoPosition } from "../lib/cards";

type Props = {
  enabled: boolean;
  position: PhotoPosition;
  onChange: (position: PhotoPosition) => void;
  children: ReactNode;
};

type Point = { x: number; y: number };

type Gesture =
  | { kind: "drag"; pointerId: number; start: Point; origin: PhotoPosition }
  | { kind: "pinch"; startDistance: number; origin: PhotoPosition };

function clamp(value: number) {
  return Math.min(100, Math.max(0, value));
}

function clampZoom(value: number) {
  return Math.min(MAX_PHOTO_ZOOM, Math.max(MIN_PHOTO_ZOOM, value));
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function PhotoPositionStage({ enabled, position, onChange, children }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture | null>(null);
  // Wheel and pinch handlers outlive a render, so read the latest props through refs.
  const positionRef = useRef(position);
  const onChangeRef = useRef(onChange);
  positionRef.current = position;
  onChangeRef.current = onChange;

  const zoom = position.zoom ?? MIN_PHOTO_ZOOM;

  // Pointer events can land faster than React re-renders, so keep the ref ahead of props.
  function emit(next: PhotoPosition) {
    positionRef.current = next;
    onChangeRef.current(next);
  }

  function setZoom(next: number) {
    emit({ ...positionRef.current, zoom: clampZoom(next) });
  }

  // React registers wheel listeners as passive, which can't stop the page scrolling.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !enabled) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const current = positionRef.current.zoom ?? MIN_PHOTO_ZOOM;
      setZoom(current * Math.exp(-event.deltaY * 0.0015));
    }
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [enabled]);

  function startDrag(pointerId: number, start: Point) {
    gestureRef.current = { kind: "drag", pointerId, start, origin: positionRef.current };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    try {
      stageRef.current?.setPointerCapture(event.pointerId);
    } catch {
      /* pointer already gone; the gesture still tracks it until pointerup */
    }
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);

    const pointers = [...pointersRef.current.values()];
    if (pointers.length === 2) {
      gestureRef.current = {
        kind: "pinch",
        startDistance: Math.max(1, distance(pointers[0], pointers[1])),
        origin: positionRef.current
      };
    } else if (pointers.length === 1) {
      startDrag(event.pointerId, point);
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.kind === "pinch") {
      const [a, b] = [...pointersRef.current.values()];
      if (!a || !b) return;
      const originZoom = gesture.origin.zoom ?? MIN_PHOTO_ZOOM;
      setZoom(originZoom * (distance(a, b) / gesture.startDistance));
      return;
    }

    if (gesture.pointerId !== event.pointerId) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    // Zoomed photos move further per percent of focus, so slow the drag to keep it under the finger.
    const originZoom = gesture.origin.zoom ?? MIN_PHOTO_ZOOM;
    const dx = ((event.clientX - gesture.start.x) / rect.width) * 100;
    const dy = ((event.clientY - gesture.start.y) / rect.height) * 100;
    emit({
      ...gesture.origin,
      x: clamp(gesture.origin.x - dx / originZoom),
      y: clamp(gesture.origin.y - dy / originZoom)
    });
  }

  function endPointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.delete(event.pointerId)) return;
    try {
      stageRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    // Lifting one finger of a pinch hands off to a drag with the finger that's left.
    const remaining = [...pointersRef.current.entries()];
    if (remaining.length === 1) startDrag(remaining[0][0], remaining[0][1]);
    else if (remaining.length === 0) gestureRef.current = null;
  }

  return (
    <>
      <div
        ref={stageRef}
        className={`captain-photo-stage${enabled ? " is-draggable" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        {children}
        {enabled ? <span className="captain-photo-drag-hint">Drag to reframe · pinch or scroll to zoom</span> : null}
      </div>
      {enabled ? (
        <label className="captain-photo-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={MIN_PHOTO_ZOOM}
            max={MAX_PHOTO_ZOOM}
            step={0.05}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <output>{Math.round(zoom * 100)}%</output>
        </label>
      ) : null}
    </>
  );
}
