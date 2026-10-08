import type { QueueCommands } from "./types.js";

type Entry = { score: number; member: string };

export class MemoryQueueCommands implements QueueCommands {
  private readonly values = new Map<string, string>();
  private readonly lists = new Map<string, string[]>();
  private readonly schedules = new Map<string, Entry[]>();

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async setNx(key: string, value: string, _ttlSeconds?: number): Promise<boolean> {
    if (this.values.has(key)) return false;
    this.values.set(key, value);
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }

  async push(key: string, value: string): Promise<void> {
    const list = this.lists.get(key) ?? [];
    list.unshift(value);
    this.lists.set(key, list);
  }

  async moveTailToHead(source: string, destination: string): Promise<string | null> {
    const from = this.lists.get(source) ?? [];
    const value = from.pop();
    if (value === undefined) return null;
    this.lists.set(source, from);
    const to = this.lists.get(destination) ?? [];
    to.unshift(value);
    this.lists.set(destination, to);
    return value;
  }

  async remove(key: string, value: string): Promise<void> {
    const list = this.lists.get(key) ?? [];
    const index = list.indexOf(value);
    if (index >= 0) list.splice(index, 1);
    this.lists.set(key, list);
  }

  async list(key: string): Promise<string[]> {
    return [...(this.lists.get(key) ?? [])];
  }

  async schedule(key: string, score: number, member: string): Promise<void> {
    const entries = this.schedules.get(key) ?? [];
    const existing = entries.findIndex((entry) => entry.member === member);
    if (existing >= 0) entries.splice(existing, 1);
    entries.push({ score, member });
    this.schedules.set(key, entries);
  }

  async due(key: string, now: number): Promise<string[]> {
    return (this.schedules.get(key) ?? [])
      .filter((entry) => entry.score <= now)
      .sort((left, right) => left.score - right.score)
      .map((entry) => entry.member);
  }

  async unschedule(key: string, member: string): Promise<boolean> {
    const entries = this.schedules.get(key) ?? [];
    const index = entries.findIndex((entry) => entry.member === member);
    if (index < 0) return false;
    entries.splice(index, 1);
    this.schedules.set(key, entries);
    return true;
  }
}
