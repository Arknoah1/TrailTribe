export function getKeyboardInset(
  layoutViewportHeight: number,
  visualViewportHeight: number,
  visualViewportOffsetTop = 0,
  nativeKeyboardHeight = 0,
): number {
  const visualViewportBottom = visualViewportHeight + visualViewportOffsetTop;
  const visualViewportInset = Math.max(0, layoutViewportHeight - visualViewportBottom);
  return Math.max(visualViewportInset, nativeKeyboardHeight);
}
