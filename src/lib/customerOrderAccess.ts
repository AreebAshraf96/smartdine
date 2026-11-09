import "server-only";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** MVP QR check; deploy only after adding order-specific capability tokens. */
export async function findOrderAtQr(orderId: string, qrId: string) {
  if(!UUID.test(orderId)||!UUID.test(qrId)) return null;
  const db=getSupabaseAdmin();
  const {data:order,error:e1}=await db.from("orders")
    .select("id,restaurant_id,table_session_id,status,total_amount")
    .eq("id",orderId).maybeSingle();
  if(e1) throw e1;
  if(!order?.table_session_id)return null;
  const {data:session,error:e2}=await db.from("table_sessions")
    .select("table_id").eq("id",order.table_session_id).maybeSingle();
  if(e2)throw e2;
  if(!session?.table_id)return null;
  const {data:table,error:e3}=await db.from("restaurant_tables")
    .select("qr_code_id,restaurant_id")
    .eq("id",session.table_id).maybeSingle();
  if(e3)throw e3;
  return table?.qr_code_id===qrId && table.restaurant_id===order.restaurant_id ? order : null;
}
