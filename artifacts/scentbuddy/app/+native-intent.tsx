export function redirectSystemPath({
  path,
  initial: _initial,
}: { path: string; initial: boolean }) {
  try {
    let pathname = path;
    try {
      const url = new URL(path);
      pathname = url.pathname || '/';
    } catch {
      // path is already a pathname
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

    return '/';
  } catch {
    return '/';
  }
}
