import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { findOrderAtQr } from "@/lib/customerOrderAccess";
export async function POST(request: Request) {
  try {
    const origin=request.headers.get("origin");
    if(origin&&origin!==new URL(request.url).origin) return NextResponse.json({error:"Invalid origin"},{status:403});
    const raw=await request.text();
    if(raw.length>2500)return NextResponse.json({error:"Request too large"},{status:413});
    const body=JSON.parse(raw) as Record<string,unknown>;
    if(typeof body.orderId!=="string"||typeof body.qrId!=="string"||
       typeof body.rating!=="number"||!Number.isInteger(body.rating)||body.rating<1||body.rating>5||
       (body.comment!==undefined && (typeof body.comment!=="string"||body.comment.length>1000)))
       return NextResponse.json({error:"Invalid feedback"},{status:400});
    const order=await findOrderAtQr(body.orderId,body.qrId);
    if(!order)return NextResponse.json({error:"Order/table not found"},{status:404});
    if(order.status!=="served")return NextResponse.json({error:"Feedback available after service"},{status:409});
    const db=getSupabaseAdmin();
    const {error}=await db.from("order_feedback").insert({
      order_id:order.id,restaurant_id:order.restaurant_id,
      rating:body.rating,comment:typeof body.comment==="string"?body.comment.trim():null,
    });
    if(error?.code==="23505")return NextResponse.json({error:"Feedback already submitted"},{status:409});
    if(error)throw error;
    return NextResponse.json({success:true},{status:201});
  }catch(e){console.error("Customer feedback",e);return NextResponse.json({error:"Unable to send feedback"},{status:500});}
}
