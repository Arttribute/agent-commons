"use client";

import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import type { Post } from "@/lib/post-storage";

interface EditPostButtonProps {
  post: Post;
}

export function EditPostButton({ post }: EditPostButtonProps) {
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const user = walletAddress || null;

  // Only show edit button if user is logged in and is the author or an admin
  if (!user || walletAddress !== post.author.id) {
    return null;
  }

  const username = post.author.name.toLowerCase().replace(/\s+/g, "-");

  return (
    <Link href={`/blog/${username}/${post.slug}/edit`}>
      <Button variant="outline" size="sm" className="flex items-center gap-1">
        <Edit className="h-4 w-4" />
        <span>Edit</span>
      </Button>
    </Link>
  );
}
