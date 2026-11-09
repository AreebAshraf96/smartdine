"use client";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Access = { memberships?: { restaurant_id:string;role:string }[]; error?:string };
export default function StaffLogin() {
  const router = useRouter();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const enter = useCallback(async (token:string) => {
    const response=await fetch("/api/staff/access",{cache:"no-store",headers:{Authorization:`Bearer ${token}`}});
    const data=(await response.json()) as Access;
    if (!response.ok) throw new Error(data.error || "Not authorized");
    const roles=(data.memberships??[]).map(m=>m.role);
    if (roles.includes("owner")) router.replace("/staff/owner");
    else if (roles.includes("manager")) router.replace("/staff/manager");
    else throw new Error("An owner or manager account is required");
    router.refresh();
  },[router]);

  useEffect(()=>{
    let mounted=true;
    void supabase.auth.getSession().then(async({data})=>{
      if(data.session?.access_token) {
        try {await enter(data.session.access_token);}catch(e){if(mounted)setError(e instanceof Error?e.message:"Access denied");}
      }
    }).finally(()=>{if(mounted)setLoading(false);});
    return()=>{mounted=false;};
  },[enter]);

  async function signIn(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setLoading(true);setError("");
    try {
      const {data,error:loginError}=await supabase.auth.signInWithPassword({email,password});
      if(loginError)throw loginError;
      if(!data.session)throw new Error("No active session");
      await enter(data.session.access_token);
      setPassword("");
    } catch(e) {setError(e instanceof Error?e.message:"Login unsuccessful");}
    finally{setLoading(false);}
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5 text-slate-900">
    <form onSubmit={e=>void signIn(e)} className="w-full max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div><p className="text-sm font-bold uppercase tracking-widest text-slate-500">SmartDine</p>
        <h1 className="mt-2 text-3xl font-extrabold">Restaurant staff login</h1>
        <p className="mt-2 text-sm text-slate-600">Manager and owner accounts only. Your dashboard is selected automatically.</p></div>
      <label className="block text-sm font-medium">Email
        <input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full rounded-lg border p-3" />
      </label>
      <label className="block text-sm font-medium">Password
        <input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-lg border p-3" />
      </label>
      {error&&<p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      <button disabled={loading} className="w-full rounded-lg bg-slate-900 p-3 font-semibold text-white disabled:opacity-50">{loading?"Checking account...":"Sign in"}</button>
      <p className="text-xs text-slate-500">Account creation and role assignment are performed by the restaurant administrator. No public staff registration.</p>
    </form>
  </main>;
}
