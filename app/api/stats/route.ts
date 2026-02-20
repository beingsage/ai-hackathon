import { NextResponse } from "next/server"
import { getStoreStats, clearStore } from "@/lib/vector-store"

export async function GET() {
  const stats = getStoreStats()
  return NextResponse.json(stats)
}

export async function DELETE() {
  clearStore()
  return NextResponse.json({ success: true })
}
