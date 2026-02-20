"use client"

import { useRef, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Upload, FileText, Trash2, Loader2, Database } from "lucide-react"

interface UploadedFile {
  name: string
  chunks: number
  textLength: number
}

interface KnowledgePanelProps {
  files: UploadedFile[]
  totalChunks: number
  onUpload: (file: File) => Promise<void>
  onClear: () => void
  isUploading: boolean
}

export function KnowledgePanel({
  files,
  totalChunks,
  onUpload,
  onClear,
  isUploading,
}: KnowledgePanelProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.type === "application/pdf") {
      await onUpload(file)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await onUpload(file)
      e.target.value = ""
    }
  }

  return (
    <Card className="h-full border-border/70 bg-card/70">
      <CardHeader className="border-b border-border/50 pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Database className="size-4" />
          </span>
          Knowledge Base
        </CardTitle>
        <CardDescription>
          Upload PDF documents to build a private, searchable knowledge base.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
          }}
          className={`group relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 cursor-pointer transition-all ${
            isDragging
              ? "border-primary bg-primary/10 shadow-soft"
              : "border-border/70 bg-background/40 hover:border-primary/50 hover:bg-secondary/40"
          }`}
        >
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-transparent to-accent/10 opacity-0 transition-opacity group-hover:opacity-100" />
          {isUploading ? (
            <Loader2 className="size-8 text-primary animate-spin" />
          ) : (
            <Upload className="size-8 text-muted-foreground group-hover:text-primary transition-colors" />
          )}
          <div className="text-center">
            <p className="text-sm font-medium">
              {isUploading
                ? "Processing PDF..."
                : "Drop PDF here or click to upload"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supports .pdf files
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Upload PDF file"
          />
        </div>

        {files.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="gap-1 bg-secondary/70">
                <Database className="size-3" />
                {totalChunks} chunks indexed
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" />
                <span className="sr-only">Clear all documents</span>
              </Button>
            </div>

            <ScrollArea className="max-h-48">
              <div className="flex flex-col gap-2">
                {files.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center gap-3 rounded-xl bg-secondary/60 p-3 border border-border/50"
                  >
                    <FileText className="size-4 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {file.chunks} chunks
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  )
}
