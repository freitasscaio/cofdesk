/** Client-side navigation between the logged-out screens (/, /login, /signup). */
export function go(path: string) {
  history.pushState(null, '', path)
  dispatchEvent(new PopStateEvent('popstate'))
  scrollTo(0, 0)
}
