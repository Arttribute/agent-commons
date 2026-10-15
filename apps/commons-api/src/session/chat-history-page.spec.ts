import { chatHistoryPage } from './chat-history-page';

describe('complete chat transcript paging', () => {
  it('reads every character of long messages without skipping later turns', () => {
    const transcript = [
      { role: 'user', content: 'Plan a deployment' },
      { role: 'assistant', content: 'dependency '.repeat(6_000) },
      { role: 'user', content: 'Resume the remaining rollout steps' },
    ];
    const restored: string[] = [];
    let offset: number | null = 0, contentOffset: number | null = 0;
    let pages = 0;
    do {
      const page = chatHistoryPage(transcript, offset, contentOffset ?? 0);
      for (const message of page.messages) restored.push(message.content);
      expect(page.messages.reduce((total, message) => total + message.content.length, 0)).toBeLessThanOrEqual(24_000);
      offset = page.nextOffset; contentOffset = page.nextContentOffset; pages++;
    } while (offset !== null && pages < 20);
    expect(pages).toBeGreaterThan(1);
    expect(restored.join('')).toBe(transcript.map((message) => message.content).join(''));
  });
  it('bounds turn count and ignores invalid offsets', () => {
    const transcript = Array.from({ length: 25 }, () => ({ role: 'user', content: 'A step' }));
    const page = chatHistoryPage(transcript, -10, NaN);
    expect(page.messages).toHaveLength(20);
    expect(page.nextOffset).toBe(20);
  });
});
