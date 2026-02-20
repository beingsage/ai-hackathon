import { NextResponse } from "next/server"
import { openai } from "@ai-sdk/openai"
import { experimental_generateSpeech as generateSpeech } from "ai"

const ENABLE_TTS = getEnvBoolean("ENABLE_TTS", true)

function getEnvBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name] ?? process.env[`NEXT_PUBLIC_${name}`]
  if (!raw) return fallback
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase())
}

export async function POST(req: Request) {
  try {
    if (!ENABLE_TTS) {
      return NextResponse.json(
        { error: "Text-to-speech is disabled" },
        { status: 403 }
      )
    }

    const { text } = await req.json()

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      )
    }

    const truncatedText = text.slice(0, 4096)

    let result
    try {
      result = await generateSpeech({
        model: openai.speech("tts-1"),
        text: truncatedText,
        voice: "alloy",
      })
    } catch (speechError) {
      console.error("OpenAI speech generation error:", speechError)
      throw speechError
    }

    console.log("Speech result:", { type: typeof result, hasResult: !!result, keys: result ? Object.keys(result) : [] })

    // The result has an 'audio' property which is a DefaultGeneratedAudioFile object
    let audioData = result?.audio
    
    if (!audioData) {
      return NextResponse.json(
        { error: "Failed to generate audio data" },
        { status: 500 }
      )
    }

    // Extract the actual audio data from the object
    let audioBuffer: Buffer
    
    if (audioData.uint8ArrayData) {
      // It's a DefaultGeneratedAudioFile with uint8ArrayData
      audioBuffer = Buffer.from(audioData.uint8ArrayData)
    } else if (audioData.base64Data) {
      // Alternative: base64 encoded data
      audioBuffer = Buffer.from(audioData.base64Data, 'base64')
    } else if (Buffer.isBuffer(audioData)) {
      audioBuffer = audioData
    } else if (audioData instanceof ArrayBuffer) {
      audioBuffer = Buffer.from(audioData)
    } else if (audioData instanceof Uint8Array) {
      audioBuffer = Buffer.from(audioData)
    } else {
      console.error("Unrecognized audio data format:", audioData)
      return NextResponse.json(
        { error: "Invalid audio data format" },
        { status: 500 }
      )
    }

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
      },
    })
  } catch (error) {
    console.error("Speech generation error:", error)
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: `Failed to generate speech: ${errorMsg}` },
      { status: 500 }
    )
  }
}
