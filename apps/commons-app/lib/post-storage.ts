// This file provides client-side storage for posts in development
// In a real app, this would be replaced with a database

import { dummyAllPosts, dummyUsers } from "./dummy-data";
import { slugify } from "./utils";

// Type definitions
export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string | null;
  publishedAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    avatar: string;
    isAgent?: boolean;
  };
  tags: string[];
  featured: boolean;
  isAgentGenerated: boolean;
  likes: number;
  views: number;
}

// Initialize storage with dummy posts
let posts: Post[] = [...dummyAllPosts];

// Get all posts
export function getAllPosts(): Post[] {
  // Get posts from localStorage if available
  if (typeof window !== "undefined") {
    const storedPosts = localStorage.getItem("blog-posts");
    console.log("Posts loaded from storage:", storedPosts);
    if (storedPosts) {
      const parsedPosts = JSON.parse(storedPosts);
      // Merge with dummy posts, preferring stored posts for duplicates
      const mergedPosts: Post[] = [...dummyAllPosts];

      // Add or update posts from localStorage
      parsedPosts.forEach((storedPost: Post) => {
        const index = mergedPosts.findIndex((p) => p.id === storedPost.id);
        if (index >= 0) {
          mergedPosts[index] = storedPost;
        } else {
          mergedPosts.push(storedPost);
        }
      });

      posts = mergedPosts;
    }
  }

  return posts;
}

// Get post by ID
export function getPostById(id: string): Post | undefined {
  return getAllPosts().find((post) => post.id === id);
}

// Get post by slug and username
export function getPostBySlugAndUsername(
  slug: string,
  username: string
): Post | undefined {
  const allPosts = getAllPosts();
  const post = allPosts.find((post) => post.slug === slug);
  console.log("Post found:", post);
  return post;
}

// Create a new post
export function createPost(postData: {
  title: string;
  content: string;
  tags: string[];
  coverImage: string | null;
  authorId: string;
}): Post {
  const { title, content, tags, coverImage, authorId } = postData;

  // Find the author
  const author = dummyUsers.find((user) => user.id === authorId);
  if (!author) {
    throw new Error("Author not found");
  }

  // Generate excerpt from content
  const excerpt = content
    .replace(/#+\s+(.*)/g, "$1") // Remove headings
    .replace(/\[([^\]]+)\]$$[^)]+$$/g, "$1") // Remove links
    .replace(/\*\*([^*]+)\*\*/g, "$1") // Remove bold
    .replace(/\*([^*]+)\*/g, "$1") // Remove italic
    .replace(/`([^`]+)`/g, "$1") // Remove inline code
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks
    .replace(/!\[.*?\]$$.*?$$/g, "") // Remove images
    .replace(/>\s*(.*)/g, "$1") // Remove blockquotes
    .replace(/\n+/g, " ") // Replace newlines with spaces
    .trim()
    .slice(0, 160);

  // Create new post
  const newPost: Post = {
    id: `user-${Date.now()}`,
    title,
    slug: slugify(title),
    excerpt: excerpt + (excerpt.length >= 160 ? "..." : ""),
    content,
    coverImage,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: {
      id: author.id,
      name: author.name,
      avatar: author.avatar,
      isAgent: author.isAgent,
    },
    tags,
    featured: false,
    isAgentGenerated: !!author.isAgent,
    likes: 0,
    views: 0,
  };

  // Add to posts array
  posts = [...getAllPosts(), newPost];

  // Save to localStorage
  if (typeof window !== "undefined") {
    localStorage.setItem("blog-posts", JSON.stringify(posts));
  }

  return newPost;
}

// Update an existing post
export function updatePost(
  id: string,
  postData: {
    title?: string;
    content?: string;
    tags?: string[];
    coverImage?: string | null;
  }
): Post {
  const allPosts = getAllPosts();
  const postIndex = allPosts.findIndex((post) => post.id === id);

  if (postIndex === -1) {
    throw new Error("Post not found");
  }

  const post = allPosts[postIndex];
  const updatedPost = {
    ...post,
    ...postData,
    updatedAt: new Date().toISOString(),
  };

  // If title changed, update slug
  if (postData.title && postData.title !== post.title) {
    updatedPost.slug = slugify(postData.title);
  }

  // If content changed, update excerpt
  if (postData.content && postData.content !== post.content) {
    const excerpt = postData.content
      .replace(/#+\s+(.*)/g, "$1")
      .replace(/\[([^\]]+)\]$$[^)]+$$/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/!\[.*?\]$$.*?$$/g, "")
      .replace(/>\s*(.*)/g, "$1")
      .replace(/\n+/g, " ")
      .trim()
      .slice(0, 160);

    updatedPost.excerpt = excerpt + (excerpt.length >= 160 ? "..." : "");
  }

  // Update posts array
  allPosts[postIndex] = updatedPost;
  posts = allPosts;

  // Save to localStorage
  if (typeof window !== "undefined") {
    localStorage.setItem("blog-posts", JSON.stringify(posts));
  }

  return updatedPost;
}

// Delete a post
export function deletePost(id: string): boolean {
  const allPosts = getAllPosts();
  const filteredPosts = allPosts.filter((post) => post.id !== id);

  if (filteredPosts.length === allPosts.length) {
    return false; // Post not found
  }

  posts = filteredPosts;

  // Save to localStorage
  if (typeof window !== "undefined") {
    localStorage.setItem("blog-posts", JSON.stringify(posts));
  }

  return true;
}

// Helper function to create a post with a specific slug (for testing)
export function createDummyPost(slug: string, author = dummyUsers[0]) {
  return {
    id: `custom-${Date.now()}`,
    title: slug.replace(/-/g, " "),
    slug: slug,
    excerpt: `This is a custom post with slug "${slug}".`,
    content: `# ${slug.replace(/-/g, " ")}\n\nThis is a custom post .`,
    coverImage: "/placeholder.svg?height=400&width=600",
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: author,
    tags: ["Custom", "Test"],
    featured: false,
    isAgentGenerated: false,
    likes: 0,
    views: 0,
  };
}
