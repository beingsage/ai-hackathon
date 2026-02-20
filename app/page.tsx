"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { ChatMessage } from "@/components/chat-message"
import { VoiceRecorder } from "@/components/voice-recorder"
import { KnowledgePanel } from "@/components/knowledge-panel"
import {
  PipelineTracker,
  type PipelineStage,
} from "@/components/pipeline-tracker"
import {
  Send,
  BrainCircuit,
  Mic,
  FileText,
  ArrowRight,
  Volume2,
} from "lucide-react"

interface UploadedFile {
  name: string
  chunks: number
  textLength: number
}

const chatTransport = new DefaultChatTransport({ api: "/api/chat" })

export default function VoiceRAGPage() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [totalChunks, setTotalChunks] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>("idle")
  const [textInput, setTextInput] = useState("")
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null)
  const [speechLoadingId, setSpeechLoadingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoSpeakId, setAutoSpeakId] = useState<string | null>(null)

  const { messages, sendMessage, status } = useChat({
    transport: chatTransport,
  })

  const isStreaming = status === "streaming" || status === "submitted"

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Auto-speak the latest assistant message when pipeline completes streaming
  useEffect(() => {
    if (status === "ready" && autoSpeakId) {
      const targetMsg = messages.find((m) => m.id === autoSpeakId)
      if (targetMsg && targetMsg.role === "assistant") {
        const text = targetMsg.parts
          ?.filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("")
        if (text) {
          handlePlaySpeech(autoSpeakId, text)
        }
      }
      setAutoSpeakId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, autoSpeakId])

  const handleUpload = async (file: File) => {
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Upload failed")
      }

      const data = await res.json()
      setUploadedFiles((prev) => [
        ...prev,
        {
          name: data.fileName,
          chunks: data.chunkCount,
          textLength: data.textLength,
        },
      ])
      setTotalChunks((prev) => prev + data.chunkCount)
    } catch (error) {
      console.error("Upload error:", error)
    } finally {
      setIsUploading(false)
    }
  }

  const handleClearKnowledge = async () => {
    try {
      await fetch("/api/stats", { method: "DELETE" })
      setUploadedFiles([])
      setTotalChunks(0)
    } catch (error) {
      console.error("Clear error:", error)
    }
  }

  const handlePlaySpeech = async (messageId: string, text: string) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    setSpeechLoadingId(messageId)
    setPipelineStage("speaking")

    try {
      const res = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) throw new Error("Speech generation failed")

      const audioBlob = await res.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.onended = () => {
        setPlayingMessageId(null)
        setPipelineStage("done")
        URL.revokeObjectURL(audioUrl)
        setTimeout(() => setPipelineStage("idle"), 2000)
      }

      setSpeechLoadingId(null)
      setPlayingMessageId(messageId)
      await audio.play()
    } catch (error) {
      console.error("Speech error:", error)
      setSpeechLoadingId(null)
      setPipelineStage("idle")
    }
  }

  const handleStopSpeech = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlayingMessageId(null)
    setPipelineStage("idle")
  }

  const processVoiceQuery = useCallback(
    async (audioBlob: Blob) => {
      setPipelineStage("transcribing")

      try {
        // Step 1: Transcribe
        const formData = new FormData()
        formData.append("audio", audioBlob, "recording.webm")

        const transcribeRes = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        })

        if (!transcribeRes.ok) throw new Error("Transcription failed")

        const { text } = await transcribeRes.json()

        if (!text?.trim()) {
          setPipelineStage("idle")
          return
        }

        // Step 2: Send to chat (searching + generating)
        setPipelineStage("searching")

        const result = await sendMessage({ text })

        // Find the assistant message ID to auto-speak
        if (result?.messages) {
          const lastAssistant = [...result.messages]
            .reverse()
            .find((m) => m.role === "assistant")
          if (lastAssistant) {
            setAutoSpeakId(lastAssistant.id)
          }
        }

        setPipelineStage("generating")
      } catch (error) {
        console.error("Voice pipeline error:", error)
        setPipelineStage("idle")
      }
    },
    [sendMessage]
  )

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!textInput.trim() || isStreaming) return

    const text = textInput
    setTextInput("")
    setPipelineStage("searching")

    await sendMessage({ text })

    setPipelineStage("idle")
  }

  const getMessageText = (msg: (typeof messages)[0]) => {
    return (
      msg.parts
        ?.filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("") || ""
    )
  }

  return (
    <div className="flex flex-col h-dvh bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BrainCircuit className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-none tracking-tight text-balance">
                VoiceRAG
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Voice-Powered Document Intelligence
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totalChunks > 0 && (
              <Badge variant="outline" className="gap-1">
                <FileText className="size-3" />
                {totalChunks} chunks
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Knowledge Base */}
        <aside className="hidden lg:flex w-80 border-r flex-col overflow-y-auto p-4">
          <KnowledgePanel
            files={uploadedFiles}
            totalChunks={totalChunks}
            onUpload={handleUpload}
            onClear={handleClearKnowledge}
            isUploading={isUploading}
          />

          {/* How it Works */}
          <div className="mt-4 rounded-lg bg-secondary/30 p-4">
            <h3 className="text-sm font-medium mb-3">How it works</h3>
            <div className="flex flex-col gap-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                  1
                </div>
                <span>Upload PDF documents to build your knowledge base</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                  2
                </div>
                <span>Ask questions via voice or text</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                  3
                </div>
                <span>
                  AI searches your documents and generates accurate answers
                </span>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                  4
                </div>
                <span>Listen to the response read aloud via text-to-speech</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Mobile Upload */}
          <div className="lg:hidden border-b p-3">
            <KnowledgePanel
              files={uploadedFiles}
              totalChunks={totalChunks}
              onUpload={handleUpload}
              onClear={handleClearKnowledge}
              isUploading={isUploading}
            />
          </div>

          {/* Pipeline Tracker */}
          {pipelineStage !== "idle" && (
            <div className="border-b px-4 py-2 flex justify-center">
              <PipelineTracker stage={pipelineStage} />
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1">
            <div ref={scrollRef} className="h-full overflow-y-auto">
              <div className="mx-auto max-w-3xl px-4 py-6">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="flex size-16 items-center justify-center rounded-2xl bg-secondary mb-4">
                      <BrainCircuit className="size-8 text-muted-foreground" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2 text-balance">
                      Ask anything about your documents
                    </h2>
                    <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                      Upload PDFs to your knowledge base, then ask questions
                      using your voice or by typing below.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
                      <SuggestionChip
                        icon={<Mic className="size-3" />}
                        text="Hold the mic button to ask"
                      />
                      <SuggestionChip
                        icon={<FileText className="size-3" />}
                        text="Upload PDFs first"
                      />
                      <SuggestionChip
                        icon={<Volume2 className="size-3" />}
                        text="Hear answers read aloud"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {messages.map((msg) => {
                      const text = getMessageText(msg)
                      if (!text) return null
                      return (
                        <ChatMessage
                          key={msg.id}
                          role={msg.role as "user" | "assistant"}
                          content={text}
                          isPlaying={playingMessageId === msg.id}
                          isSpeechLoading={speechLoadingId === msg.id}
                          onPlaySpeech={() =>
                            handlePlaySpeech(msg.id, text)
                          }
                          onStopSpeech={handleStopSpeech}
                        />
                      )
                    })}
                    {isStreaming &&
                      !getMessageText(messages[messages.length - 1]) && (
                        <div className="flex gap-3 py-4">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                            <BrainCircuit className="size-4 animate-pulse" />
                          </div>
                          <div className="rounded-2xl rounded-tl-sm bg-secondary px-4 py-3">
                            <div className="flex gap-1">
                              <span className="size-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                              <span className="size-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                              <span className="size-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t bg-card px-4 py-3">
            <div className="mx-auto max-w-3xl flex items-center gap-3">
              <VoiceRecorder
                onRecordingComplete={processVoiceQuery}
                isProcessing={
                  isStreaming || pipelineStage !== "idle"
                }
              />
              <form
                onSubmit={handleTextSubmit}
                className="flex-1 flex items-center gap-2"
              >
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type your question..."
                    disabled={isStreaming}
                    className="w-full h-11 rounded-xl border bg-background px-4 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon-sm"
                    disabled={!textInput.trim() || isStreaming}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2"
                  >
                    <Send className="size-4" />
                    <span className="sr-only">Send message</span>
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function SuggestionChip({
  icon,
  text,
}: {
  icon: React.ReactNode
  text: string
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
      {icon}
      <span>{text}</span>
      <ArrowRight className="size-3" />
    </div>
  )
}
