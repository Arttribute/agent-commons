// app/api/tool-permissions/revoke/[permissionId]/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * DELETE /api/tool-permissions/revoke/:permissionId - Revoke permission
 */
export async function DELETE(
  request: Request,
  { params }: { params: { permissionId: string } }
) {
  try {
    const res = await fetch(
      `${baseUrl}/v1/tool-permissions/revoke/${params.permissionId}`,
      {
        method: "DELETE",
      }
    );

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error revoking permission:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
