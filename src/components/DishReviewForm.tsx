"use client";

import { useState } from "react";

type Item = { id: string; item_name: string; quantity: number };
export default function DishReviewForm({ orderId, qrId, items }: { orderId: string; qrId?: string; items: Item[] }) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!qrId || Object.keys(scores).length === 0) return;
    setSaving(true); setMessage("");
    try {
      const res = await fetch("/api/customer/dish-reviews", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, qrId, reviews: items.filter(i => scores[i.id]).map(i => ({
          orderItemId: i.id, rating: scores[i.id], comment: comments[i.id] || "",
        })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to submit");
      setSent(true); setMessage("Thanks! Your dish ratings were saved.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to submit"); }
    finally { setSaving(false); }
  }

  return <section className="mt-5 rounded-2xl border bg-white p-5 text-gray-900">
    <h2 className="text-lg font-bold">Rate each dish (optional)</h2>
    <p className="mt-1 text-sm text-gray-600">Help the restaurant know what you liked. These ratings are separate from your overall experience rating.</p>
    {items.map(item => <div key={item.id} className="mt-4 border-t pt-3">
      <p className="font-semibold">{item.item_name} × {item.quantity}</p>
      <div className="mt-2 flex flex-wrap gap-2" aria-label={`Rating for ${item.item_name}`}>
        {[1,2,3,4,5].map(n => <button key={n} type="button" disabled={sent} aria-pressed={scores[item.id] === n}
          onClick={() => setScores(v => ({ ...v, [item.id]: n }))}
          className={`rounded-lg border px-3 py-2 text-sm ${scores[item.id] === n ? "bg-black text-white" : "bg-white"}`}>{n} ★</button>)}
      </div>
      {scores[item.id] && <textarea maxLength={500} disabled={sent} value={comments[item.id] || ""}
        onChange={e => setComments(v => ({ ...v, [item.id]: e.target.value }))}
        className="mt-2 w-full rounded-lg border p-2 text-sm" placeholder="Thoughts on this dish (optional)" />}
    </div>)}
    <button type="button" disabled={saving || sent || !qrId || !Object.keys(scores).length} onClick={() => void submit()}
      className="mt-4 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Submit dish ratings"}</button>
    {message && <p role="status" className="mt-2 text-sm">{message}</p>}
  </section>;
}
