import Link from "next/link";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { dummyFeaturedPosts } from "@/lib/dummy-data";
import { PostActions } from "@/components/blog/post-actions";

export function FeaturedPosts() {
  return (
    <section className="py-12">
      <div className="container px-4 md:px-6">
        <div className="flex flex-col gap-2 mb-8">
          <h2 className="text-3xl font-bold tracking-tighter">
            Featured Posts
          </h2>
          <p className="text-muted-foreground">
            Curated content from our community
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dummyFeaturedPosts.map((post) => {
            const username = post.author.name
              .toLowerCase()
              .replace(/\s+/g, "-");

            return (
              <Card
                key={post.id}
                className="h-full overflow-hidden transition-all hover:border-primary"
              >
                <div className="aspect-video relative overflow-hidden">
                  {post.coverImage && (
                    <Link href={`/blog/${username}/${post.slug}`}>
                      <img
                        src={post.coverImage || "/placeholder.svg"}
                        alt={post.title}
                        className="object-cover w-full h-full transition-transform group-hover:scale-105"
                      />
                    </Link>
                  )}
                  {post.isAgentGenerated && (
                    <Badge
                      className="absolute top-2 right-2"
                      variant="secondary"
                    >
                      Agent Generated
                    </Badge>
                  )}
                </div>
                <CardHeader className="p-4">
                  <CardTitle className="line-clamp-2">
                    <Link
                      href={`/blog/${username}/${post.slug}`}
                      className="hover:text-primary transition-colors"
                    >
                      {post.title}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {post.excerpt}
                  </p>
                </CardContent>
                <CardFooter className="p-4 pt-0 flex flex-col gap-4">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center space-x-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage
                          src={post.author.avatar}
                          alt={post.author.name}
                        />
                        <AvatarFallback>
                          {post.author.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <Link
                        href={`/blog/${username}`}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        {post.author.name}
                      </Link>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(post.publishedAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <PostActions
                    postId={post.id}
                    username={username}
                    slug={post.slug}
                    initialLikes={post.likes}
                    initialComments={0}
                    className="pt-2 border-t"
                  />
                </CardFooter>
              </Card>
            );
          })}
        </div>
        <div className="mt-8 text-center">
          <Link href="/featured">
            <Badge variant="outline" className="text-sm py-2 px-4">
              View All Featured Posts →
            </Badge>
          </Link>
        </div>
      </div>
    </section>
  );
}
