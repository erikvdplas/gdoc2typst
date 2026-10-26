import type { docs_v1 } from "@googleapis/docs";

export interface TabNode {
  id: string;
  title: string;
  tab: docs_v1.Schema$Tab;
  children: TabNode[];
}

export type CheckState = "checked" | "unchecked" | "indeterminate";

export interface TabTreeState {
  selected: Set<string>;
  expanded: Set<string>;
  cursor: string;
}

export interface VisibleTab {
  node: TabNode;
  depth: number;
}

export function documentTabTree(document: docs_v1.Schema$Document): TabNode[] {
  return (document.tabs ?? []).map((tab, index) => toNode(tab, String(index)));
}

function toNode(tab: docs_v1.Schema$Tab, fallbackId: string): TabNode {
  const id = tab.tabProperties?.tabId?.trim() || fallbackId;
  const title = tab.tabProperties?.title?.trim() || "Untitled tab";
  return {
    id,
    title,
    tab,
    children: (tab.childTabs ?? []).map((child, index) =>
      toNode(child, `${fallbackId}/${index}`),
    ),
  };
}

export function findTab(nodes: readonly TabNode[], id: string): TabNode | undefined {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const child = findTab(node.children, id);
    if (child) {
      return child;
    }
  }
  return undefined;
}

export function subtreeIds(node: TabNode): string[] {
  const ids = [node.id];
  for (const child of node.children) {
    ids.push(...subtreeIds(child));
  }
  return ids;
}

export function allTabIds(nodes: readonly TabNode[]): string[] {
  return nodes.flatMap((node) => subtreeIds(node));
}

/** Every tab starts selected. Branches start collapsed. */
export function initialTabTreeState(nodes: readonly TabNode[]): TabTreeState {
  const ids = allTabIds(nodes);
  return {
    selected: new Set(ids),
    expanded: new Set(),
    cursor: ids[0] ?? "",
  };
}

export function checkState(
  node: TabNode,
  selected: ReadonlySet<string>,
): CheckState {
  const self = selected.has(node.id);
  if (node.children.length === 0) {
    return self ? "checked" : "unchecked";
  }
  const childStates = node.children.map((child) => checkState(child, selected));
  if (self && childStates.every((state) => state === "checked")) {
    return "checked";
  }
  if (!self && childStates.every((state) => state === "unchecked")) {
    return "unchecked";
  }
  return "indeterminate";
}

export function visibleTabs(
  nodes: readonly TabNode[],
  expanded: ReadonlySet<string>,
  depth = 0,
): VisibleTab[] {
  const rows: VisibleTab[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.children.length > 0 && expanded.has(node.id)) {
      rows.push(...visibleTabs(node.children, expanded, depth + 1));
    }
  }
  return rows;
}

function parentOf(nodes: readonly TabNode[], id: string): TabNode | undefined {
  for (const node of nodes) {
    if (node.children.some((child) => child.id === id)) {
      return node;
    }
    const nested = parentOf(node.children, id);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

/**
 * Space toggles a leaf. On a branch it selects or clears that branch,
 * including the parent tab's own content.
 */
export function toggleTab(nodes: readonly TabNode[], state: TabTreeState): void {
  const node = findTab(nodes, state.cursor);
  if (!node) {
    return;
  }
  if (node.children.length === 0) {
    if (state.selected.has(node.id)) {
      state.selected.delete(node.id);
    } else {
      state.selected.add(node.id);
    }
    return;
  }
  const ids = subtreeIds(node);
  const allOn = ids.every((id) => state.selected.has(id));
  for (const id of ids) {
    if (allOn) {
      state.selected.delete(id);
    } else {
      state.selected.add(id);
    }
  }
}

export type TreeKey = "up" | "down" | "left" | "right" | "space";

export function applyTreeKey(
  nodes: readonly TabNode[],
  state: TabTreeState,
  key: TreeKey,
): void {
  const rows = visibleTabs(nodes, state.expanded);
  const index = rows.findIndex((row) => row.node.id === state.cursor);
  const current = index >= 0 ? rows[index]! : rows[0];
  if (!current) {
    return;
  }

  if (key === "space") {
    toggleTab(nodes, state);
    return;
  }

  if (key === "down" || key === "up") {
    if (rows.length === 0) {
      return;
    }
    const delta = key === "down" ? 1 : -1;
    const next = Math.min(rows.length - 1, Math.max(0, index + delta));
    state.cursor = rows[next]!.node.id;
    return;
  }

  if (key === "right") {
    if (current.node.children.length === 0) {
      return;
    }
    if (!state.expanded.has(current.node.id)) {
      state.expanded.add(current.node.id);
      return;
    }
    const child = current.node.children[0];
    if (child) {
      state.cursor = child.id;
    }
    return;
  }

  if (key === "left") {
    if (
      current.node.children.length > 0 &&
      state.expanded.has(current.node.id)
    ) {
      state.expanded.delete(current.node.id);
      return;
    }
    const parent = parentOf(nodes, current.node.id);
    if (parent) {
      state.cursor = parent.id;
    }
  }
}

export function renderTabTree(
  nodes: readonly TabNode[],
  state: TabTreeState,
): string {
  const rows = visibleTabs(nodes, state.expanded);
  return rows
    .map((row) => {
      const cursor = row.node.id === state.cursor ? ">" : " ";
      const twisty =
        row.node.children.length === 0
          ? " "
          : state.expanded.has(row.node.id)
            ? "v"
            : ">";
      const mark = checkMark(checkState(row.node, state.selected));
      const indent = "  ".repeat(row.depth);
      return `${cursor} ${indent}${twisty} ${mark} ${row.node.title}`;
    })
    .join("\n");
}

function checkMark(state: CheckState): string {
  if (state === "checked") {
    return "[x]";
  }
  if (state === "indeterminate") {
    return "[-]";
  }
  return "[ ]";
}
