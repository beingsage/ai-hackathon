"use client"

import { useRef, useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Mic, Square } from "lucide-react"

interface VoiceRecorderProps {
  onRecordingComplete: (blob: Blob) => void
  isProcessing: boolean
}

export function VoiceRecorder({
  onRecordingComplete,
  isProcessing,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        onRecordingComplete(blob)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch {
      console.error("Microphone access denied")
    }
  }, [onRecordingComplete])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [])

  const handleClick = () => {
    if (isProcessing) return
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isProcessing}
      aria-label={isRecording ? "Stop recording" : "Start recording"}
      className={cn(
        "relative size-14 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isRecording
          ? "bg-destructive text-white"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
        isProcessing && "opacity-50 cursor-not-allowed"
      )}
    >
      {isRecording && (
        <>
          <span className="absolute inset-0 rounded-full bg-destructive/30 animate-ping" />
          <span className="absolute -inset-1 rounded-full border-2 border-destructive/50 animate-pulse" />
        </>
      )}
      {isRecording ? (
        <Square className="size-5 relative z-10" />
      ) : (
        <Mic className="size-5 relative z-10" />
      )}
    </button>
  )
}
