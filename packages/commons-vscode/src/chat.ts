export interface Attachment {
  id: string;
  name: string;
  path?: string;
  text?: string;
  mime?: string;
  data?: string;
}
export interface Change {
  id: string;
  path: string;
  before: string;
  after: string;
  added: number;
  removed: number;
}
export interface Activity {
  id: string;
  label: string;
  detail: string;
  status: 'running' | 'done' | 'error';
}
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: string[];
  activities?: Activity[];
  changes?: Change[];
}
export interface ChatSession {
  sessionId: string;
  agentId: string;
  title?: string;
  createdAt?: string;
  root?: string;
  messages?: Message[];
}
export function textContent(value: any): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value))
    return value
      .filter((v) => v?.type === 'text')
      .map((v) => v.text ?? '')
      .join('\n');
  if (!value || typeof value !== 'object') return '';
  return textContent(value.content ?? value.text ?? value.message ?? value.kwargs?.content);
}
export function transcript(value: any): Message[] {
  const rows = Array.isArray(value)
    ? value
    : value?.messages ?? value?.history ?? value?.chat ?? [];
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row, i) => {
    const role = row.role ?? row.type ?? row.id?.at?.(-1) ?? row.kwargs?.type;
    const mapped = ['human', 'user', 'HumanMessage'].includes(role)
      ? 'user'
      : ['ai', 'assistant', 'AIMessage'].includes(role)
      ? 'assistant'
      : undefined;
    const content = textContent(row);
    return mapped && content
      ? [
          {
            id: `remote-${i}`,
            role: mapped,
            content,
            timestamp: row.createdAt ?? row.timestamp ?? '',
          } as Message,
        ]
      : [];
  });
}
export function changeCounts(before: string, after: string): { added: number; removed: number } {
  const a = before ? before.split('\n') : [],
    b = after ? after.split('\n') : [];
  let start = 0,
    ae = a.length,
    be = b.length;
  while (start < ae && start < be && a[start] === b[start]) start++;
  while (ae > start && be > start && a[ae - 1] === b[be - 1]) {
    ae--;
    be--;
  }
  return { added: be - start, removed: ae - start };
}
