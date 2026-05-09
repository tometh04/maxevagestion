"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface KbArticleViewProps {
  content: string
}

export function KbArticleView({ content }: KbArticleViewProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-semibold prose-p:leading-relaxed prose-li:leading-relaxed prose-a:text-primary prose-img:rounded-lg">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
