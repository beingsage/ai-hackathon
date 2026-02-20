import { NextResponse } from "next/server"
import { openai } from "@ai-sdk/openai"
import { experimental_transcribe as transcribe } from "ai"

const MAX_AUDIO_MB = getEnvNumber("MAX_AUDIO_MB", 10)
const MAX_AUDIO_BYTES = MAX_AUDIO_MB * 1024 * 1024
const ENABLE_STT = getEnvBoolean("ENABLE_STT", true)

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getEnvBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name] ?? process.env[`NEXT_PUBLIC_${name}`]
  if (!raw) return fallback
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase())
}

export async function POST(req: Request) {
  try {
    if (!ENABLE_STT) {
      return NextResponse.json(
        { error: "Speech-to-text is disabled" },
        { status: 403 }
      )
    }

    const formData = await req.formData()
    const audioFile = formData.get("audio") as File | null

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      )
    }

    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: `Audio exceeds ${MAX_AUDIO_MB}MB limit` },
        { status: 413 }
      )
    }

    const contentType = audioFile.type || ""
    const isWebm = contentType.startsWith("audio/webm")
    const isWav = contentType.startsWith("audio/wav")
    const isMp3 =
      contentType.startsWith("audio/mpeg") ||
      contentType.startsWith("audio/mp3")

    if (!isWebm && !isWav && !isMp3) {
      return NextResponse.json(
        { error: "Unsupported audio format" },
        { status: 400 }
      )
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())

    const result = await transcribe({
      model: openai.transcription("whisper-1"),
      audio: audioBuffer,
    })

    return NextResponse.json({
      text: result.text,
    })
  } catch (error) {
    console.error("Transcription error:", error)
    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 }
    )
  }
}
