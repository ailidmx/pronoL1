"use client";

import { useEffect, useState } from "react";

const ROTATION_MS = 2600;

export function HeroTitleRotator({ fullTitle, messages }: { fullTitle: string; messages: readonly string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length < 2) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;

    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % messages.length);
    }, ROTATION_MS);

    return () => window.clearInterval(timer);
  }, [messages]);

  return (
    <h1 className="hero-rotating-title">
      <span className="sr-only">{fullTitle}</span>
      <span className="hero-title-stage" aria-hidden="true">
        {messages.map((message, messageIndex) => (
          <span
            className={`hero-title-message${messageIndex === index ? " is-active" : ""}`}
            key={message}
          >
            <span className="hero-title-trail" aria-hidden="true">{message}</span>
            <span className="hero-title-copy">{message}</span>
          </span>
        ))}
      </span>
    </h1>
  );
}
