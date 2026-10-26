import {
  createPrompt,
  isDownKey,
  isEnterKey,
  isSpaceKey,
  isUpKey,
  useKeypress,
  usePrefix,
  useState,
  type KeypressEvent,
} from "@inquirer/core";
import {
  applyTreeKey,
  initialTabTreeState,
  renderTabTree,
  type TabNode,
  type TabTreeState,
  type TreeKey,
} from "../convert/tab-tree.js";

function treeKey(key: KeypressEvent): TreeKey | undefined {
  if (isUpKey(key)) {
    return "up";
  }
  if (isDownKey(key)) {
    return "down";
  }
  if (isSpaceKey(key)) {
    return "space";
  }
  if (key.name === "right") {
    return "right";
  }
  if (key.name === "left") {
    return "left";
  }
  return undefined;
}

const prompt = createPrompt<string[], { tree: TabNode[] }>(
  (config, done) => {
    const [state, setState] = useState<TabTreeState>(() =>
      initialTabTreeState(config.tree),
    );
    const [error, setError] = useState<string | undefined>(undefined);
    const [status, setStatus] = useState<"idle" | "done">("idle");
    const prefix = usePrefix({ status });

    useKeypress((key) => {
      if (isEnterKey(key)) {
        if (state.selected.size === 0) {
          setError("Select at least one tab.");
          return;
        }
        setStatus("done");
        done([...state.selected]);
        return;
      }

      const action = treeKey(key);
      if (!action) {
        return;
      }
      const next: TabTreeState = {
        selected: new Set(state.selected),
        expanded: new Set(state.expanded),
        cursor: state.cursor,
      };
      applyTreeKey(config.tree, next, action);
      setError(undefined);
      setState(next);
    });

    const help =
      "Up/down move, right expands, left collapses, space toggles, enter confirms.";
    const errorLine = error ? `\n${error}` : "";
    return `${prefix} Select tabs to include\n${renderTabTree(config.tree, state)}\n${help}${errorLine}`;
  },
);

export function selectTabs(config: { tree: TabNode[] }): Promise<string[]> {
  return prompt(config);
}
