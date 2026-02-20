import { NextResponse } from "next/server"
import pdfParse from "pdf-parse"
import { addDocument } from "@/lib/vector-store"

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

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const pdfData = await pdfParse(buffer)
    const text = pdfData.text

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "Could not extract text from PDF" },
        { status: 400 }
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
    return NextResponse.json(
      { error: `Failed to process PDF: ${errorMessage}` },
      { status: 500 }
    )
  }
}
