"use client";

import React from "react";

function InlineText({ text }: { text: string }) {
  const parts = text.replace(/`([^`]+)`/g, "$1").split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={index}>{part.slice(2, -2)}</strong>
          : <React.Fragment key={index}>{part}</React.Fragment>
      )}
    </>
  );
}

/** Lightweight renderer for the predictable Markdown-like text returned by PBSTeam AI. */
export default function ReadableAIResult({
  text,
  compact = false,
}: {
  text: string;
  compact?: boolean;
}) {
  const [body, provenance] = text.split(/\n\s*---\s*\n/, 2);
  const lines = body.split("\n");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 5 : 8 }}>
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return <div key={index} style={{ height: compact ? 2 : 4 }} />;

        const heading = line.match(/^#{1,6}\s+(.+)$/);
        if (heading) {
          const isMainSection = /^\d+[.)]\s*/.test(heading[1]);
          return (
            <div
              key={index}
              style={{
                marginTop: index === 0 ? 0 : compact ? 5 : 10,
                padding: isMainSection ? (compact ? "6px 8px" : "8px 10px") : "2px 0",
                borderRadius: 8,
                background: isMainSection ? "#f5f3ff" : "transparent",
                color: isMainSection ? "#5b21b6" : "#334155",
                fontSize: compact ? "0.76rem" : "0.93rem",
                fontWeight: 800,
                borderLeft: isMainSection ? "3px solid #7c3aed" : "none",
              }}
            >
              <InlineText text={heading[1]} />
            </div>
          );
        }

        const bullet = line.match(/^[-•]\s+(.+)$/);
        if (bullet) {
          return (
            <div key={index} style={{ display: "grid", gridTemplateColumns: "10px 1fr", gap: 5, alignItems: "start" }}>
              <span style={{ color: "#7c3aed", fontWeight: 900 }}>•</span>
              <span><InlineText text={bullet[1]} /></span>
            </div>
          );
        }

        const numbered = line.match(/^(\d+[.)])\s+(.+)$/);
        if (numbered) {
          return (
            <div key={index} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 5, alignItems: "start" }}>
              <strong style={{ color: "#6d28d9" }}>{numbered[1]}</strong>
              <span><InlineText text={numbered[2]} /></span>
            </div>
          );
        }

        return <div key={index}><InlineText text={line} /></div>;
      })}

      {provenance && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e2e8f0", color: "#64748b", fontSize: "0.72rem" }}>
          {provenance.replace(/^>\s*/, "")}
        </div>
      )}
    </div>
  );
}
