import { connection, NextResponse } from "next/server";
import { authenticateStaff } from "@/lib/staffAuth";

export async function GET(request: Request) {
  await connection();
  try {
    const auth = await authenticateStaff(request);
    if (!auth.ok) return NextResponse.json({error:auth.error},{status:auth.status});
    return NextResponse.json({
      memberships: auth.memberships,
      canManageMenu: true,
      isOwner: auth.memberships.some(m=>m.role === "owner"),
    }, {headers:{"Cache-Control":"private, no-store"}});
  } catch(e) {
    console.error("Staff access",e);
    return NextResponse.json({error:"Unable to verify account"},{status:500});
  }
}
