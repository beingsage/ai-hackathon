"use client"

import { useRef, useState, useCallback, useEffect } from "react"
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
  const [error, setError] = useState<string | null>(null)
  const [isSupported, setIsSupported] = useState(true)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Check microphone support on mount
  useEffect(() => {
    const checkSupport = async () => {
      try {
        // Check if running in browser
        if (typeof window === "undefined") {
          setIsSupported(false)
          return
        }

        // Check if getUserMedia is supported
        const hasGetUserMedia = !!(
          navigator?.mediaDevices?.getUserMedia ||
          navigator?.webkitGetUserMedia ||
          navigator?.mozGetUserMedia
        )

        if (!hasGetUserMedia) {
          setIsSupported(false)
          return
        }

        // Check permissions
        try {
          const result = await navigator.permissions?.query({ name: "microphone" as PermissionName })
          if (result?.state === "denied") {
            setError("Microphone permission permanently denied. Check browser settings.")
            setIsSupported(false)
          }
        } catch {
          // Permissions API not available in all browsers, continue anyway
        }
      } catch (err) {
        console.error("Microphone support check failed:", err)
        setIsSupported(false)
      }
    }

    checkSupport()
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setError(null)

      if (!navigator?.mediaDevices?.getUserMedia) {
        const msg = "Microphone access requires HTTPS or localhost. Access via http://localhost:3001"
        setError(msg)
        alert(msg)
        return
      }

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
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error"
      console.error("Microphone access denied:", errorMsg)
      setError(errorMsg)
      setIsRecording(false)

      // Show specific error messages
      if (errorMsg.includes("NotAllowedError") || errorMsg.includes("Permission denied")) {
        alert("❌ Microphone permission denied.\n\nPlease:\n1. Click the camera/microphone icon in your address bar\n2. Allow microphone access\n3. Refresh the page")
      } else if (errorMsg.includes("NotFoundError")) {
        alert("❌ No microphone found on this device.")
      } else if (errorMsg.includes("HTTPS")) {
        alert("❌ HTTPS is required for microphone access.\n\nPlease access via: http://localhost:3001")
      } else {
        alert(`❌ Microphone error: ${errorMsg}`)
      }
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [])

  const handleClick = () => {
    if (isProcessing || !isSupported) return
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isProcessing || !isSupported}
      aria-label={isRecording ? "Stop recording" : "Start recording"}
      title={!isSupported ? "Microphone not available" : isRecording ? "Stop recording" : "Start recording"}
      className={cn(
        "relative size-14 rounded-2xl flex items-center justify-center transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-soft",
        isRecording
          ? "bg-destructive text-white"
          : isSupported
            ? "bg-foreground text-background hover:-translate-y-px"
            : "bg-gray-400 text-gray-600 cursor-not-allowed",
        isProcessing && "opacity-50 cursor-not-allowed"
      )}
    >
      {isRecording && (
        <>
          <span className="absolute inset-0 rounded-2xl bg-destructive/30 animate-ping" />
          <span className="absolute -inset-1 rounded-2xl border-2 border-destructive/50 animate-pulse" />
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
