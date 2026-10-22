import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ---------------------------------------------------------------------------
// agentData: device-scoped CRUD for the guest-mode chat app.
//
// There are no accounts: every browser generates a random device id on first
// visit (localStorage) and sends it as the X-Device-Id header. Conversations
// are owned by that device id and ALL reads/writes are checked against it
// server-side. Entity access uses the service role because anonymous requests
// carry no user context.
//
// Ops (POST, JSON unless noted):
//   list_conversations              -> { conversations: [...] }
//   get_conversation    { id }       -> { conversation, messages: [ + tool_calls ] }
//   update_conversation { id, patch }-> { ok: true }
//   delete_conversation { id }       -> { ok: true }
//   delete_message       { id }      -> { ok: true }
//   upload (multipart: file)         -> { attachment: {...} }
// ---------------------------------------------------------------------------

const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_UPLOAD = 10 * 1024 * 1024;

function deviceFrom(req: Request): string | null {
  const d = (req.headers.get('x-device-id') ?? '').trim();
  return DEVICE_RE.test(d) ? d : null;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  // Anonymous requests have no user; the service role bypasses entity access
  // rules, so every query below must be scoped by the verified device id.
  const db = (base44 as any).asServiceRole ?? base44;
  const device = deviceFrom(req);

  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (!device) return Response.json({ error: 'Missing or invalid device id.' }, { status: 400 });

  const fail = (status: number, error: string) => Response.json({ error }, { status });
  const ok = (data: Record<string, unknown> = {}) => Response.json({ ok: true, ...data });

  /** Load a conversation and verify the caller owns it. */
  const ownConversation = async (id: unknown): Promise<any | null> => {
    if (typeof id !== 'string' || !id.trim()) return null;
    const rows = await db.entities.Conversation.filter({ id: String(id) }).catch(() => []);
    const convo = rows?.[0];
    return convo && (convo.device_id ?? '') === device ? convo : null;
  };

  try {
    // --- upload (multipart) -------------------------------------------------
    if (req.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return fail(400, '`file` is required.');
      if (file.size > MAX_UPLOAD) return fail(413, 'File exceeds the 10 MB limit.');
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        return Response.json({
          ok: true,
          attachment: {
            id: crypto.randomUUID(),
            name: file.name,
            mime: file.type || 'application/octet-stream',
            size: file.size,
            url: file_url,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed.';
        // 402 = exhausted integration credits on the account.
        const friendly = /402|payment/i.test(msg)
          ? 'Uploads are temporarily unavailable on the server.'
          : msg;
        return fail(503, friendly);
      }
    }

    let body: any;
    try { body = await req.json(); } catch { return fail(400, 'Invalid JSON body.'); }
    const op = String(body?.op ?? '');

    switch (op) {
      case 'list_conversations': {
        const rows = (await db.entities.Conversation.list('-last_message_at', 500)) as any[];
        const conversations = rows
          .filter((r) => !r.archived && (r.device_id ?? '') === device)
          .slice(0, 200)
          .map((r) => ({
            id: r.id,
            title: r.title || 'New chat',
            model: r.model ?? null,
            system_prompt: r.system_prompt ?? null,
            pinned: Boolean(r.pinned),
            archived: Boolean(r.archived),
            last_message_at: r.last_message_at ?? r.updated_date ?? r.created_date,
            created_date: r.created_date,
            updated_date: r.updated_date,
          }));
        return Response.json({ ok: true, conversations });
      }

      case 'get_conversation': {
        const convo = await ownConversation(body.id);
        if (!convo) return fail(404, 'Conversation not found.');
        const [msgs, calls] = await Promise.all([
          db.entities.Message.filter({ conversation_id: convo.id }, 'created_date', 500).catch(() => []),
          db.entities.ToolCall.filter({ conversation_id: convo.id }, 'created_date', 500).catch(() => []),
        ]);
        const byMessage = new Map<string, any[]>();
        for (const c of calls as any[]) {
          const list = byMessage.get(c.message_id) ?? [];
          list.push(c);
          byMessage.set(c.message_id, list);
        }
        const messages = (msgs as any[])
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ ...m, tool_calls: byMessage.get(m.id) ?? [] }));
        return Response.json({
          ok: true,
          conversation: {
            id: convo.id,
            title: convo.title || 'New chat',
            model: convo.model ?? null,
            system_prompt: convo.system_prompt ?? null,
            pinned: Boolean(convo.pinned),
            archived: Boolean(convo.archived),
            last_message_at: convo.last_message_at ?? convo.updated_date ?? convo.created_date,
            created_date: convo.created_date,
            updated_date: convo.updated_date,
          },
          messages,
        });
      }

      case 'update_conversation': {
        const convo = await ownConversation(body.id);
        if (!convo) return fail(404, 'Conversation not found.');
        const patchIn = (body.patch ?? {}) as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        if (typeof patchIn.title === 'string') patch.title = patchIn.title.slice(0, 120);
        if (typeof patchIn.pinned === 'boolean') patch.pinned = patchIn.pinned;
        if (typeof patchIn.archived === 'boolean') patch.archived = patchIn.archived;
        if (typeof patchIn.model === 'string') patch.model = patchIn.model.slice(0, 64);
        if (!Object.keys(patch).length) return fail(400, 'Nothing to update.');
        await db.entities.Conversation.update(convo.id, patch);
        return ok();
      }

      case 'delete_conversation': {
        const convo = await ownConversation(body.id);
        if (!convo) return fail(404, 'Conversation not found.');
        const [msgs, calls] = await Promise.all([
          db.entities.Message.filter({ conversation_id: convo.id }, 'created_date', 1000).catch(() => []),
          db.entities.ToolCall.filter({ conversation_id: convo.id }, 'created_date', 1000).catch(() => []),
        ]);
        await Promise.all([
          ...(msgs as any[]).map((m) => db.entities.Message.delete(m.id).catch(() => {})),
          ...(calls as any[]).map((c) => db.entities.ToolCall.delete(c.id).catch(() => {})),
        ]);
        await db.entities.Conversation.delete(convo.id).catch(() => {});
        return ok();
      }

      case 'delete_message': {
        const id = String(body?.id ?? '');
        if (!id.trim()) return fail(400, '`id` is required.');
        const rows = await db.entities.Message.filter({ id }).catch(() => []);
        const msg = rows?.[0];
        if (!msg) return ok(); // already gone - idempotent
        if ((await ownConversation(msg.conversation_id)) === null) return fail(404, 'Message not found.');
        const calls = await db.entities.ToolCall.filter({ message_id: id }, 'created_date', 200).catch(() => []);
        await Promise.all((calls as any[]).map((c) => db.entities.ToolCall.delete(c.id).catch(() => {})));
        await db.entities.Message.delete(id).catch(() => {});
        return ok();
      }

      default:
        return fail(400, `Unknown op: ${op || '(none)'}`);
    }
  } catch (err) {
    return fail(500, err instanceof Error ? err.message : 'Unexpected error.');
  }
});
