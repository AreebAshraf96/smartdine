"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import StaffDashboard from "@/components/StaffDashboard";
import OwnerAnalytics from "@/components/OwnerAnalytics";
import StaffReceipts from "@/components/StaffReceipts";

export default function OwnerPage(){
 const router=useRouter();
 const [allowed,setAllowed]=useState<boolean|null>(null);
 const [tab,setTab]=useState<"analytics"|"operations"|"receipts">("analytics");
 useEffect(()=>{
  let live=true;
  async function verify(){
    const {data}=await supabase.auth.getSession();
    if(!data.session){router.replace("/staff/login");return;}
    const response=await fetch("/api/staff/access",{headers:{Authorization:`Bearer ${data.session.access_token}`},cache:"no-store"});
    const info=await response.json().catch(()=>({}));
    if(live)setAllowed(Boolean(response.ok && info.isOwner));
  }
  void verify().catch(()=>{if(live)setAllowed(false);});
  return()=>{live=false;};
 },[router]);
 if(allowed===null)return <main className="p-8">Checking owner permissions...</main>;
 if(!allowed)return <main className="space-y-4 p-8"><h1 className="text-xl font-bold">Owner permission required</h1><a className="underline" href="/staff/login">Go to login</a></main>;
 return <div className="min-h-screen bg-slate-50 text-slate-900">
   <nav className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-3">
     <strong>SmartDine · Owner Portal</strong>
     <div className="flex flex-wrap gap-2">
       <button type="button" onClick={()=>setTab("analytics")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab==="analytics"?"bg-black text-white":"border"}`}>Analytics & Reports</button>
       <button type="button" onClick={()=>setTab("operations")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab==="operations"?"bg-black text-white":"border"}`}>Manage Restaurant</button>
       <button type="button" onClick={()=>setTab("receipts")} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab==="receipts"?"bg-black text-white":"border"}`}>Receipts</button>
     </div>
   </nav>
   {tab==="analytics" && <OwnerAnalytics />}
   {tab==="operations" && <StaffDashboard view="manager" />}
   {tab==="receipts" && <main className="mx-auto max-w-5xl p-4 md:p-6"><StaffReceipts /></main>}
 </div>;
}
