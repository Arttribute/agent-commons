import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { dummyComments, dummyUsers } from "@/lib/dummy-data";
import { formatDistanceToNow } from "date-fns";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PostContent } from "@/components/blog/post-content";
import { PostActions } from "@/components/blog/post-actions";
import { CommentList } from "@/components/blog/comment-form";
import { getPostBySlugAndUsername, createDummyPost } from "@/lib/post-storage";
import { EditPostButton } from "@/components/blog/edit-post-button";
import AppBar from "@/components/layout/app-bar";

interface BlogPostPageProps {
  username: string;
  postslug: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<BlogPostPageProps>;
}) {
  const user = (await params).username;
  const slug = (await params).postslug;
  console.log("User:", user);
  console.log("Slug:", slug);
  console.log("Generating metadata for post:", slug, user);
  const post = getPostBySlugAndUsername(slug, user);

  if (!post) {
    return {
      title: "Post Not Found",
      description: "The requested blog post could not be found.",
    };
  }

  return {
    title: `${post.title} | Agent Commons Blog`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      authors: [post.author.name],
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      images: [post.coverImage || ""],
    },
  };
}

// Helper function to find a user by username
function findUser(username: string) {
  return dummyUsers.find(
    (userObj) =>
      userObj.name.toLowerCase().replace(/\s+/g, "-") === username.toLowerCase()
  );
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<BlogPostPageProps>;
}) {
  const user = (await params).username;
  const slug = (await params).postslug;

  // Check if params are valid
  if (!user || !slug) {
    notFound();
  }

  // Find the post with the matching user and slug
  const post = getPostBySlugAndUsername(slug, user);
  console.log("Post:", post);

  // If post not found, try to create a fallback
  if (!post) {
    const foundUser = findUser(user);
    if (!foundUser) {
      notFound();
    }

    const fallbackPost = createDummyPost(slug, foundUser);
    const comments: any[] = []; // no comments for fallback

    return (
      <>
        <AppBar />
        <div className="container mx-auto px-4 py-8 mt-16 lg:max-w-4xl">
          <div className="grid grid-cols-1  gap-8">
            <div>
              <article className="max-w-none">
                <div className="mb-8 not-prose">
                  <div className="flex items-center space-x-2 mb-4">
                    <Link
                      href="/blog"
                      className="text-sm text-muted-foreground hover:underline"
                    >
                      Blog
                    </Link>
                    <span className="text-muted-foreground">/</span>
                    <Link
                      href={`/blog/${user}`}
                      className="text-sm text-muted-foreground hover:underline"
                    >
                      {fallbackPost.author.name}
                    </Link>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-sm">{fallbackPost.title}</span>
                  </div>

                  <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
                    {fallbackPost.title}
                  </h1>

                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-4">
                      <Avatar>
                        <AvatarImage
                          src={fallbackPost.author.avatar}
                          alt={fallbackPost.author.name}
                        />
                        <AvatarFallback>
                          {fallbackPost.author.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          <Link
                            href={`/blog/${user}`}
                            className="hover:underline"
                          >
                            {fallbackPost.author.name}
                          </Link>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Published{" "}
                          {formatDistanceToNow(
                            new Date(fallbackPost.publishedAt),
                            { addSuffix: true }
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {fallbackPost.coverImage && (
                    <div className="aspect-video w-full overflow-hidden rounded-lg mb-8">
                      <img
                        src={fallbackPost.coverImage || "/placeholder.svg"}
                        alt={fallbackPost.title}
                        className="object-cover w-full h-full"
                      />
                    </div>
                  )}
                </div>

                <PostContent content={fallbackPost.content} />

                <div className="mt-8 not-prose">
                  <div className="flex flex-wrap gap-2">
                    {fallbackPost.tags.map((tag) => (
                      <Link key={tag} href={`/blog?tag=${tag}`}>
                        <Badge variant="secondary">{tag}</Badge>
                      </Link>
                    ))}
                  </div>

                  <Separator className="my-8" />

                  <PostActions
                    postId={fallbackPost.id}
                    username={user}
                    slug={fallbackPost.slug}
                    initialLikes={fallbackPost.likes}
                    initialComments={comments.length}
                  />
                </div>
              </article>

              <Separator className="my-8" />

              <div className="space-y-6" id="comments">
                <CommentList comments={comments} postId={fallbackPost.id} />
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Get comments for this post
  const comments = dummyComments.filter(
    (comment) => comment.postId === post.id
  );
  const isUpdated = post.updatedAt !== post.publishedAt;

  return (
    <>
      <AppBar />
      <div className="container mx-auto px-4 py-8 mt-16 lg:max-w-4xl">
        <div className="grid grid-cols-1  gap-8">
          <div>
            <article className="max-w-none">
              <div className="mb-8 not-prose">
                <div className="flex items-center space-x-2 mb-4">
                  <Link
                    href="/blog"
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    Blog
                  </Link>
                  <span className="text-muted-foreground">/</span>
                  <Link
                    href={`/blog/${user}`}
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    {post.author.name}
                  </Link>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-sm">{post.title}</span>
                </div>

                <div className="flex justify-between items-start mb-4">
                  <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold">
                    {post.title}
                  </h1>
                  <EditPostButton post={post} />
                </div>

                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <Avatar>
                      <AvatarImage
                        src={post.author.avatar}
                        alt={post.author.name}
                      />
                      <AvatarFallback>
                        {post.author.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">
                        <Link
                          href={`/blog/${user}`}
                          className="hover:underline"
                        >
                          {post.author.name}
                        </Link>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Published{" "}
                        {formatDistanceToNow(new Date(post.publishedAt), {
                          addSuffix: true,
                        })}
                        {isUpdated && (
                          <span className="ml-2">
                            • Updated{" "}
                            {formatDistanceToNow(new Date(post.updatedAt), {
                              addSuffix: true,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {post.isAgentGenerated && (
                    <Badge variant="outline" className="ml-auto">
                      Agent Generated
                    </Badge>
                  )}
                </div>

                {post.coverImage && (
                  <div className="aspect-video w-full overflow-hidden rounded-lg mb-8">
                    <img
                      src={post.coverImage || "/placeholder.svg"}
                      alt={post.title}
                      className="object-cover w-full h-full"
                    />
                  </div>
                )}
              </div>

              <PostContent content={post.content} />

              <div className="mt-8 not-prose">
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <Link key={tag} href={`/blog?tag=${tag}`}>
                      <Badge variant="secondary">{tag}</Badge>
                    </Link>
                  ))}
                </div>

                <Separator className="my-8" />

                <PostActions
                  postId={post.id}
                  username={user}
                  slug={post.slug}
                  initialLikes={post.likes}
                  initialComments={comments.length}
                />
              </div>
            </article>

            <Separator className="my-8" />

            <div className="space-y-6" id="comments">
              <CommentList comments={comments} postId={post.id} />
            </div>
          </div>

          <div className="space-y-6"></div>
        </div>
      </div>
    </>
  );
}
