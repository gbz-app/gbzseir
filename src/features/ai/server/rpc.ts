/**
 * Calls a Postgres function through a supabase-js client without depending on the generated Database types
 * (the GebzemAI RPCs are added by 2026091375_gebzemai.sql; database.types.ts is regenerated separately).
 */
export type RpcError = { message: string; code?: string; hint?: string | null; details?: string | null };
export type RpcResult<T> = { data: T | null; error: RpcError | null };

type RpcFn = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

export async function callRpc<T>(client: object, fn: string, args?: Record<string, unknown>): Promise<RpcResult<T>> {
  const rpc = (client as { rpc: RpcFn }).rpc;
  const { data, error } = await rpc.call(client, fn, args);
  return { data: (data ?? null) as T | null, error: (error ?? null) as RpcError | null };
}
