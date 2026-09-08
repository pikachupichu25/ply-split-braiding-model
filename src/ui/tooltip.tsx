import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FocusEvent, PointerEvent, ReactNode, RefObject } from 'react';

/**
 * SVG `<title>` only surfaces on hover, so a phone never shows it. These
 * tooltips are drawn by us instead: a mouse still gets them on hover, and a
 * touch gets them on tap — tapping the same shape again, tapping anywhere
 * else, scrolling, or pressing Escape puts them away.
 */

type Placement = 'above' | 'below';

type TooltipState = {
  text: string;
  x: number;
  y: number;
  placement: Placement;
};

export type TooltipAnchorProps = {
  'data-tooltip-anchor': string;
  'aria-label': string;
  onPointerEnter: (event: PointerEvent<SVGElement>) => void;
  onPointerMove: (event: PointerEvent<SVGElement>) => void;
  onPointerLeave: (event: PointerEvent<SVGElement>) => void;
  onPointerDown: (event: PointerEvent<SVGElement>) => void;
  onFocus: (event: FocusEvent<SVGElement>) => void;
  onBlur: () => void;
};

export type Tooltip = {
  /** Attach to the scrolling frame the tooltip is positioned inside. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Spread onto any SVG shape that should explain itself. */
  anchorProps: (text: string) => TooltipAnchorProps;
  state: TooltipState | null;
};

/** Distance between the pointer and the tip of the bubble. */
const gap = 14;
/** Breathing room between the bubble and the frame's edges. */
const edgePadding = 8;

export function useTooltip(): Tooltip {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeAnchor = useRef<Element | null>(null);
  const [state, setState] = useState<TooltipState | null>(null);

  const hide = useCallback(() => {
    activeAnchor.current = null;
    setState(null);
  }, []);

  const showAt = useCallback((text: string, clientX: number, clientY: number, anchor: Element | null) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const top = clientY - rect.top + container.scrollTop;
    // Near the top edge there is no room for a bubble above the pointer.
    const placement: Placement = top - container.scrollTop < 56 ? 'below' : 'above';
    activeAnchor.current = anchor;
    setState({
      text,
      x: clientX - rect.left + container.scrollLeft,
      y: placement === 'above' ? top - gap : top + gap,
      placement,
    });
  }, []);

  const anchorProps = useCallback((text: string): TooltipAnchorProps => ({
    'data-tooltip-anchor': '',
    'aria-label': text,
    onPointerEnter: (event) => {
      if (event.pointerType !== 'mouse') return;
      showAt(text, event.clientX, event.clientY, event.currentTarget);
    },
    onPointerMove: (event) => {
      if (event.pointerType !== 'mouse') return;
      showAt(text, event.clientX, event.clientY, event.currentTarget);
    },
    onPointerLeave: (event) => {
      if (event.pointerType !== 'mouse') return;
      hide();
    },
    onPointerDown: (event) => {
      if (event.pointerType === 'mouse') return;
      // A second tap on the same shape dismisses its tooltip.
      if (activeAnchor.current === event.currentTarget) {
        hide();
        return;
      }
      showAt(text, event.clientX, event.clientY, event.currentTarget);
    },
    onFocus: (event) => {
      const box = event.currentTarget.getBoundingClientRect();
      showAt(text, box.left + box.width / 2, box.top, event.currentTarget);
    },
    onBlur: hide,
  }), [hide, showAt]);

  useEffect(() => {
    if (!state) return;
    const container = containerRef.current;
    // Runs before the anchor's own handler, so a tap that opens a new tooltip
    // closes the previous one first.
    const onPointerDown = (event: Event) => {
      const target = event.target as Element | null;
      if (target?.closest?.('[data-tooltip-anchor]')) return;
      hide();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    container?.addEventListener('scroll', hide);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      container?.removeEventListener('scroll', hide);
    };
  }, [state, hide]);

  return { containerRef, anchorProps, state };
}

/** The bubble itself, rendered inside the frame `containerRef` points at. */
export function TooltipLayer({ tooltip }: { tooltip: Tooltip }): ReactNode {
  const { state } = tooltip;
  return state ? <TooltipBubble state={state} /> : null;
}

function TooltipBubble({ state }: { state: TooltipState }) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [x, setX] = useState(state.x);

  // The bubble is centred on the pointer, so a wide one can hang off a narrow
  // frame. Measure it once it is laid out and pull it back inside.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    const container = bubble?.offsetParent as HTMLElement | null;
    if (!bubble || !container) return;
    const half = bubble.offsetWidth / 2 + edgePadding;
    const min = container.scrollLeft + half;
    const max = container.scrollLeft + container.clientWidth - half;
    setX(max < min ? container.scrollLeft + container.clientWidth / 2 : Math.min(Math.max(state.x, min), max));
  }, [state]);

  return (
    <div
      ref={bubbleRef}
      className={`svg-tooltip svg-tooltip--${state.placement}`}
      style={{ left: x, top: state.y }}
      // The anchor carries the same text as its accessible name, so the bubble
      // itself would only repeat it.
      aria-hidden="true"
    >
      {state.text}
    </div>
  );
}
