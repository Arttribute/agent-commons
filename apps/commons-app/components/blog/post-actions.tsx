"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Heart,
  MessageSquare,
  Share2,
  Bookmark,
  Twitter,
  Linkedin,
  Copy,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

interface PostActionsProps {
  postId: string;
  username: string;
  slug: string;
  initialLikes: number;
  initialComments: number;
  onCommentClick?: () => void;
  className?: string;
}

export function PostActions({
  postId,
  username,
  slug,
  initialLikes,
  initialComments,
  onCommentClick,
  className,
}: PostActionsProps) {
  const [likes, setLikes] = useState(initialLikes);
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const { toast } = useToast();
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const user = walletAddress?.toLowerCase();
  const router = useRouter();

  const handleLike = () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to like posts",
      });
      return;
    }

    // Toggle like state
    if (isLiked) {
      setLikes((prev) => prev - 1);
      setIsLiked(false);
      unlikePost(postId);
    } else {
      setLikes((prev) => prev + 1);
      setIsLiked(true);
      likePost(postId);
    }
  };

  const handleBookmark = () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to bookmark posts",
      });
      return;
    }

    setIsBookmarked(!isBookmarked);

    toast({
      title: isBookmarked ? "Bookmark removed" : "Post bookmarked",
      description: isBookmarked
        ? "This post has been removed from your bookmarks"
        : "This post has been added to your bookmarks",
    });

    // Call bookmark/unbookmark function
    toggleBookmark(postId);
  };

  const handleCommentClick = () => {
    if (onCommentClick) {
      onCommentClick();
    } else {
      // If no callback provided, navigate to the comments section
      const commentsSection = document.getElementById("comments");
      if (commentsSection) {
        commentsSection.scrollIntoView({ behavior: "smooth" });
      } else {
        // If we can't find the comments section, navigate to the post with the comments hash
        router.push(`/blog/${username}/${slug}#comments`);
      }
    }
  };

  const copyToClipboard = async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/blog/${username}/${slug}`
        : `/blog/${username}/${slug}`;

    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);

      toast({
        title: "Link copied",
        description: "Post link copied to clipboard",
      });

      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Could not copy the link to clipboard",
        variant: "destructive",
      });
    }
  };

  const shareToTwitter = () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/blog/${username}/${slug}`
        : `/blog/${username}/${slug}`;
    const text = "Check out this post on Agent Commons Blog!";
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, "_blank");
  };

  const shareToLinkedIn = () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/blog/${username}/${slug}`
        : `/blog/${username}/${slug}`;
    const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(linkedinUrl, "_blank");
  };

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="sm"
          className={`flex items-center space-x-1 ${isLiked ? "text-red-500" : ""}`}
          onClick={handleLike}
        >
          <Heart className={`h-4 w-4 mr-1 ${isLiked ? "fill-current" : ""}`} />
          <span>{likes} Likes</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="flex items-center space-x-1"
          onClick={handleCommentClick}
        >
          <MessageSquare className="h-4 w-4 mr-1" />
          <span>{initialComments} Comments</span>
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Share2 className="h-4 w-4" />
              <span className="sr-only">Share</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={shareToTwitter}
              className="cursor-pointer"
            >
              <Twitter className="h-4 w-4 mr-2" />
              Share on Twitter/X
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={shareToLinkedIn}
              className="cursor-pointer"
            >
              <Linkedin className="h-4 w-4 mr-2" />
              Share on LinkedIn
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={copyToClipboard}
              className="cursor-pointer"
            >
              {isCopied ? (
                <Check className="h-4 w-4 mr-2" />
              ) : (
                <Copy className="h-4 w-4 mr-2" />
              )}
              Copy link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleBookmark}
          className={isBookmarked ? "text-primary" : ""}
        >
          <Bookmark
            className={`h-4 w-4 ${isBookmarked ? "fill-current" : ""}`}
          />
          <span className="sr-only">Bookmark</span>
        </Button>
      </div>
    </div>
  );
}

// Placeholder functions for backend interactions
// These would be replaced with actual API calls

function likePost(postId: string) {
  // In a real app, this would be an API call
  console.log(`Liked post ${postId}`);
  // Example API call:
  // return fetch(`/api/posts/${postId}/like`, { method: 'POST' })
}

function unlikePost(postId: string) {
  // In a real app, this would be an API call
  console.log(`Unliked post ${postId}`);
  // Example API call:
  // return fetch(`/api/posts/${postId}/like`, { method: 'DELETE' })
}

function toggleBookmark(postId: string) {
  // In a real app, this would be an API call
  console.log(`Toggled bookmark for post ${postId}`);
  // Example API call:
  // return fetch(`/api/posts/${postId}/bookmark`, { method: 'POST' })
}
