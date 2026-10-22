import { eq, oneRow, selectRows } from './supabase-server';

// A deployment has one map; the identifier stays out of the access form.
export async function siteMapId(): Promise<string | null> {
  const binding = await oneRow<{ space_id: string }>('site_map', { id: eq('id', 1) });
  if (binding) return binding.space_id;
  const maps = await selectRows<{ id: string }>('spaces', { select: 'id', limit: '2' });
  if (maps.length) throw new Error('请先在数据库中绑定网站地图，再打开网站');
  return null;
}

export async function validSetupKey(value: unknown): Promise<boolean> {
  const expected = process.env.ATLAS_SETUP_KEY;
  if (!expected || expected.length < 12 || typeof value !== 'string') return false;
  const encode = async (text: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [actual, wanted] = await Promise.all([encode(value), encode(expected)]);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ wanted[i];
  return difference === 0;
}
