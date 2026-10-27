import { randomBytes, timingSafeEqual } from "node:crypto";

import type { SessionUser } from "@aeroquetzal/api-contracts";

export interface Session {
  user: SessionUser;
  csrfToken: string;
  createdAt: number;
  lastSeenAt: number;
  rotatedAt: number;
  previousId?: string;
}

export function equalTokens(first: string, second: string): boolean {
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly previousIds = new Map<string, { id: string; until: number }>();

  constructor(
    private readonly idleMs: number,
    private readonly maxMs: number,
    private readonly rotationMs: number,
    private readonly now = Date.now,
  ) {}

  private expired(session: Session): boolean {
    return this.now() - session.lastSeenAt >= this.idleMs ||
      this.now() - session.createdAt >= this.maxMs;
  }

  prune(): void {
    for (const [id, session] of this.sessions) {
      if (this.expired(session)) this.destroy(id);
    }
    for (const [id, previous] of this.previousIds) {
      if (previous.until <= this.now()) this.previousIds.delete(id);
    }
  }

  private resolveId(id: string): string {
    const previous = this.previousIds.get(id);
    return previous && previous.until > this.now() ? previous.id : id;
  }

  create(user: SessionUser): { id: string; session: Session } {
    this.prune();
    if (this.sessions.size >= 10000) throw new Error("Capacidad de sesiones agotada");
    const now = this.now();
    const id = randomBytes(32).toString("base64url");
    const session = {
      user: structuredClone(user),
      csrfToken: randomBytes(32).toString("base64url"),
      createdAt: now,
      lastSeenAt: now,
      rotatedAt: now,
    };
    this.sessions.set(id, session);
    return { id, session };
  }

  consume(id: string): { id: string; session: Session } | null {
    id = this.resolveId(id);
    const session = this.sessions.get(id);
    if (!session) return null;
    if (this.expired(session)) {
      this.destroy(id);
      return null;
    }
    session.lastSeenAt = this.now();
    if (this.now() - session.rotatedAt >= this.rotationMs) {
      if (session.previousId) this.previousIds.delete(session.previousId);
      session.previousId = id;
      this.sessions.delete(id);
      id = randomBytes(32).toString("base64url");
      this.previousIds.set(session.previousId, {
        id, until: this.now() + Math.min(30000, this.rotationMs),
      });
      session.rotatedAt = this.now();
      this.sessions.set(id, session);
    }
    return { id, session };
  }

  destroy(id: string): void {
    id = this.resolveId(id);
    const session = this.sessions.get(id);
    if (session?.previousId) this.previousIds.delete(session.previousId);
    this.sessions.delete(id);
  }

  expiresAt(session: Session): number {
    return Math.min(session.createdAt + this.maxMs, session.lastSeenAt + this.idleMs);
  }
}

interface AttemptWindow {
  count: number;
  until: number;
}

export class LoginLimiter {
  private readonly windows = new Map<string, AttemptWindow>();

  constructor(private readonly now = Date.now, private readonly windowMs = 900000) {}

  take(ip: string, username: string): number {
    for (const [key, value] of this.windows) {
      if (value.until <= this.now()) this.windows.delete(key);
    }
    const keys = [[`ip:${ip}`, 20], [`user:${username.toLowerCase()}`, 5]] as const;
    for (const [key, limit] of keys) {
      const value = this.windows.get(key);
      if (value && value.count >= limit) {
        return Math.ceil((value.until - this.now()) / 1000);
      }
    }
    if (this.windows.size >= 10000) return Math.ceil(this.windowMs / 1000);
    for (const [key] of keys) {
      const value = this.windows.get(key) ?? { count: 0, until: this.now() + this.windowMs };
      value.count++;
      this.windows.set(key, value);
    }
    return 0;
  }

  success(username: string): void {
    this.windows.delete(`user:${username.toLowerCase()}`);
  }
}
