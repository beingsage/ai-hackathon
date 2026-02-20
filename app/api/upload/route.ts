import { NextResponse } from "next/server"
import { addDocument } from "@/lib/vector-store"
import { parsePdf } from "@/lib/pdf"

const MAX_UPLOAD_MB = getEnvNumber("MAX_UPLOAD_MB", 15)
const MAX_PDF_BYTES = MAX_UPLOAD_MB * 1024 * 1024
const MAX_TEXT_CHARS = getEnvNumber("MAX_TEXT_CHARS", 500_000)

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 400 }
      )
    }

    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: `PDF exceeds ${MAX_UPLOAD_MB}MB limit` },
        { status: 413 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const pdfData = await parsePdf(buffer)
    const text = pdfData.text

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Could not extract text from PDF" },
        { status: 400 }
      )
    }

    if (text.length > MAX_TEXT_CHARS) {
      return NextResponse.json(
        { error: `Extracted text exceeds ${MAX_TEXT_CHARS} characters` },
        { status: 413 }
      )
    }

    const { chunkCount } = await addDocument(text, file.name)

    return NextResponse.json({
      success: true,
      fileName: file.name,
      chunkCount,
      textLength: text.length,
    })
  } catch (error) {
    console.error("Upload error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const status =
      errorMessage.includes("limit") || errorMessage.includes("exceeds")
        ? 413
        : 500
    return NextResponse.json(
      { error: `Failed to process PDF: ${errorMessage}` },
      { status }
    )
  }
}
