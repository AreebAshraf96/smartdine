"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
type Item={id:string;restaurant_id:string;category_id:string;name:string;description:string|null;price:number;is_available:boolean};
type Category={id:string;restaurant_id:string;name:string};
export default function ManagerMenu(){
 const [items,setItems]=useState<Item[]>([]),[categories,setCategories]=useState<Category[]>([]),[restaurantIds,setRestaurantIds]=useState<string[]>([]);
 const [restaurantId,setRestaurantId]=useState(""),[categoryId,setCategoryId]=useState("");
 const [name,setName]=useState(""),[description,setDescription]=useState(""),[price,setPrice]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const request=useCallback(async(method:"GET"|"POST"|"PATCH"|"DELETE",body?:Record<string,unknown>)=>{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session)throw new Error("Sign in again");
   const res=await fetch("/api/staff/menu",{method,cache:"no-store",headers:{Authorization:`Bearer ${session.access_token}`,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
   const data=await res.json().catch(()=>({}));
   if(!res.ok)throw new Error(data.error??`HTTP ${res.status}`);
   return data;
 },[]);
 const refresh=useCallback(async()=>{const result=await request("GET");setItems(result.items);setCategories(result.categories);setRestaurantIds(result.restaurantIds);setRestaurantId(prev=>prev||result.restaurantIds[0]||"");},[request]);
 useEffect(()=>{void refresh().catch(e=>setError(String(e)));},[refresh]);
 useEffect(()=>{if(restaurantId){setCategoryId(categories.find(c=>c.restaurant_id===restaurantId)?.id??"");}},[restaurantId,categories]);
 async function action(fn:()=>Promise<unknown>,success:string){setBusy(true);setError("");setMessage("");try{await fn();await refresh();setMessage(success);}catch(e){setError(e instanceof Error?e.message:"Operation failed");}finally{setBusy(false);}}
 return <section className="space-y-5">
  <h2 className="text-xl font-semibold">Manager — Menu Administration</h2>
  <p className="text-sm text-gray-600">Add, edit and archive items. Archived items should be hidden from the customer menu.</p>
  {error&&<p role="alert" className="text-red-700">{error}</p>}{message&&<p role="status" className="text-green-700">{message}</p>}
  <form className="rounded-xl border bg-white p-4 space-y-3" onSubmit={e=>{e.preventDefault();void action(async()=>{await request("POST",{restaurant_id:restaurantId,category_id:categoryId,name,description,price:Number(price)});setName("");setDescription("");setPrice("");},"Item added");}}>
   <h3 className="font-semibold">Add menu item</h3>
   <label className="block text-sm">Restaurant<select className="mt-1 w-full rounded border p-2" value={restaurantId} onChange={e=>setRestaurantId(e.target.value)}>{restaurantIds.map(id=><option value={id} key={id}>{id}</option>)}</select></label>
   <label className="block text-sm">Category<select className="mt-1 w-full rounded border p-2" required value={categoryId} onChange={e=>setCategoryId(e.target.value)}>{categories.filter(c=>c.restaurant_id===restaurantId).map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
   <label className="block text-sm">Item name<input className="mt-1 w-full rounded border p-2" maxLength={120} required value={name} onChange={e=>setName(e.target.value)}/></label>
   <label className="block text-sm">Description<textarea className="mt-1 w-full rounded border p-2" maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)}/></label>
   <label className="block text-sm">Price (PKR)<input className="mt-1 w-full rounded border p-2" type="number" min="0" max="1000000" step="0.01" required value={price} onChange={e=>setPrice(e.target.value)}/></label>
   <button disabled={busy||!restaurantId||!categoryId} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">Add item</button>
  </form>
  <div className="space-y-3">{items.filter(i=>i.restaurant_id===restaurantId).map(item=><div key={item.id} className="rounded-xl border bg-white p-4 flex flex-wrap items-center justify-between gap-3">
   <div><p className="font-semibold">{item.name}</p><p className="text-sm">PKR {item.price.toLocaleString("en-PK")}</p></div>
   <div className="flex gap-2"><button disabled={busy} className="rounded border px-3 py-2" onClick={()=>{const next=prompt(`New name for ${item.name}`,item.name);if(next!==null)void action(()=>request("PATCH",{id:item.id,name:next}),"Name updated");}}>Rename</button>
   <button disabled={busy} className="rounded border px-3 py-2" onClick={()=>{const input=prompt("New price in PKR",String(item.price));if(input!==null&&input.trim()!==""&&Number.isFinite(Number(input)))void action(()=>request("PATCH",{id:item.id,price:Number(input)}),"Price updated");}}>Edit price</button>
   <button disabled={busy} className="rounded border border-red-300 px-3 py-2 text-red-700" onClick={()=>{if(confirm(`Archive ${item.name}?`))void action(()=>request("DELETE",{id:item.id}),"Item archived");}}>Archive</button></div>
  </div>)}</div>
 </section>;
}
