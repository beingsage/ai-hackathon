import { streamText, convertToModelMessages } from "ai"
import { searchDocuments, getStoreStats } from "@/lib/vector-store"

export async function POST(req: Request) {
  const { messages } = await req.json()

  const lastMessage = messages[messages.length - 1]
  const userQuery =
    lastMessage?.parts
      ?.filter((p: { type: string }) => p.type === "text")
      .map((p: { text: string }) => p.text)
      .join("") || ""

  const stats = getStoreStats()
  let contextBlock = ""

  if (stats.totalChunks > 0 && userQuery) {
    const results = await searchDocuments(userQuery, 5)

    if (results.length > 0) {
      contextBlock = results
        .map(
          (r, i) =>
            `[Source: ${r.source} | Relevance: ${(r.score * 100).toFixed(1)}%]\n${r.text}`
        )
        .join("\n\n---\n\n")
    }
  }

  const systemPrompt = contextBlock
    ? `You are VoiceRAG, an intelligent document assistant. Answer questions based on the following document context retrieved from the user's uploaded PDFs. Be concise, accurate, and helpful. If the context doesn't contain enough information to fully answer, say so clearly while sharing what you can find.

## Retrieved Document Context:
${contextBlock}

## Instructions:
- Answer based primarily on the document context above
- Cite which source document the information comes from when possible
- If the context is insufficient, acknowledge it honestly
- Keep answers clear and concise, suitable for being read aloud
- Format responses in plain text (avoid markdown) since they may be converted to speech`
    : `You are VoiceRAG, an intelligent document assistant. The user hasn't uploaded any documents yet. Let them know they should upload PDF documents first so you can answer questions about them. Be friendly and helpful. Keep responses concise and suitable for being read aloud.`

  const result = streamText({
    model: "grok/grok-2024-06-01",
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
}
