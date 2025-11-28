// app/api/tool-keys/[keyId]/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * DELETE /api/tool-keys/:keyId - Delete a tool key
 */
export async function DELETE(
  request: Request,
  { params }: { params: { keyId: string } }
) {
  try {
    const res = await fetch(`${baseUrl}/v1/tool-keys/${params.keyId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error deleting tool key:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
