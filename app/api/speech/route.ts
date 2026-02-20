import { NextResponse } from "next/server"
import { openai } from "@ai-sdk/openai"
import { experimental_generateSpeech as generateSpeech } from "ai"

export async function POST(req: Request) {
  try {
    const { text } = await req.json()

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      )
    }

    const truncatedText = text.slice(0, 4096)

    const result = await generateSpeech({
      model: openai.speech("tts-1"),
      text: truncatedText,
      voice: "alloy",
    })

    const audioData = result.speech

    return new Response(audioData, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioData.byteLength),
      },
    })
  } catch (error) {
    console.error("Speech generation error:", error)
    return NextResponse.json(
      { error: "Failed to generate speech" },
      { status: 500 }
    )
  }
}
