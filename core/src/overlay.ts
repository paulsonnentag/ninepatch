// one overlay per directory: a private path tree plus a URL area

import { Emitter, type Handle } from "./handle";
import { isUrlRooted } from "./path";

export type OverlayNode = {
  handle?: Handle<unknown>;
  children: Map<string, OverlayNode>;
  cut: boolean;
};

// a mount, or a cut with nothing mounted over it; URL paths start with the URL
export type Entry = { path: string[]; handle: Handle<unknown> | undefined };

export type Lookup = {
  handle: Handle<unknown> | undefined;
  hasEntries: boolean;
  /** A cut on the way to (or at) this node: stop falling through. */
  cutBlocked: boolean;
};

export type Listing = {
  /** Children holding a handle or entries of their own. */
  names: string[];
  /** Children that are cuts: hidden here and below. */
  cuts: string[];
  /** A cut on the way to (or at) this node: nothing inherited shows. */
  blocked: boolean;
};

export class Overlay {
  readonly mutated = new Emitter();
  private readonly root: OverlayNode = newNode();
  private readonly urls = new Map<string, OverlayNode>();

  lookup(names: string[]): Lookup {
    const { node, blocked } = this.find(names);
    return {
      handle: node?.handle,
      hasEntries: !!node && node.children.size > 0,
      cutBlocked: blocked,
    };
  }

  list(names: string[]): Listing {
    const { node, blocked } = this.find(names);
    const out: Listing = { names: [], cuts: [], blocked };
    if (!node) return out;
    for (const [name, child] of node.children) {
      if (child.handle || child.children.size > 0) out.names.push(name);
      else if (child.cut) out.cuts.push(name);
    }
    return out;
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

  /** Removes the subtree and cuts fall-through; the cut never heals. */
  unmount(names: string[]): void {
    const node = this.ensure(names);
    node.handle = undefined;
    node.children.clear();
    node.cut = true;
    this.mutated.emit();
  }

  /** Takes back a mount (or a cut, for `undefined`) if it is still the one
   * given — no cut is left behind, and fall-through resumes. */
  remove(names: string[], handle: Handle<unknown> | undefined): void {
    const { node } = this.find(names);
    if (!node) return;
    if (handle ? node.handle !== handle : node.handle || !node.cut) return;
    node.handle = undefined;
    node.cut = false;
    this.prune(names);
    this.mutated.emit();
  }

  private find(names: string[]): {
    node: OverlayNode | undefined;
    blocked: boolean;
  } {
    let blocked = false;
    let node: OverlayNode | undefined;
    let rest: string[];
    if (isUrlRooted(names)) {
      node = this.urls.get(names[0]);
      rest = names.slice(1);
    } else {
      node = this.root;
      rest = names;
    }
    if (node?.cut) blocked = true;
    for (const name of rest) {
      if (!node) break;
      node = node.children.get(name);
      if (node?.cut) blocked = true;
    }
    return { node, blocked };
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

  // drop empty nodes from `names` upward
  private prune(names: string[]): void {
    const chain: { parent: Map<string, OverlayNode>; name: string }[] = [];
    let node: OverlayNode | undefined;
    let rest: string[];
    if (isUrlRooted(names)) {
      node = this.urls.get(names[0]);
      rest = names.slice(1);
      chain.push({ parent: this.urls, name: names[0] });
    } else {
      node = this.root;
      rest = names;
    }
    for (const name of rest) {
      if (!node) return;
      chain.push({ parent: node.children, name });
      node = node.children.get(name);
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      const { parent, name } = chain[i];
      const n = parent.get(name);
      if (!n || n.handle || n.cut || n.children.size > 0) break;
      parent.delete(name);
    }
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
