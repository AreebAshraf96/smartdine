
"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

type Message = {
  role: "customer" | "agent";
  text: string;
};

export default function AgentDemo() {
  const [customerRef, setCustomerRef] =
    useState<string | null>(null);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "agent",
      text:
        "Hello! Welcome to SmartDine. What would you like to order today? You can ask about our menu or save a draft order.",
    },
  ]);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Generate ID only after the component mounts
  // in the browser. This avoids the Next.js
  // prerendering error with crypto.randomUUID().
  useEffect(() => {
    setCustomerRef(`demo-${crypto.randomUUID()}`);
  }, []);

  // Scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, busy]);

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const text = input.trim();

    if (!text || busy || !customerRef) return;

    setInput("");
    setBusy(true);

    setMessages((previous) => [
      ...previous,
      { role: "customer", text },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerRef,
          text,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Unable to send your message."
        );
      }

      setMessages((previous) => [
        ...previous,
        {
          role: "agent",
          text:
            typeof data.reply === "string"
              ? data.reply
              : "I couldn't generate a response.",
        },
      ]);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          role: "agent",
          text:
            error instanceof Error
              ? error.message
              : "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        maxWidth: 720,
        margin: "2rem auto",
        padding: 16,
        fontFamily: "system-ui, sans-serif",
        color: "#111827",
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>
          SmartDine AI Agent
        </h1>

        <p style={{ color: "#6b7280", fontSize: 14 }}>
          Home Restaurant AI Assistant
        </p>

        <p
          style={{
            background: "#f0fdf4",
            padding: 12,
            borderRadius: 10,
            fontSize: 13,
            marginTop: 12,
          }}
        >
          Local demo powered by Gemini.
          Draft orders do not charge customers
          or enter the kitchen.
        </p>
      </header>

      <div
        style={{
          height: 450,
          overflowY: "auto",
          padding: 16,
          borderRadius: 14,
          border: "1px solid #e5e7eb",
          background: "#fafafa",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              maxWidth: "85%",
              alignSelf:
                message.role === "customer"
                  ? "flex-end"
                  : "flex-start",
              background:
                message.role === "customer"
                  ? "#dcfce7"
                  : "#ffffff",
              border: "1px solid #e5e7eb",
              color: "#111827",
              padding: "12px 14px",
              borderRadius: 12,
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
              fontSize: 14,
            }}
          >
            {message.text}
          </div>
        ))}

        {busy && (
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Assistant is replying...
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(event) => void send(event)}
        style={{
          display: "flex",
          gap: 10,
          marginTop: 14,
        }}
      >
        <input
          aria-label="Your message"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            customerRef
              ? "Ask about the menu or place an order..."
              : "Starting chat..."
          }
          maxLength={2500}
          disabled={!customerRef || busy}
          style={{
            flex: 1,
            padding: 13,
            border: "1px solid #d1d5db",
            borderRadius: 10,
            fontSize: 14,
          }}
        />

        <button
          type="submit"
          disabled={
            busy || !customerRef || !input.trim()
          }
          style={{
            padding: "0 22px",
            background: "#111827",
            color: "#ffffff",
            border: "none",
            borderRadius: 10,
            fontWeight: 600,
            cursor: "pointer",
            opacity:
              busy || !customerRef || !input.trim()
                ? 0.5
                : 1,
          }}
        >
          {busy ? "Sending..." : "Send"}
        </button>
      </form>

      <p
        style={{
          marginTop: 12,
          fontSize: 12,
          color: "#6b7280",
        }}
      >
        Gemini AI • Local testing • No WhatsApp
        or email connection required
      </p>
    </section>
  );
}
