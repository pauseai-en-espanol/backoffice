import { describe, expect, it, vi } from 'vitest';

import { createTelegramClient } from './client.js';
import { registerCommands } from './commands.js';

describe('the command menu (PLAN R38)', () => {
  it('sets the English names for everyone and the Spanish ones for Spanish Telegram, described in Spanish', async () => {
    const calls: { method: string; body: unknown }[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      calls.push({
        method: (url instanceof Request ? url.url : url.toString()).split('/').at(-1) ?? '',
        body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}'),
      });
      return new Response(JSON.stringify({ ok: true, result: true }));
    });
    const client = createTelegramClient(
      { botToken: '123:token-de-ejemplo', apiUrl: 'http://127.0.0.1:9' },
      fetchImpl,
    );
    await registerCommands(client);
    expect(calls.map((call) => call.method)).toEqual(['setMyCommands', 'setMyCommands']);
    const [all, spanish] = calls.map((call) => call.body) as {
      commands: { command: string; description: string }[];
      language_code?: string;
    }[];
    expect(all?.language_code).toBeUndefined();
    expect(all?.commands.map((c) => c.command)).toEqual([
      'joined',
      'left',
      'mine',
      'unassigned',
      'search',
      'sync',
      'help',
      'cancel',
    ]);
    expect(spanish?.language_code).toBe('es');
    expect(spanish?.commands.map((c) => c.command)).toEqual([
      'alta',
      'baja',
      'mios',
      'libres',
      'buscar',
      'sincronizar',
      'ayuda',
      'cancelar',
    ]);
    expect(all?.commands[0]?.description).toBe('Alguien ha entrado en la comunidad');
    expect(spanish?.commands.map((c) => c.description)).toEqual(
      all?.commands.map((c) => c.description),
    );
  });
});
