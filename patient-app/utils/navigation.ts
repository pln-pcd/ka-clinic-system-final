import type { Href, useRouter } from 'expo-router';

type AppRouter = ReturnType<typeof useRouter>;

// router.replace() only swaps the TOP entry of the stack. Onboarding pushes
// screens 2→4, so replacing from there leaves onboarding1–3 underneath, where
// the iOS swipe-back gesture and the Android back button can reach them.
// Resetting pops the stack down to its root first, so `href` becomes the only
// entry and there is nothing stale behind it.
export function resetTo(router: AppRouter, href: Href) {
  if (router.canDismiss()) router.dismissAll();
  router.replace(href);
}

// Back action for screens with an on-screen back button: never throws the
// "GO_BACK was not handled" error when the screen is already the stack root.
export function goBackOr(router: AppRouter, fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
