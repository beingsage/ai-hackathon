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
  Sparkles,
  ShieldCheck,
  Layers,
  Database,
} from "lucide-react"

interface UploadedFile {
  name: string
  chunks: number
  textLength: number
}

const chatTransport = new DefaultChatTransport({ api: "/api/chat" })
const ENABLE_STT = process.env.NEXT_PUBLIC_ENABLE_STT === "true"
const ENABLE_TTS = process.env.NEXT_PUBLIC_ENABLE_TTS === "true"

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
      if (!ENABLE_TTS) {
        setAutoSpeakId(null)
        return
      }
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
    if (!ENABLE_TTS) return
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

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        const errorMsg = errorData.error || `HTTP ${res.status}`
        throw new Error(`Speech generation failed: ${errorMsg}`)
      }

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
      if (!ENABLE_STT) return
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

        await sendMessage({ text })

        // Find the assistant message ID to auto-speak
        const lastAssistant = [...messages]
          .reverse()
          .find((m) => m.role === "assistant")
        if (lastAssistant) {
          setAutoSpeakId(lastAssistant.id)
          setPipelineStage("generating")
        } else {
          setPipelineStage("idle")
        }
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
    <div className="relative min-h-dvh bg-background text-foreground overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-aurora opacity-80" />
      <div className="pointer-events-none absolute -top-32 right-[-120px] h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-160px] left-[-120px] h-80 w-80 rounded-full bg-accent/30 blur-3xl" />

      <div className="relative flex min-h-dvh flex-col">
        {/* Header */}
        <header className="border-b border-border/60 bg-card/70 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl px-4 py-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
                  <BrainCircuit className="size-6" />
                </div>
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
                    Voice-Powered Retrieval
                  </p>
                  <h1 className="text-2xl font-semibold leading-none">
                    <span className="font-serif text-gradient">VoiceRAG</span>{" "}
                    Studio
                  </h1>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="bg-secondary/70">
                  Cost Guardrails
                </Badge>
                {totalChunks > 0 && (
                  <Badge variant="outline" className="gap-1 border-border/60">
                    <FileText className="size-3" />
                    {totalChunks} chunks
                  </Badge>
                )}
              </div>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-5">
                <h2 className="text-4xl md:text-5xl font-serif leading-tight">
                  Ask anything across your{" "}
                  <span className="text-gradient">private documents</span>.
                </h2>
                <p className="text-base text-muted-foreground max-w-xl leading-relaxed">
                  Upload PDFs once, then chat in natural language. Answers stay
                  grounded in your content with a responsive, voice-ready
                  experience.
                </p>
                <div className="flex flex-wrap gap-2">
                  <FeaturePill
                    icon={<ShieldCheck className="size-3.5" />}
                    text="Private knowledge base"
                  />
                  <FeaturePill
                    icon={<Layers className="size-3.5" />}
                    text="RAG-first workflow"
                  />
                  {ENABLE_STT && (
                    <FeaturePill
                      icon={<Mic className="size-3.5" />}
                      text="Voice questions"
                    />
                  )}
                  {ENABLE_TTS && (
                    <FeaturePill
                      icon={<Volume2 className="size-3.5" />}
                      text="Spoken answers"
                    />
                  )}
                </div>
              </div>
              <div className="glass-panel rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">
                      Workspace Status
                    </p>
                    <p className="text-lg font-semibold">
                      {pipelineStage === "idle" ? "Ready" : "Processing"}
                    </p>
                  </div>
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="size-5" />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <StatPill
                    icon={<Database className="size-3.5" />}
                    label="Documents"
                    value={`${uploadedFiles.length}`}
                  />
                  <StatPill
                    icon={<FileText className="size-3.5" />}
                    label="Chunks"
                    value={`${totalChunks}`}
                  />
                  <StatPill
                    icon={<Mic className="size-3.5" />}
                    label="Voice"
                    value={ENABLE_STT ? "On" : "Off"}
                  />
                  <StatPill
                    icon={<Volume2 className="size-3.5" />}
                    label="Speak"
                    value={ENABLE_TTS ? "On" : "Off"}
                  />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1">
          <div className="mx-auto max-w-6xl px-4 py-8">
            <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
              {/* Sidebar - Knowledge Base */}
              <aside className="hidden lg:flex flex-col gap-6">
                <KnowledgePanel
                  files={uploadedFiles}
                  totalChunks={totalChunks}
                  onUpload={handleUpload}
                  onClear={handleClearKnowledge}
                  isUploading={isUploading}
                />

                {/* How it Works */}
                <div className="glass-panel rounded-2xl p-4">
                  <h3 className="text-sm font-semibold mb-3">
                    How it works
                  </h3>
                  <div className="flex flex-col gap-3 text-xs text-muted-foreground">
                    <div className="flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                        1
                      </div>
                      <span>Upload PDF documents to build your knowledge base.</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                        2
                      </div>
                      <span>
                        {ENABLE_STT
                          ? "Ask questions via voice or text."
                          : "Ask questions by typing below."}
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                        3
                      </div>
                      <span>
                        AI searches your documents and generates accurate answers.
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                        4
                      </div>
                      <span>
                        {ENABLE_TTS
                          ? "Listen to the response read aloud via text-to-speech."
                          : "Read the response on screen."}
                      </span>
                    </div>
                  </div>
                </div>
              </aside>

              {/* Chat Area */}
              <main className="flex min-h-[65vh] flex-col min-w-0">
                {/* Mobile Upload */}
                <div className="lg:hidden mb-4">
                  <KnowledgePanel
                    files={uploadedFiles}
                    totalChunks={totalChunks}
                    onUpload={handleUpload}
                    onClear={handleClearKnowledge}
                    isUploading={isUploading}
                  />
                </div>

                <div className="flex flex-1 min-h-[60vh] flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-soft backdrop-blur-xl">
                  {/* Pipeline Tracker */}
                  {pipelineStage !== "idle" && (
                    <div className="border-b border-border/50 px-4 py-3 flex justify-center bg-secondary/30">
                      <PipelineTracker stage={pipelineStage} />
                    </div>
                  )}

                  {/* Messages */}
                  <ScrollArea className="flex-1 min-h-0">
                    <div ref={scrollRef} className="h-full overflow-y-auto">
                      <div className="mx-auto max-w-3xl px-4 py-6">
                        {messages.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in duration-700">
                            <div className="flex size-20 items-center justify-center rounded-3xl bg-primary/10 mb-5 shadow-soft">
                              <BrainCircuit className="size-10 text-primary" />
                            </div>
                            <h2 className="text-2xl font-semibold mb-2 text-balance">
                              Ask anything about your documents
                            </h2>
                            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                              Upload PDFs to your knowledge base, then ask questions
                              {ENABLE_STT
                                ? " using your voice or by typing below."
                                : " by typing below."}
                            </p>
                            <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
                              {ENABLE_STT && (
                                <SuggestionChip
                                  icon={<Mic className="size-3.5" />}
                                  text="Hold the mic button to ask"
                                />
                              )}
                              <SuggestionChip
                                icon={<FileText className="size-3.5" />}
                                text="Upload PDFs first"
                              />
                              {ENABLE_TTS && (
                                <SuggestionChip
                                  icon={<Volume2 className="size-3.5" />}
                                  text="Hear answers read aloud"
                                />
                              )}
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
                                  showSpeechControls={ENABLE_TTS}
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
                                  <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-card/80 border border-border/60">
                                    <BrainCircuit className="size-4 animate-pulse" />
                                  </div>
                                  <div className="rounded-2xl rounded-tl-sm bg-card/80 border border-border/60 px-4 py-3 shadow-soft">
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
                  <div className="border-t border-border/60 bg-card/80 px-4 py-4">
                    <div className="mx-auto max-w-3xl flex items-center gap-3">
                      {ENABLE_STT && (
                        <VoiceRecorder
                          onRecordingComplete={processVoiceQuery}
                          isProcessing={
                            isStreaming || pipelineStage !== "idle"
                          }
                        />
                      )}
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
                            className="w-full h-12 rounded-2xl border border-border/60 bg-background/70 px-4 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 shadow-soft"
                          />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon-sm"
                            disabled={!textInput.trim() || isStreaming}
                            className="absolute right-2 top-1/2 -translate-y-1/2"
                          >
                            <Send className="size-4" />
                            <span className="sr-only">Send message</span>
                          </Button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>
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
    <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-xs text-muted-foreground shadow-soft">
      {icon}
      <span>{text}</span>
      <ArrowRight className="size-3" />
    </div>
  )
}

function FeaturePill({
  icon,
  text,
}: {
  icon: React.ReactNode
  text: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-xs font-medium text-foreground shadow-soft">
      <span className="text-primary">{icon}</span>
      <span>{text}</span>
    </div>
  )
}

function StatPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-primary">{icon}</span>
        <span>{label}</span>
      </div>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  )
}
