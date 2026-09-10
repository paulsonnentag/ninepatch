/** Paths and URL detection. A path is a `/`-separated string or an array
 * of names. A path whose first name starts with a scheme is a URL and is
 * keyed in the URL area of each overlay. In string form `\/` is a literal
 * slash, `\:` a literal colon, `\\` a literal backslash. */

export type Path = string | string[];

const SCHEME = /^[a-z][a-z0-9+.-]*:/;

export function parsePath(path: Path): string[] {
  if (typeof path !== "string") {
    if (path.some((name) => name === "")) throw new Error("empty name in path");
    return [...path];
  }
  return splitString(path);
}

export function isUrlRooted(names: readonly string[]): boolean {
  return names.length > 0 && SCHEME.test(names[0]);
}

export function hasScheme(value: string): boolean {
  return SCHEME.test(value);
}

export function startsWith(
  names: readonly string[],
  prefix: readonly string[]
): boolean {
  return (
    prefix.length <= names.length &&
    prefix.every((name, i) => names[i] === name)
  );
}

function splitString(path: string): string[] {
  if (path === "") return [];
  const names: string[] = [];
  let current = "";
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === "\\") {
      const next = path[i + 1];
      if (next === "/" || next === ":" || next === "\\") {
        current += next;
        i++;
      } else {
        current += ch;
      }
    } else if (ch === "/") {
      names.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  names.push(current);
  if (names.some((name) => name === ""))
    throw new Error(`empty name in path ${JSON.stringify(path)}`);
  return names;
}
