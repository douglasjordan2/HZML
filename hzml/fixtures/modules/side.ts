(globalThis as Record<string, unknown> & typeof globalThis).__hzSideEffect =
  ((globalThis as Record<string, unknown> & typeof globalThis).__hzSideEffect as number ?? 0) + 1;
