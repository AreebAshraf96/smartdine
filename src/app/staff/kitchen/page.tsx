import { redirect } from "next/navigation";
// Retired entry point. Only manager and owner user types exist.
export default function OldKitchen(){redirect("/staff/login");}
