export type MediaReplacementOptions<T> = {
  previousPath: string | null;
  stage: () => Promise<string>;
  register: (nextPath: string | null, expectedPath: string | null) => Promise<void>;
  authorize: (path: string) => Promise<T>;
  remove: (paths: string[]) => Promise<unknown>;
};

/**
 * Stages immutable media, swaps metadata with compare-and-set semantics, and
 * only cleans up the prior object after the new object is authorized.
 */
export async function replaceMediaAtomically<T>({
  previousPath,
  stage,
  register,
  authorize,
  remove,
}: MediaReplacementOptions<T>): Promise<{ path: string; authorized: T }> {
  const path = await stage();
  let registered = false;
  try {
    await register(path, previousPath);
    registered = true;
    const authorized = await authorize(path);
    if (previousPath) void remove([previousPath]).catch(() => undefined);
    return { path, authorized };
  } catch (error) {
    let rollbackSucceeded = !registered;
    if (registered) {
      try { await register(previousPath, path); rollbackSucceeded = true; }
      catch { /* keep the staged object so registered metadata never points to a missing file */ }
    }
    if (rollbackSucceeded) {
      try { await remove([path]); } catch { /* unregistered staging cleanup is best effort */ }
    }
    throw error;
  }
}
