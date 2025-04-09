"use client";

import type React from "react";
import { use } from "react";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MarkdownEditor } from "@/components/blog/markdown-editor";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { X, Image, Loader2 } from "lucide-react";
import { getPostBySlugAndUsername, updatePost } from "@/lib/post-storage";
import { notFound } from "next/navigation";
import AppBar from "@/components/layout/AppBar";

interface EditPostPageProps {
  username: string;
  postslug: string;
}

export default function EditPostPage({
  params,
}: {
  params: Promise<EditPostPageProps>;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [postId, setPostId] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const { authState } = useAuth();
  const { walletAddress } = authState;
  const user = walletAddress?.toLowerCase();

  const pageParams = use(params);

  // Load post data
  useEffect(() => {
    const post = getPostBySlugAndUsername(
      pageParams.postslug,
      pageParams.username
    );

    if (!post) {
      setIsLoading(false);
      return;
    }

    setTitle(post.title);
    setContent(post.content);
    setTags(post.tags);
    setCoverImage(post.coverImage);
    setPostId(post.id);
    setIsLoading(false);
  }, [pageParams.postslug, pageParams.username]);

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !content.trim() || !postId) {
      toast({
        title: "Missing fields",
        description: "Please provide both a title and content for your post.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Update the post
      const updatedPost = updatePost(postId, {
        title,
        content,
        tags,
        coverImage,
      });

      toast({
        title: "Post updated",
        description: "Your post has been updated successfully.",
      });

      // Get the username from the current user
      const username = user;

      // Redirect to the updated post
      router.push(`/blog/${username}/${updatedPost.slug}`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update post. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if user is logged in
  if (!user) {
    return (
      <>
        <AppBar />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>Edit Post</CardTitle>
              <CardDescription>
                You need to be logged in to edit a post.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button>Log in</Button>
            </CardFooter>
          </Card>
        </div>
      </>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 flex justify-center items-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading post...</p>
        </div>
      </div>
    );
  }

  // If post not found
  if (!postId) {
    return notFound();
  }

  // Check if user is the author
  const post = getPostBySlugAndUsername(
    pageParams.postslug,
    pageParams.username
  );
  if (post && post.author.id !== user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Permission Denied</CardTitle>
            <CardDescription>
              {"You don't have permission to edit this post."}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" onClick={() => router.back()}>
              Go Back
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Edit Post</CardTitle>
          <CardDescription>
            Update your post content, title, or tags.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Enter a descriptive title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cover-image">Cover Image</Label>
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex items-center"
                  onClick={() =>
                    setCoverImage("/placeholder.svg?height=400&width=600")
                  }
                >
                  <Image className="h-4 w-4 mr-2" />
                  Upload Image
                </Button>
                {coverImage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCoverImage(null)}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
              {coverImage && (
                <div className="mt-2 aspect-video w-full max-w-md overflow-hidden rounded-md">
                  <img
                    src={coverImage || "/placeholder.svg"}
                    alt="Cover"
                    className="object-cover w-full h-full"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Content</Label>
              <MarkdownEditor
                value={content}
                onChange={setContent}
                minHeight="400px"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="tags"
                  placeholder="Add tags (press Enter to add)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddTag}
                  disabled={!tagInput.trim()}
                >
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="flex items-center"
                    >
                      {tag}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 ml-1"
                        onClick={() => handleRemoveTag(tag)}
                      >
                        <X className="h-3 w-3" />
                        <span className="sr-only">Remove {tag}</span>
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/blog/${pageParams.username}/${pageParams.postslug}`)
            }
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim() || !content.trim()}
          >
            {isSubmitting ? "Saving..." : "Update Post"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
