import { NextResponse } from "next/server"
import { openai } from "@ai-sdk/openai"
import { experimental_transcribe as transcribe } from "ai"

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get("audio") as File | null

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      )
    }

    const result = await transcribe({
      model: openai.transcription("whisper-1"),
      audio: {
        type: audioFile.type.includes("webm")
          ? "webm"
          : audioFile.type.includes("wav")
            ? "wav"
            : "mp3",
        data: Buffer.from(await audioFile.arrayBuffer()),
      },
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
