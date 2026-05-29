// Central applier for draft_changes payloads. Routes to the right service based
// on `entity`. Keeps lines.ts free from cross-service imports.
import type { DraftChange } from "../types";
import { updateLine, createLine, deleteLine, type LinePatch, type LineCreateInput } from "./lines";
import {
  updateStation, createStation, deleteStation, type StationPatch, type StationCreateInput,
  updateZone, createZone, deleteZone, updateLayout, type ZonePatch,
} from "./layout";
import { createStop, updateStop, deleteStop, type StopInput } from "./stops";

type Op = "update" | "create" | "delete";

export async function applyDraftPayload(draft: DraftChange): Promise<void> {
  const patch = (draft.patch ?? {}) as Record<string, unknown> & { __op?: Op };
  const op: Op = (patch.__op as Op) ?? "update";
  const id = draft.entity_id ?? "";

  switch (draft.entity) {
    case "line":
      if (op === "update" && id) await updateLine(id, stripOp(patch) as LinePatch);
      else if (op === "create") await createLine(stripOp(patch) as LineCreateInput);
      else if (op === "delete" && id) await deleteLine(id);
      break;
    case "station":
      if (op === "update" && id) await updateStation(id, stripOp(patch) as StationPatch);
      else if (op === "create") await createStation(stripOp(patch) as StationCreateInput);
      else if (op === "delete" && id) await deleteStation(id);
      break;
    case "route_stop":
      if (op === "update" && id) await updateStop(id, stripOp(patch) as Partial<StopInput>);
      else if (op === "delete" && id) await deleteStop(id);
      else if (op === "create" && (patch as any).line_id) {
        await createStop((patch as any).line_id, stripOp(patch) as StopInput);
      }
      break;
    case "layout_zone":
      if (op === "update" && id) await updateZone(id, stripOp(patch) as ZonePatch);
      else if (op === "delete" && id) await deleteZone(id);
      else if (op === "create") await createZone(stripOp(patch) as any);
      break;
    case "station_layout":
      if (op === "update" && id) await updateLayout(id, stripOp(patch) as any);
      break;
    default:
      throw new Error(`Unsupported draft entity: ${draft.entity}`);
  }
}

function stripOp<T extends Record<string, unknown>>(p: T): Omit<T, "__op" | "line_id"> {
  const { __op, line_id, ...rest } = p as any;
  return rest;
}
