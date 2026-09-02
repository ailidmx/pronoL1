"use client";

import { useEffect, useState } from "react";
import styles from "./hero-title-rotator.module.scss";

const ROTATION_MS = 2600;

export function HeroTitleRotator({ fullTitle, messages }: { fullTitle: string; messages: readonly string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % messages.length), ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [messages]);

  return (
    <h1 className={styles.title}>
      <span className={styles.srOnly}>{fullTitle}</span>
      <span className={styles.stage} aria-hidden="true">
        {messages.map((message, messageIndex) => (
          <span className={`${styles.message} ${messageIndex === index ? styles.active : ""}`} key={message}>
            <span className={styles.trail} aria-hidden="true">{message}</span>
            <span className={styles.copy}>{message}</span>
          </span>
        ))}
      </span>
    </h1>
  );
}
