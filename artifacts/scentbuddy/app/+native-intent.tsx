export function redirectSystemPath({
  path,
  initial: _initial,
}: { path: string; initial: boolean }) {
  try {
    let pathname = path;
    let search = '';
    try {
      const url = new URL(path);
      pathname = url.pathname || '/';
      search = url.search || '';
    } catch {
      // path is already a pathname (may still include a query string)
      const qIndex = path.indexOf('?');
      if (qIndex >= 0) {
        pathname = path.slice(0, qIndex);
        search = path.slice(qIndex);
      }
    }

    const blindMatch = pathname.match(/^\/blind\/([^/?#]+)/);
    if (blindMatch) {
      return `/blind-test/${blindMatch[1]}`;
    }

    if (pathname.startsWith('/blind-test/')) {
      return pathname;
    }

    if (pathname === '/monthly-wrapped' || pathname.startsWith('/monthly-wrapped')) {
      return '/monthly-wrapped';
    }

    if (pathname === '/twin-finder') {
      return '/twin-finder';
    }

    // Referral invite links (e.g. /join?ref=CODE or /login?ref=CODE) open the
    // login screen; the ?ref= code is also captured by useCaptureReferralLink.
    if (pathname === '/join' || pathname.startsWith('/join')) {
      return `/login${search}`;
    }

    if (pathname === '/login' || pathname.startsWith('/login')) {
      return `/login${search}`;
    }

    return '/';
  } catch {
    return '/';
  }
}
