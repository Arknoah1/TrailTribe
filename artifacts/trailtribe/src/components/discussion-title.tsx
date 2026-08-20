/**
 * Discussion-title contract:
 * - Phone widths show up to two complete, wrapped lines.
 * - Wider layouts use one compact truncated line.
 * - The native title affordance retains the complete label where hover is available.
 *
 * Keep this behavior when discussion titles are reused in future mobile surfaces.
 */
export function DiscussionTitle({ children }: { children: string }) {
  return (
    <h1
      title={children}
      className="min-w-0 flex-1 line-clamp-2 break-words text-xl font-bold leading-tight [overflow-wrap:anywhere] sm:block sm:truncate"
    >
      {children}
    </h1>
  );
}