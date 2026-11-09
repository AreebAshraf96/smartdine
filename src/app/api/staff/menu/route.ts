import { NextResponse } from "next/server";
import { authenticateStaff } from "@/lib/staffAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { connection } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(error: string, status: number) { return NextResponse.json({error}, {status}); }
async function manager(request: Request) {
  await connection();
  const auth = await authenticateStaff(request);
  if (!auth.ok) return { error: fail(auth.error, auth.status) };
  const ids = [...new Set(auth.memberships.filter(m => m.role === "owner" || m.role === "manager").map(m => m.restaurant_id))];
  if (!ids.length) return { error: fail("Manager access required", 403) };
  return { ids };
}
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
async function parse(request: Request) {
  const raw = await request.text();
  if (raw.length > 4000) throw new Error("Request too large");
  return JSON.parse(raw) as Record<string, unknown>;
}
export async function GET(request: Request) {
  try {
    const a = await manager(request); if (a.error) return a.error;
    const db = getSupabaseAdmin();
    const {data,error} = await db.from("menu_items")
      .select("id,restaurant_id,category_id,name,description,price,is_available,is_archived")
      .in("restaurant_id", a.ids!).eq("is_archived",false).order("name");
    if (error) throw error;
    const {data:categories,error:categoriesError}=await db.from("menu_categories")
      .select("id,restaurant_id,name").in("restaurant_id",a.ids!).order("name");
    if(categoriesError)throw categoriesError;
    return NextResponse.json({items:data ?? [],categories:categories ?? [],restaurantIds:a.ids!}, {headers:{"Cache-Control":"no-store"}});
  } catch (e) { console.error("Manager menu GET",e); return fail("Unable to load menu",500); }
}
export async function POST(request: Request) {
  try {
    if(!sameOrigin(request)) return fail("Invalid origin",403);
    const a=await manager(request); if(a.error) return a.error;
    const b=await parse(request);
    if(typeof b.restaurant_id!=="string" || !UUID.test(b.restaurant_id) || !a.ids!.includes(b.restaurant_id)) return fail("Invalid restaurant",403);
    if(typeof b.category_id!=="string" || !UUID.test(b.category_id)) return fail("Choose a category",400);
    if(typeof b.name!=="string" || !b.name.trim() || b.name.length>120 ||
       (b.description != null && (typeof b.description!=="string" || b.description.length>1000)) ||
       typeof b.price!=="number" || !Number.isFinite(b.price) || b.price<0 || b.price>1000000) return fail("Invalid menu item",400);
    const db=getSupabaseAdmin();
    // Ensure this category belongs to the selected restaurant.
    const {data:category,error:catErr}=await db.from("menu_categories").select("id").eq("id",b.category_id).eq("restaurant_id",b.restaurant_id).maybeSingle();
    if(catErr) throw catErr;
    if(!category) return fail("Category does not belong to restaurant",400);
    const {data,error}=await db.from("menu_items").insert({restaurant_id:b.restaurant_id,category_id:b.category_id,name:b.name.trim(),description:typeof b.description==="string"?b.description.trim():null,price:b.price,is_available:true}).select("id").single();
    if(error) throw error;
    return NextResponse.json({item:data},{status:201});
  } catch(e) {console.error("Manager menu POST",e); return fail("Unable to add item",500);}
}
export async function PATCH(request: Request) {
  try {
    if(!sameOrigin(request)) return fail("Invalid origin",403);
    const a=await manager(request); if(a.error) return a.error;
    const b=await parse(request);
    if(typeof b.id!=="string" || !UUID.test(b.id)) return fail("Invalid item ID",400);
    const update:Record<string,unknown>={};
    if(b.name!==undefined) {if(typeof b.name!=="string"||!b.name.trim()||b.name.length>120)return fail("Invalid name",400);update.name=b.name.trim();}
    if(b.description!==undefined) {if(b.description!==null && (typeof b.description!=="string" || b.description.length>1000)) return fail("Invalid description",400);update.description=b.description;}
    if(b.price!==undefined) {if(typeof b.price!=="number"||!Number.isFinite(b.price)||b.price<0||b.price>1000000)return fail("Invalid price",400);update.price=b.price;}
    if(!Object.keys(update).length)return fail("Nothing to update",400);
    const db=getSupabaseAdmin();
    const {data,error}=await db.from("menu_items").update(update).eq("id",b.id).in("restaurant_id",a.ids!).select("id").maybeSingle();
    if(error)throw error;if(!data)return fail("Item not found",404);
    return NextResponse.json({item:data});
  } catch(e){console.error("Manager menu PATCH",e);return fail("Unable to edit item",500);}
}
export async function DELETE(request: Request) {
  try {
    if(!sameOrigin(request)) return fail("Invalid origin",403);
    const a=await manager(request);if(a.error)return a.error;
    const b=await parse(request);
    if(typeof b.id!=="string"||!UUID.test(b.id))return fail("Invalid item ID",400);
    const db=getSupabaseAdmin();
    // Remove from current menu without deleting historical order-item records.
    const {data,error}=await db.from("menu_items").update({is_available:false,is_archived:true}).eq("id",b.id).in("restaurant_id",a.ids!).select("id").maybeSingle();
    if(error)throw error;if(!data)return fail("Item not found",404);
    return NextResponse.json({success:true,note:"Item archived from ordering (out of stock). Historical records preserved."});
  }catch(e){console.error("Manager menu DELETE",e);return fail("Unable to archive item",500);}
}
