import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dummyAllPosts } from "@/lib/dummy-data";
import Link from "next/link";

interface RelatedPostsProps {
  currentPostId: string;
  tags: string[];
  username?: string;
}

export function RelatedPosts({
  currentPostId,
  tags,
  username,
}: RelatedPostsProps) {
  // Find posts with matching tags, excluding the current post
  const relatedPosts = dummyAllPosts
    .filter((post) => post.id !== currentPostId)
    .filter((post) => post.tags.some((tag) => tags.includes(tag)))
    .sort((a, b) => {
      // Count matching tags
      const aMatches = a.tags.filter((tag) => tags.includes(tag)).length;
      const bMatches = b.tags.filter((tag) => tags.includes(tag)).length;

      // Sort by number of matching tags (descending)
      return bMatches - aMatches;
    })
    .slice(0, 3);

  // If no related posts, show some random posts
  const postsToShow =
    relatedPosts.length > 0
      ? relatedPosts
      : dummyAllPosts
          .filter((post) => post.id !== currentPostId)
          .sort(() => 0.5 - Math.random())
          .slice(0, 3);

  if (postsToShow.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {relatedPosts.length > 0 ? "Related Posts" : "You May Also Like"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {postsToShow.map((post) => {
            const postUsername = post.author.name
              .toLowerCase()
              .replace(/\s+/g, "-");

            return (
              <Link
                key={post.id}
                href={`/blog/${postUsername}/${post.slug}`}
                className="block group"
              >
                <div className="flex space-x-3">
                  {post.coverImage && (
                    <div className="flex-shrink-0 w-16 h-16 rounded overflow-hidden">
                      <img
                        src={post.coverImage || "/placeholder.svg"}
                        alt={post.title}
                        className="object-cover w-full h-full transition-transform group-hover:scale-105"
                      />
                    </div>
                  )}
                  <div>
                    <h3 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
                      {post.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {post.author.name}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
