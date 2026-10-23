export type ForumComment = {
  id: string;
  post: string;
  parentId: string | null;
  author: string;
  body: string;
  created: number;
  deleted: number;
  likes: number;
  liked: number;
  canDelete: number;
};

export type CommentSort = 'top' | 'new';
export type CommentThread = ForumComment & { replies: CommentThread[]; replyCount: number };

// Sort siblings, never the whole flat list: replies must stay under their parent.
export function buildCommentTree(comments: ForumComment[], sort: CommentSort): CommentThread[] {
  const nodes = new Map(comments.map((c) => [c.id, { ...c, replies: [], replyCount: 0 } as CommentThread]));
  const roots: CommentThread[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && parent.post === node.post) parent.replies.push(node);
    else roots.push(node);
  }
  const compare = (a: CommentThread, b: CommentThread) =>
    (sort === 'new' ? b.created - a.created : b.likes - a.likes || a.created - b.created) ||
    a.id.localeCompare(b.id);
  roots.sort(compare);
  const order: CommentThread[] = [];
  const pending = [...roots];
  while (pending.length) {
    const node = pending.pop()!;
    node.replies.sort(compare);
    order.push(node);
    pending.push(...node.replies);
  }
  for (const node of order.reverse())
    node.replyCount = node.replies.reduce((count, reply) => count + reply.replyCount + 1, 0);
  return roots;
}
