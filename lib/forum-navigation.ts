export type ForumView = 'home' | 'discussions' | 'popular' | 'saved' | 'profile' | 'moderation' | 'communities';
export type ForumRoute = { view: ForumView; community: string; post: string | null };
const views: ForumView[] = ['home', 'discussions', 'popular', 'saved', 'profile', 'moderation', 'communities'];

export function readRoute(search: string): ForumRoute {
  const params = new URLSearchParams(search);
  const view = params.get('view') as ForumView;
  const community = params.get('community') || 'all';
  const post = params.get('post');
  return { view: views.includes(view) ? view : 'home',
    community: /^[a-z0-9][a-z0-9-]{2,39}$/.test(community) ? community : 'all',
    post: post && post.length <= 60 ? post : null };
}

export function routeURL(route: ForumRoute): string {
  const params = new URLSearchParams();
  if (route.view !== 'home') params.set('view', route.view);
  if (route.community !== 'all') params.set('community', route.community);
  if (route.post) params.set('post', route.post);
  return '/' + (params.size ? '?' + params.toString() : '');
}

export function uniquePosts<T extends { id: string }>(posts: T[]): T[] {
  return [...new Map(posts.map((post) => [post.id, post])).values()];
}
