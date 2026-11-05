import type { ColumnDraft, ProjectKind } from "@/lib/types";

export type ColDraft = ColumnDraft;

export const COLUMN_SUGGESTIONS: ColDraft[] = [
  { name: "Cable type", type: "select", options: ["Cat5e", "Cat6", "Cat6A", "Fiber SM", "Fiber MM", "Coax", "Copper backbone", "Power"] },
  { name: "Start location", type: "text" },
  { name: "End location", type: "text" },
  { name: "Field side termination", type: "text" },
  { name: "Floor", type: "text" },
  { name: "Room", type: "text" },
  { name: "IDF / MDF", type: "text" },
  { name: "Rack", type: "text" },
  { name: "Panel", type: "text" },
  { name: "Port", type: "text" },
  { name: "Outlet / faceplate", type: "text" },
  { name: "Length", type: "number" },
  { name: "Strands / pairs", type: "number" },
  { name: "Jacket", type: "select", options: ["CMP (plenum)", "CMR (riser)", "LSZH", "OSP", "CM"] },
  { name: "Color", type: "text" },
  { name: "Pathway", type: "text" },
  { name: "Row / cabinet", type: "text" },
  { name: "U position", type: "text" },
  { name: "Device / host", type: "text" },
  { name: "Connector", type: "select", options: ["RJ45", "LC", "SC", "MPO/MTP", "ST", "F"] },
  { name: "Test result", type: "select", options: ["Pass", "Fail", "Marginal"] },
  { name: "Certification ID", type: "text" },
  { name: "Test date", type: "date" },
  { name: "Drawing ref", type: "text" },
  { name: "Notes", type: "text" },
  { name: "Pulled", type: "checkbox", progress: true },
  { name: "Terminated", type: "checkbox", progress: true },
  { name: "Tested", type: "checkbox", progress: true },
  { name: "Labeled", type: "checkbox", progress: true },
];

/** Suggestion order per project type — purely a shortcut list, nothing is created automatically. */
export const suggestionsFor = (kind: ProjectKind): ColDraft[] => {
  const order: Record<ProjectKind, string[]> = {
    datacenter: ["Cable type", "Row / cabinet", "U position", "Panel", "Port", "Device / host", "Connector", "Length", "Strands / pairs", "Test result"],
    structured: ["Cable type", "Floor", "Room", "Outlet / faceplate", "IDF / MDF", "Rack", "Panel", "Port", "Length", "Test result"],
    fiber: ["Cable type", "Start location", "End location", "Strands / pairs", "Connector", "Pathway", "Length", "Test result"],
    telecom: ["Cable type", "Start location", "End location", "Pathway", "Strands / pairs", "Length", "Drawing ref"],
    mixed: ["Cable type", "Start location", "End location", "Rack", "Panel", "Port", "Length"],
  };
  const first = order[kind].map((n) => COLUMN_SUGGESTIONS.find((c) => c.name === n)!).filter(Boolean);
  return [...first, ...COLUMN_SUGGESTIONS.filter((c) => !order[kind].includes(c.name))];
};
