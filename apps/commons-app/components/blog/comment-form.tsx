"use client";

import type React from "react";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: {
    name: string;
    avatar: string;
  };
  likes: number;
  isAgentGenerated?: boolean;
}

interface CommentFormProps {
  postId: string;
  onCommentAdded?: (comment: Comment) => void;
}

export function CommentForm({ postId, onCommentAdded }: CommentFormProps) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const user = walletAddress?.toLowerCase();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!comment.trim()) return;

    setIsSubmitting(true);

    try {
      // This would be an API call in a real app
      // const response = await fetch('/api/comments', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ postId, content: comment }),
      // })
      // const data = await response.json()

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Create a new comment object
      const newComment: Comment = {
        id: `comment-${Date.now()}`,
        content: comment,
        createdAt: new Date().toISOString(),
        author: {
          name: user || "Anonymous",
          avatar: user || "/placeholder.svg?height=40&width=40",
        },
        likes: 0,
      };

      // Call the callback if provided
      if (onCommentAdded) {
        onCommentAdded(newComment);
      }

      toast({
        title: "Comment added",
        description: "Your comment has been added successfully.",
      });

      setComment("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add comment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="p-4 border rounded-lg bg-muted/50">
        <p className="text-sm text-muted-foreground text-center">
          Please{" "}
          <Button variant="link" className="p-0 h-auto">
            log in
          </Button>{" "}
          to leave a comment.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={user} alt={user} />
          <AvatarFallback>{user.charAt(0)}</AvatarFallback>
        </Avatar>
        <Textarea
          placeholder="Add a comment..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="min-h-[100px] flex-1"
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || !comment.trim()}>
          {isSubmitting ? "Posting..." : "Post Comment"}
        </Button>
      </div>
    </form>
  );
}

export function CommentList({
  comments,
  postId,
}: {
  comments: Comment[];
  postId: string;
}) {
  const [commentsList, setCommentsList] = useState<Comment[]>(comments);

  const handleCommentAdded = (newComment: Comment) => {
    setCommentsList((prev) => [newComment, ...prev]);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Comments ({commentsList.length})</h2>

      <CommentForm postId={postId} onCommentAdded={handleCommentAdded} />

      <div className="space-y-4">
        {commentsList.map((comment) => (
          <CommentItem key={comment.id} comment={comment} />
        ))}
      </div>
    </div>
  );
}

function CommentItem({ comment }: { comment: Comment }) {
  const [likes, setLikes] = useState(comment.likes);
  const [isLiked, setIsLiked] = useState(false);

  const handleLike = () => {
    if (isLiked) {
      setLikes((prev) => prev - 1);
      setIsLiked(false);
    } else {
      setLikes((prev) => prev + 1);
      setIsLiked(true);
    }
  };

  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-center space-x-2 mb-2">
        <Avatar className="h-6 w-6">
          <AvatarImage src={comment.author.avatar} alt={comment.author.name} />
          <AvatarFallback>{comment.author.name.charAt(0)}</AvatarFallback>
        </Avatar>
        <span className="font-medium">{comment.author.name}</span>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(comment.createdAt), {
            addSuffix: true,
          })}
        </span>
        {comment.isAgentGenerated && (
          <Badge variant="outline" className="text-xs">
            Agent
          </Badge>
        )}
      </div>
      <p className="text-sm">{comment.content}</p>
      <div className="flex items-center mt-2 text-sm text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          className={`h-auto p-0 ${isLiked ? "text-red-500" : "text-muted-foreground"}`}
          onClick={handleLike}
        >
          <Heart className={`h-3 w-3 mr-1 ${isLiked ? "fill-current" : ""}`} />
          <span>{likes}</span>
        </Button>
      </div>
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { Heart } from "lucide-react";
