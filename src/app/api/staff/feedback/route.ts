import { NextResponse } from "next/server";
import { authenticateStaff } from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { connection } from "next/server";

export async function GET(request:Request){
 await connection();   
 try{const auth=await authenticateStaff(request);if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});const ids=auth.memberships.filter(m=>m.role==="owner"||m.role==="manager").map(m=>m.restaurant_id);if(!ids.length)return NextResponse.json({error:"Manager access required"},{status:403});const db=getSupabaseAdmin();const {data,error}=await db.from("order_feedback").select("id,order_id,restaurant_id,rating,comment,created_at").in("restaurant_id",ids).order("created_at",{ascending:false}).limit(100);if(error)throw error;return NextResponse.json({feedback:data??[]},{headers:{"Cache-Control":"no-store"}});}catch(e){console.error("Staff feedback GET",e);return NextResponse.json({error:"Unable to load feedback"},{status:500});}
}
