import { useEffect, type RefObject } from 'react';

/** Independent translate/scale keep the pricing scroll reveal's transform intact. */
export function usePricingMagnet(root: RefObject<HTMLDivElement | null>, pricingCount: number) {
  useEffect(() => {
    const cards = [...(root.current?.querySelectorAll<HTMLElement>('.prio-pricing-card') ?? [])];
    if (!cards.length) return;
    const baseLayers = cards.map(card => Number.parseInt(getComputedStyle(card).zIndex, 10) || 0);
    const media = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    let frame = 0;
    let pointer: { x: number; y: number } | null = null;
    let keyboardInteraction = true;

    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      pointer = null;
      cards.forEach(card => {
        card.style.removeProperty('translate');
        card.style.removeProperty('scale');
        card.style.removeProperty('z-index');
      });
    };
    const update = () => {
      frame = 0;
      if (!pointer) return;
      // Undo the interpolated magnetic translation and scale so enlargement
      // doesn't feed back into the proximity calculation.
      const bounds = cards.map(card => {
        const rect = card.getBoundingClientRect();
        const style = getComputedStyle(card);
        const offset = style.translate.split(' ').map(parseFloat);
        const scale = parseFloat(style.scale) || 1;
        const origin = style.transformOrigin.split(' ').map(parseFloat);
        return {
          left: rect.left - (offset[0] || 0) + origin[0] * (scale - 1),
          top: rect.top - (offset[1] || 0) + origin[1] * (scale - 1),
          width: rect.width / scale,
          height: rect.height / scale,
        };
      });
      bounds.forEach((rect, index) => {
        const dx = pointer!.x - rect.left - rect.width / 2;
        const dy = pointer!.y - rect.top - rect.height / 2;
        const distance = Math.hypot(Math.max(0, Math.abs(dx) - rect.width / 2), Math.max(0, Math.abs(dy) - rect.height / 2));
        const proximity = Math.max(0, 1 - distance / 150);
        // Dampen on-card movement to keep prices readable and CTAs steady.
        const strength = (4 + 8 * Math.min(distance / 40, 1)) * proximity * proximity;
        const length = Math.max(100, Math.hypot(dx, dy));
        const focused = keyboardInteraction && cards[index].contains(document.activeElement);
        cards[index].style.translate = focused ? '0px 0px' : `${dx / length * strength}px ${dy / length * strength}px`;
        cards[index].style.scale = String(focused ? 1 : 1 + .1 * proximity);
        // Preserve the CSS layer above the decorative ribbons, even at rest.
        cards[index].style.zIndex = String(baseLayers[index] + (focused ? 0 : Math.round(proximity * 100)));
      });
    };
    const move = (event: PointerEvent) => {
      if (!media.matches || event.pointerType === 'touch') return;
      keyboardInteraction = false;
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(update);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      keyboardInteraction = true;
      reset();
    };
    const focus = () => {
      if (keyboardInteraction) reset();
    };
    window.addEventListener('pointermove', move, { passive: true });
    // Capture pointer intent before the clicked button receives focus.
    window.addEventListener('pointerdown', move, { passive: true, capture: true });
    window.addEventListener('keydown', keydown);
    document.documentElement.addEventListener('pointerleave', reset);
    window.addEventListener('blur', reset);
    window.addEventListener('scroll', reset, { passive: true, capture: true });
    window.addEventListener('resize', reset);
    root.current?.addEventListener('focusin', focus);
    media.addEventListener('change', reset);
    const page = root.current;
    return () => {
      reset();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', move, true);
      window.removeEventListener('keydown', keydown);
      document.documentElement.removeEventListener('pointerleave', reset);
      window.removeEventListener('blur', reset);
      window.removeEventListener('scroll', reset, true);
      window.removeEventListener('resize', reset);
      page?.removeEventListener('focusin', focus);
      media.removeEventListener('change', reset);
    };
  }, [root, pricingCount]);
}
