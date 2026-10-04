import { useCallback, useReducer } from "react";
import { collection, resizeCollection } from "./formats";
import type { Settings } from "./types";

type State = { current: Settings | null; past: Settings[]; future: Settings[]; stamp: number; group: string };
type Action = { type: "set"; settings: Settings } | { type: "reset"; settings: Settings } | { type: "patch"; values: Partial<Settings>; stamp: number } | { type: "undo" } | { type: "redo" };
function reducer(state: State, action: Action): State {
  if (action.type === "reset") return { current: action.settings, past: [], future: [], stamp: 0, group: "" };
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    return previous && state.current ? { current: previous, past: state.past.slice(0, -1), future: [state.current, ...state.future], stamp: 0, group: "" } : state;
  }
  if (action.type === "redo") {
    const next = state.future[0];
    return next && state.current ? { current: next, past: [...state.past, state.current], future: state.future.slice(1), stamp: 0, group: "" } : state;
  }
  if (action.type === "patch" && !state.current) return state;
  const changes = action.type === "patch" ? resizeCollection(state.current!,action.values) : {};
  const current = action.type === "set" ? action.settings : { ...state.current!, ...changes };
  if (action.type === "patch" && collection(current) && ["name","bounds","markers","trails","custom_buildings","reference_image"].some(key=>key in action.values)) {
    current.map_tiles=current.map_tiles.map((tile,i)=>i===current.active_tile?{...tile,name:current.name,bounds:current.bounds,markers:current.markers,trails:current.trails,custom_buildings:current.custom_buildings??[],reference_image:current.reference_image??null}:tile);
  }
  if (JSON.stringify(current) === JSON.stringify(state.current)) return state;
  const group = action.type === "patch" ? Object.keys(action.values).sort().join(",") : "";
  const stamp = action.type === "patch" ? action.stamp : 0;
  const coalesce = action.type === "patch" && group === state.group && stamp - state.stamp < 600;
  return { current, past: state.current && !coalesce ? [...state.past.slice(-49), state.current] : state.past, future: [], stamp, group };
}
export default function useDesignHistory() {
  const [state, dispatch] = useReducer(reducer, { current: null, past: [], future: [], stamp: 0, group: "" });
  const setSettings = useCallback((settings: Settings) => dispatch({ type: "set", settings }), []);
  const resetSettings = useCallback((settings: Settings) => dispatch({ type: "reset", settings }), []);
  const patch = useCallback((values: Partial<Settings>) => dispatch({ type: "patch", values, stamp: Date.now() }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  return { settings: state.current, setSettings, resetSettings, patch, undo, redo, canUndo: !!state.past.length, canRedo: !!state.future.length };
}
