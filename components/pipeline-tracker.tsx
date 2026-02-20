"use client"

import { cn } from "@/lib/utils"
import {
  Mic,
  FileText,
  Search,
  Brain,
  Volume2,
  Check,
  Loader2,
} from "lucide-react"

export type PipelineStage =
  | "idle"
  | "recording"
  | "transcribing"
  | "searching"
  | "generating"
  | "speaking"
  | "done"

const stages = [
  { key: "recording", label: "Record", icon: Mic },
  { key: "transcribing", label: "Transcribe", icon: FileText },
  { key: "searching", label: "Search", icon: Search },
  { key: "generating", label: "Generate", icon: Brain },
  { key: "speaking", label: "Speak", icon: Volume2 },
] as const

const stageOrder = stages.map((s) => s.key)

export function PipelineTracker({ stage }: { stage: PipelineStage }) {
  if (stage === "idle") return null

  const currentIndex = stageOrder.indexOf(stage as (typeof stageOrder)[number])

  return (
    <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-secondary/50">
      {stages.map((s, i) => {
        const Icon = s.icon
        const isActive = s.key === stage
        const isDone =
          stage === "done" || (currentIndex >= 0 && i < currentIndex)

        return (
          <div key={s.key} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all",
                isActive &&
                  "bg-primary text-primary-foreground",
                isDone && "text-chart-2",
                !isActive && !isDone && "text-muted-foreground"
              )}
            >
              {isDone ? (
                <Check className="size-3" />
              ) : isActive ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Icon className="size-3" />
              )}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < stages.length - 1 && (
              <div
                className={cn(
                  "w-4 h-px",
                  isDone ? "bg-chart-2" : "bg-border"
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
