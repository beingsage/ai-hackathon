"use client"

import { cn } from "@/lib/utils"
import { Bot, User, Volume2, Loader2, VolumeOff } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ChatMessageProps {
  role: "user" | "assistant"
  content: string
  showSpeechControls?: boolean
  isPlaying?: boolean
  isSpeechLoading?: boolean
  onPlaySpeech?: () => void
  onStopSpeech?: () => void
}

export function ChatMessage({
  role,
  content,
  showSpeechControls = true,
  isPlaying,
  isSpeechLoading,
  onPlaySpeech,
  onStopSpeech,
}: ChatMessageProps) {
  const isUser = role === "user"

  return (
    <div
      className={cn(
        "flex gap-3 py-4",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-2xl border",
          isUser
            ? "bg-foreground text-background border-foreground/20 shadow-soft"
            : "bg-card/80 text-foreground border-border/60"
        )}
        aria-hidden="true"
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div
        className={cn(
          "flex flex-col gap-2 max-w-[80%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-[0.95rem] leading-relaxed shadow-soft border",
            isUser
              ? "bg-foreground text-background border-foreground/20 rounded-tr-sm"
              : "bg-card/80 text-foreground border-border/60 rounded-tl-sm"
          )}
        >
          <span className={cn(!isUser && "font-serif")}>{content}</span>
        </div>
        {!isUser && content && showSpeechControls && (
          <div className="flex items-center gap-1">
            {isSpeechLoading ? (
              <Button variant="ghost" size="icon-sm" disabled>
                <Loader2 className="size-3.5 animate-spin" />
                <span className="sr-only">Loading speech</span>
              </Button>
            ) : isPlaying ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onStopSpeech}
                className="text-primary"
              >
                <VolumeOff className="size-3.5" />
                <span className="sr-only">Stop speaking</span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onPlaySpeech}
                className="text-muted-foreground hover:text-primary"
              >
                <Volume2 className="size-3.5" />
                <span className="sr-only">Read aloud</span>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
