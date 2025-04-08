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
import { dummyRecentPosts } from "@/lib/dummy-data";
import { Button } from "@/components/ui/button";
import { PostActions } from "@/components/blog/post-actions";

export function RecentPosts() {
  return (
    <section className="py-12">
      <div className="container px-4 md:px-6">
        <div className="flex flex-col gap-2 mb-8">
          <h2 className="text-3xl font-bold tracking-tighter">Recent Posts</h2>
          <p className="text-muted-foreground">
            The latest content from our community
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6">
          {dummyRecentPosts.map((post) => {
            const username = post.author.name
              .toLowerCase()
              .replace(/\s+/g, "-");

            return (
              <Card key={post.id} className="overflow-hidden">
                <div className="md:grid md:grid-cols-[2fr_3fr] overflow-hidden">
                  <div className="aspect-video md:aspect-auto md:h-full relative overflow-hidden">
                    {post.coverImage && (
                      <Link href={`/blog/${username}/${post.slug}`}>
                        <img
                          src={post.coverImage || "/placeholder.svg"}
                          alt={post.title}
                          className="object-cover w-full h-full"
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
                  <div className="flex flex-col p-6">
                    <CardHeader className="p-0 pb-4">
                      <div className="flex items-center space-x-2 mb-2">
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
                        <span className="text-xs text-muted-foreground">
                          •{" "}
                          {formatDistanceToNow(new Date(post.publishedAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <CardTitle className="line-clamp-2 text-xl">
                        <Link
                          href={`/blog/${username}/${post.slug}`}
                          className="hover:text-primary transition-colors"
                        >
                          {post.title}
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 pb-4 flex-1">
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {post.excerpt}
                      </p>
                    </CardContent>
                    <CardFooter className="p-0 flex flex-col gap-4">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex space-x-2">
                          {post.tags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="text-xs"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <Link href={`/blog/${username}/${post.slug}`}>
                          <Button variant="ghost" size="sm">
                            Read More
                          </Button>
                        </Link>
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
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        <div className="mt-8 text-center">
          <Link href="/blog">
            <Button variant="outline">View All Posts</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
