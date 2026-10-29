export type ForumView = 'home' | 'discussions' | 'popular' | 'saved' | 'profile' | 'moderation' | 'communities';
export type ForumRoute = { view: ForumView; community: string; post: string | null; user?: string };
const views: ForumView[] = ['home', 'discussions', 'popular', 'saved', 'profile', 'moderation', 'communities'];

export function readRoute(search: string): ForumRoute {
  const params = new URLSearchParams(search);
  const view = params.get('view') as ForumView;
  const community = params.get('community') || 'all';
  const post = params.get('post');
  return { view: views.includes(view) ? view : 'home',
    community: /^[a-z0-9][a-z0-9-]{2,39}$/.test(community) ? community : 'all',
    post: post && post.length <= 60 ? post : null,
    ...(view === 'profile' && /^[a-z0-9_-]{3,24}$/.test(params.get('user') || '') ? { user: params.get('user')! } : {}) };
}

export function routeURL(route: ForumRoute): string {
  const params = new URLSearchParams();
  if (route.view !== 'home') params.set('view', route.view);
  if (route.community !== 'all') params.set('community', route.community);
  if (route.post) params.set('post', route.post);
  if (route.view === 'profile' && route.user) params.set('user', route.user);
  return '/' + (params.size ? '?' + params.toString() : '');
}

export function uniquePosts<T extends { id: string }>(posts: T[]): T[] {
  return [...new Map(posts.map((post) => [post.id, post])).values()];
}
