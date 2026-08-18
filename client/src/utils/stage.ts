import type { MatchStage } from "../types";

export const STAGE_LABEL: Record<MatchStage, string> = {
  league: "Pool Match",
  super4: "Super 4 Game",
  final: "The Final",
};

export function stageLabel(stage: MatchStage): string {
  return STAGE_LABEL[stage] ?? stage;
}

function stripPrefix(label: string, prefix: string): string {
  return label.trim().replace(new RegExp(`^${prefix}\\s*[-:]?\\s*`, "i"), "").trim();
}

export function poolLabel(label: string): string {
  return `Pool ${stripPrefix(label, "pool")}`.trim();
}

export function courtLabel(label: string): string {
  return `Court ${stripPrefix(label, "court")}`.trim();
}
