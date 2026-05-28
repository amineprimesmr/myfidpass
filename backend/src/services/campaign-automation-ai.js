import { z } from "zod";

const parseSchema = z.object({
  instruction: z.string().min(4).max(600),
});

export function normalizeEventTypeToken(raw) {
  const t = String(raw || "").trim().toLowerCase();
  if (!t) return null;
  if (t === "first_scan" || t === "reward_unlocked") return t;
  const mInactive = /^inactive_days:(\d{1,3})$/.exec(t);
  if (mInactive) {
    const n = Math.max(1, Math.min(365, Number(mInactive[1]) || 30));
    return `inactive_days:${n}`;
  }
  const mDaily = /^daily_at:(\d{1,2}):(\d{1,2})$/.exec(t);
  if (mDaily) {
    const hh = Math.max(0, Math.min(23, Number(mDaily[1]) || 10));
    const mm = Math.max(0, Math.min(59, Number(mDaily[2]) || 0));
    return `daily_at:${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  /** Ponctuel : une exécution à une date+minute UTC (YYYY-MM-DDTHH:MM). */
  const mOnce = /^once_at:(\d{4})-(\d{2})-(\d{2})t(\d{2}):(\d{2})$/.exec(t);
  if (mOnce) {
    const y = Number(mOnce[1]);
    const mo = Number(mOnce[2]);
    const d = Number(mOnce[3]);
    const hh = Math.max(0, Math.min(23, Number(mOnce[4]) || 0));
    const mm = Math.max(0, Math.min(59, Number(mOnce[5]) || 0));
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `once_at:${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  return null;
}

function sanitizeCustomKey(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 48);
  return v;
}

function heuristicParse(instruction) {
  const s = instruction.toLowerCase();
  if (/inactif|inactive|sans visite/.test(s)) {
    const m = /(\d{1,3})\s*jour/.exec(s);
    const days = Math.max(1, Math.min(365, Number(m?.[1]) || 30));
    return {
      eventType: `inactive_days:${days}`,
      title: `Relance inactifs ${days} jours`,
      delayMinutes: 1,
    };
  }
  if (/tous les jours|chaque jour|quotidien/.test(s)) {
    const m = /(\d{1,2})\s*h(?:\s*(\d{1,2}))?/.exec(s);
    const hh = Math.max(0, Math.min(23, Number(m?.[1]) || 10));
    const mm = Math.max(0, Math.min(59, Number(m?.[2]) || 0));
    return {
      eventType: `daily_at:${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
      title: `Message quotidien ${String(hh).padStart(2, "0")}h${String(mm).padStart(2, "0")}`,
      delayMinutes: 1,
    };
  }
  if (/premier scan|1er scan/.test(s)) {
    return { eventType: "first_scan", title: "Relance premier scan", delayMinutes: 2 };
  }
  if (/récompense|reward/.test(s)) {
    return { eventType: "reward_unlocked", title: "Récompense débloquée", delayMinutes: 2 };
  }
  return {
    eventType: "daily_at:10:00",
    title: "Message quotidien 10h00",
    delayMinutes: 1,
  };
}

export async function parseCampaignAutomationInstructionWithAI({ apiKey, instruction }) {
  const parsed = parseSchema.safeParse({ instruction });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Instruction invalide." };
  }
  const cleanInstruction = parsed.data.instruction.trim();
  if (!apiKey || String(apiKey).trim().length < 20) {
    const h = heuristicParse(cleanInstruction);
    return {
      ok: true,
      value: {
        mode: "event",
        title: h.title,
        message: "Offre spéciale disponible maintenant.",
        eventType: h.eventType,
        delayMinutes: h.delayMinutes,
        confidence: 0.62,
      },
      source: "heuristic",
    };
  }

  const system = [
    "Tu convertis une instruction commerçant en règle JSON de campagne automation.",
    "Retourne uniquement un JSON valide sans markdown.",
    "Schéma:",
    "{",
    ' "mode":"event",',
    ' "title":"string <=80",',
    ' "message":"string <=200",',
    ' "event_type":"first_scan|reward_unlocked|inactive_days:N|daily_at:HH:MM|custom:<token>",',
    ' "delay_minutes": number(1..1440),',
    ' "confidence": number(0..1)',
    "}",
  ].join("\n");

  const user = `Instruction: ${cleanInstruction}`;

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: [{ type: "input_text", text: user }] },
        ],
        text: { format: { type: "text" } },
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI HTTP ${resp.status}`);
    const data = await resp.json();
    const raw = String(data?.output_text || "").trim();
    const json = JSON.parse(raw);

    const title = String(json?.title || "").trim().slice(0, 80);
    const message = String(json?.message || "").trim().slice(0, 200);
    const delayMinutes = Math.max(1, Math.min(1440, Number(json?.delay_minutes) || 2));
    const eventRaw = String(json?.event_type || "").trim().toLowerCase();
    const normalized = normalizeEventTypeToken(eventRaw);
    const eventType = normalized || (eventRaw.startsWith("custom:") ? `custom:${sanitizeCustomKey(eventRaw.slice(7))}` : null);
    if (!title || !message || !eventType) throw new Error("Réponse IA invalide");

    return {
      ok: true,
      value: {
        mode: "event",
        title,
        message,
        eventType,
        delayMinutes,
        confidence: Math.max(0, Math.min(1, Number(json?.confidence) || 0.7)),
      },
      source: "openai",
    };
  } catch {
    const h = heuristicParse(cleanInstruction);
    return {
      ok: true,
      value: {
        mode: "event",
        title: h.title,
        message: "Offre spéciale disponible maintenant.",
        eventType: h.eventType,
        delayMinutes: h.delayMinutes,
        confidence: 0.55,
      },
      source: "heuristic",
    };
  }
}
