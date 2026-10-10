type BoardReply = {
  id: number;
  isDeleted: boolean;
};

export function getReplyScrollTarget(
  posts: BoardReply[] | undefined,
  replyIdParam: string | null,
  targetParam: string | null = null,
): string | null {
  if (targetParam === "starter") return "board-thread-starter";
  if (!replyIdParam) return null;

  const replyId = Number(replyIdParam);
  const replyIsVisible = Number.isSafeInteger(replyId)
    && replyId > 0
    && posts?.some((post) => post.id === replyId && !post.isDeleted);

  return replyIsVisible ? `board-thread-post-${replyId}` : "board-thread-starter";
}
