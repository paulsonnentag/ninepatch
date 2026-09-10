/** One overlay per namespace: a private path tree plus a URL area. Cuts
 * block fall-through past this overlay at a node and its subtree —
 * permanently. `mutated` fires on every mount and unmount; `entries()`
 * lists both areas. */

import { Emitter, type Handle } from "./handle";
import { isUrlRooted } from "./path";

export type OverlayNode = {
  handle?: Handle<unknown>;
  children: Map<string, OverlayNode>;
  cut: boolean;
};

/** One thing in an overlay: a mount, or a cut with nothing mounted over
 * it (no handle). URL-area paths start with the URL. */
export type Entry = { path: string[]; handle: Handle<unknown> | undefined };

export type Lookup = {
  handle: Handle<unknown> | undefined;
  hasEntries: boolean;
  /** A cut on the way to (or at) this node: stop falling through past this
   * overlay. */
  cutBlocked: boolean;
};

export class Overlay {
  readonly mutated = new Emitter();
  private readonly root: OverlayNode = newNode();
  private readonly urls = new Map<string, OverlayNode>();

  lookup(names: string[]): Lookup {
    let cutBlocked = false;
    let node: OverlayNode | undefined;
    let rest: string[];
    if (isUrlRooted(names)) {
      node = this.urls.get(names[0]);
      rest = names.slice(1);
    } else {
      node = this.root;
      rest = names;
    }
    if (node?.cut) cutBlocked = true;
    for (const name of rest) {
      if (!node) break;
      node = node.children.get(name);
      if (node?.cut) cutBlocked = true;
    }
    return {
      handle: node?.handle,
      hasEntries: !!node && node.children.size > 0,
      cutBlocked,
    };
  }

  /** Every node holding a handle or a cut, paths first, then URLs. */
  entries(): Entry[] {
    const out: Entry[] = [];
    collect(this.root, [], out);
    for (const [url, node] of this.urls) collect(node, [url], out);
    return out;
  }

  mount(names: string[], handle: Handle<unknown>): void {
    this.ensure(names).handle = handle;
    this.mutated.emit();
  }

  /** Remove the subtree and cut fall-through at the node. Mounting over
   * the cut is allowed; the cut itself never heals. */
  unmount(names: string[]): void {
    const node = this.ensure(names);
    node.handle = undefined;
    node.children.clear();
    node.cut = true;
    this.mutated.emit();
  }

  private ensure(names: string[]): OverlayNode {
    let node: OverlayNode;
    let rest: string[];
    if (isUrlRooted(names)) {
      let urlNode = this.urls.get(names[0]);
      if (!urlNode) {
        urlNode = newNode();
        this.urls.set(names[0], urlNode);
      }
      node = urlNode;
      rest = names.slice(1);
    } else {
      node = this.root;
      rest = names;
    }
    for (const name of rest) {
      let child = node.children.get(name);
      if (!child) {
        child = newNode();
        node.children.set(name, child);
      }
      node = child;
    }
    return node;
  }
}

function collect(node: OverlayNode, path: string[], out: Entry[]): void {
  if (path.length > 0 && (node.handle || node.cut))
    out.push({ path, handle: node.handle });
  for (const [name, child] of node.children)
    collect(child, [...path, name], out);
}

function newNode(): OverlayNode {
  return { children: new Map(), cut: false };
}
