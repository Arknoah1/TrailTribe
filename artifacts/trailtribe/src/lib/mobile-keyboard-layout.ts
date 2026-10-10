export function getKeyboardInset(
  layoutViewportHeight: number,
  visualViewportHeight: number,
  visualViewportOffsetTop = 0,
  nativeKeyboardHeight = 0,
  currentLayoutViewportHeight = layoutViewportHeight,
): number {
  const visualViewportBottom = visualViewportHeight + visualViewportOffsetTop;
  const layoutViewportResize = layoutViewportHeight - currentLayoutViewportHeight;

  // Android WebViews often resize the layout viewport for the keyboard. In
  // that mode a fixed element is already positioned relative to the reduced
  // viewport, so applying the native keyboard height again moves it too far up.
  if (layoutViewportResize > 80) {
    return Math.max(0, currentLayoutViewportHeight - visualViewportBottom);
  }

  const visualViewportInset = Math.max(0, layoutViewportHeight - visualViewportBottom);
  return Math.max(visualViewportInset, nativeKeyboardHeight);
}
