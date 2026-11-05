import { create } from "zustand";

import { type CellChange, useStore } from "./store";

/** One undoable step: a batch of cell changes in one project. */
interface Step {
  pid: string;
  label: string;
  changes: CellChange[];
}

interface UndoState {
  undo: Step[];
  redo: Step[];
  push: (s: Step) => void;
  clear: () => void;
}

const LIMIT = 100;

export const useUndo = create<UndoState>((set) => ({
  undo: [],
  redo: [],
  push: (s) => set((st) => ({ undo: [...st.undo.slice(-LIMIT + 1), s], redo: [] })),
  clear: () => set({ undo: [], redo: [] }),
}));

/** Write cells and remember the step for Ctrl+Z. */
export const editCells = (pid: string, edits: { cableId: string; colId: string; value: string }[], label: string) => {
  const changes = useStore.getState().setCells(pid, edits, label);
  if (changes.length) useUndo.getState().push({ pid, label, changes });
  return changes;
};

const apply = (step: Step, back: boolean) =>
  useStore.getState().setCells(
    step.pid,
    step.changes.map((c) => ({ cableId: c.cableId, colId: c.colId, value: back ? c.from : c.to })),
    back ? `Undo: ${step.label}` : `Redo: ${step.label}`,
    { force: true }, // stage order never blocks undo / redo
  );

/** Returns the step that was undone (for a toast) or null. */
export const undoStep = (pid: string): Step | null => {
  const st = useUndo.getState();
  const s = st.undo[st.undo.length - 1];
  if (!s || s.pid !== pid) return null;
  apply(s, true);
  useUndo.setState({ undo: st.undo.slice(0, -1), redo: [...st.redo, s] });
  return s;
};

export const redoStep = (pid: string): Step | null => {
  const st = useUndo.getState();
  const s = st.redo[st.redo.length - 1];
  if (!s || s.pid !== pid) return null;
  apply(s, false);
  useUndo.setState({ redo: st.redo.slice(0, -1), undo: [...st.undo, s] });
  return s;
};
