"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** Current Alpha section, used to ground assistant context. */
  section?: string;
}

interface Message {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTED_QUESTIONS: Record<string, string[]> = {
  overview: [
    "What is this dashboard?",
    "How do I read the stats?",
    "Where do signals come from?",
  ],
  signals: [
    "What's the difference between market and INFI signals?",
    "How is the impact score calculated?",
    "What does WHALE source mean?",
  ],
  predictions: [
    "How are these predictions generated?",
    "What's the most bullish asset right now?",
    "Why is Top 50 stocks shown here?",
  ],
  liquidity: [
    "What is order book depth?",
    "What does TVL inflow mean?",
    "How do I read the imbalance bar?",
  ],
  whales: [
    "What counts as a whale move?",
    "Why are some moves bullish vs bearish?",
    "Which exchanges are tracked?",
  ],
  polymarket: [
    "How does this affect crypto prices?",
    "Why do you weight by 24h volume?",
    "What is YES% telling me?",
  ],
  infi: [
    "What is InvertX?",
    "When does the INFI blockchain launch?",
    "What's live right now?",
  ],
  social: [
    "Where does sentiment data come from?",
    "How is the influencer score weighted?",
    "Why is LinkedIn just a link?",
  ],
};

export default function AssistantWidget({ section = "overview" }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Auto-scroll on new messages. */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;

    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/alpha/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, section }),
      });
      const json = await res.json();
      const answer =
        json.success && json.data?.answer
          ? json.data.answer
          : json.message ?? "Sorry, I couldn't process that.";
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Network hiccup — please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = SUGGESTED_QUESTIONS[section] ?? SUGGESTED_QUESTIONS.overview;

  return (
    <>
      {/* Floating launcher button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open AI assistant"
          className="fixed z-[90] flex items-center gap-2 px-3.5 py-2.5 rounded-full transition-transform hover:scale-105"
          style={{
            bottom: "20px",
            right: "20px",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            boxShadow:
              "0 0 24px rgba(108,99,255,0.5), 0 6px 16px rgba(0,0,0,0.4)",
            fontFamily: "var(--font-sans)",
            fontSize: "13px",
            fontWeight: 500,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-1 2.65 7 7 0 0 1 4 6.35v3a3 3 0 0 1-3 3h-1l-3 3-3-3H8a3 3 0 0 1-3-3v-3a7 7 0 0 1 4-6.35A4 4 0 0 1 8 6a4 4 0 0 1 4-4z" />
            <path d="M9.5 13.5h.01M14.5 13.5h.01" />
          </svg>
          Ask Alpha
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed z-[90] flex flex-col"
          style={{
            bottom: "20px",
            right: "20px",
            width: "min(calc(100vw - 40px), 380px)",
            maxHeight: "min(calc(100vh - 40px), 600px)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: "14px",
            boxShadow:
              "0 0 32px rgba(108,99,255,0.18), 0 12px 32px rgba(0,0,0,0.5)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{
              borderBottom: "1px solid var(--border)",
              background:
                "linear-gradient(135deg, rgba(108,99,255,0.12), transparent)",
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center justify-center h-6 w-6 rounded-full"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                }}
                aria-hidden
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-1 2.65 7 7 0 0 1 4 6.35v3a3 3 0 0 1-3 3h-1l-3 3-3-3H8a3 3 0 0 1-3-3v-3a7 7 0 0 1 4-6.35A4 4 0 0 1 8 6a4 4 0 0 1 4-4z" />
                </svg>
              </span>
              <div>
                <div
                  className="text-[13px] font-medium"
                  style={{ color: "var(--fg)" }}
                >
                  Alpha Assistant
                </div>
                <div
                  className="font-mono text-[9px]"
                  style={{
                    color: "var(--fg-dim)",
                    letterSpacing: "0.08em",
                  }}
                >
                  GROUNDED IN LIVE DATA · {section.toUpperCase()}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--fg-muted)",
                cursor: "pointer",
                fontSize: "20px",
                lineHeight: 1,
                padding: "4px 8px",
              }}
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3"
            style={{ minHeight: "200px" }}
          >
            {messages.length === 0 && (
              <>
                <p
                  className="text-[12px] mb-3"
                  style={{ color: "var(--fg-muted)" }}
                >
                  Hey — I&apos;m grounded in the live signals and prices on
                  this page. Ask me what something means, how to read it, or
                  what the data is telling you right now.
                </p>
                <div className="space-y-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="block w-full text-left p-2.5 rounded-md transition-colors"
                      style={{
                        background: "var(--bg-subtle)",
                        border: "1px solid var(--border)",
                        color: "var(--fg)",
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className="mb-3"
                style={{
                  textAlign: m.role === "user" ? "right" : "left",
                }}
              >
                <div
                  className="inline-block px-3 py-2 rounded-lg max-w-[85%]"
                  style={{
                    background:
                      m.role === "user" ? "var(--accent)" : "var(--bg-subtle)",
                    color: m.role === "user" ? "#fff" : "var(--fg)",
                    fontSize: "12.5px",
                    lineHeight: 1.5,
                    textAlign: "left",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="mb-2">
                <div
                  className="inline-block px-3 py-2 rounded-lg"
                  style={{
                    background: "var(--bg-subtle)",
                    color: "var(--fg-dim)",
                    fontSize: "12px",
                  }}
                >
                  <span className="inline-flex gap-1">
                    <span style={{ animation: "pulse 1.4s infinite" }}>·</span>
                    <span
                      style={{ animation: "pulse 1.4s 0.2s infinite" }}
                    >
                      ·
                    </span>
                    <span
                      style={{ animation: "pulse 1.4s 0.4s infinite" }}
                    >
                      ·
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex gap-2 p-3"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this section…"
              maxLength={500}
              disabled={loading}
              className="flex-1 px-3 py-2 rounded-md"
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
                fontSize: "12.5px",
                outline: "none",
                fontFamily: "var(--font-sans)",
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "8px 14px",
                fontSize: "12.5px",
                fontWeight: 500,
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                opacity: loading || !input.trim() ? 0.5 : 1,
              }}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
