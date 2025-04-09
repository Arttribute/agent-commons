// app/api/tools/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase"; // Import Supabase client

export async function POST(request: Request) {
  try {
    const { name, description, customJson, userAddress } = await request.json();
    // Insert into "tool" table
    console.log("Creating tool with data:", {
      name,
      description,
      customJson,
      userAddress,
    });
    if (!name || !description || !customJson || !userAddress) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }
    const { data, error } = await supabase
      .from("tool")
      .insert([
        {
          name,
          owner: userAddress, // your wallet as owner
          schema: {
            name,
            description,
            customJson,
          },
        },
      ])
      .select("*"); // Return inserted rows

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { success: false, error: err.message || "Error creating tool" },
      { status: 500 }
    );
  }
}
