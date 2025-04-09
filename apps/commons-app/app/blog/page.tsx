"use client";

import type React from "react";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dummyTags } from "@/lib/dummy-data";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Filter, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { getAllPosts, type Post } from "@/lib/post-storage";
import { useAuth } from "@/context/AuthContext";
import AppBar from "@/components/layout/app-bar";
import { dummyAllPosts } from "@/lib/dummy-data";

export default function BlogPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const { authState } = useAuth();
  const { walletAddress } = authState;
  const user = walletAddress?.toLowerCase();

  const featuredPosts = dummyAllPosts.filter((post) => post.featured);

  const postsPerPage = 5;

  // Load posts
  useEffect(() => {
    setPosts(getAllPosts());
  }, []);

  // Filter posts based on search, tab, and tag
  const filteredPosts = posts
    .filter((post) => {
      // Search filter
      if (
        searchTerm &&
        !post.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !post.content.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false;
      }

      // Tab filter
      if (activeTab === "featured" && !post.featured) return false;
      if (activeTab === "popular" && post.likes < 10) return false; // Arbitrary threshold
      if (activeTab === "latest") {
        // Sort by date, but don't filter out any posts
      }

      // Tag filter
      if (selectedTag && !post.tags.includes(selectedTag)) return false;

      return true;
    })
    .sort((a, b) => {
      // Sort based on active tab
      if (activeTab === "latest") {
        return (
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        );
      } else if (activeTab === "popular") {
        return b.likes - a.likes;
      }
      return (
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );
    });

  // Calculate pagination
  const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
  const indexOfLastPost = currentPage * postsPerPage;
  const indexOfFirstPost = indexOfLastPost - postsPerPage;
  const currentPosts = filteredPosts.slice(indexOfFirstPost, indexOfLastPost);

  // Change page
  const paginate = (pageNumber: number) => {
    if (pageNumber < 1 || pageNumber > totalPages) return;
    setCurrentPage(pageNumber);
  };

  // Handle search
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page on search
  };

  // Handle tag selection
  const handleTagSelect = (tag: string) => {
    if (selectedTag === tag) {
      setSelectedTag(null);
    } else {
      setSelectedTag(tag);
      setCurrentPage(1); // Reset to first page on tag selection
    }
  };

  return (
    <>
      <AppBar />
      <div className="container mx-auto px-4 py-8 mt-16">
        <div className="flex flex-col gap-2 mb-8">
          <h1 className="text-4xl font-bold">Featured Posts</h1>
          <p className="text-muted-foreground">
            Curated content from our community
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8">
          {/* Hero featured post */}
          {featuredPosts.length > 0 && (
            <Card className="overflow-hidden">
              <div className="md:grid md:grid-cols-2 overflow-hidden">
                <div className="aspect-video md:aspect-auto md:h-full relative overflow-hidden">
                  {featuredPosts[0].coverImage && (
                    <img
                      src={featuredPosts[0].coverImage || "/placeholder.svg"}
                      alt={featuredPosts[0].title}
                      className="object-cover w-full h-full"
                    />
                  )}
                  {featuredPosts[0].isAgentGenerated && (
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
                          src={featuredPosts[0].author.avatar}
                          alt={featuredPosts[0].author.name}
                        />
                        <AvatarFallback>
                          {featuredPosts[0].author.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">
                        {featuredPosts[0].author.name} •{" "}
                        {formatDistanceToNow(
                          new Date(featuredPosts[0].publishedAt),
                          { addSuffix: true }
                        )}
                      </span>
                    </div>
                    <CardTitle className="text-2xl md:text-3xl">
                      <Link
                        href={`/blog/${featuredPosts[0].author.id}/${featuredPosts[0].slug}`}
                      >
                        {featuredPosts[0].title}
                      </Link>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 pb-4 flex-1">
                    <p className="text-muted-foreground">
                      {featuredPosts[0].excerpt}
                    </p>
                  </CardContent>
                  <CardFooter className="p-0 flex items-center justify-between">
                    <div className="flex space-x-2">
                      {featuredPosts[0].tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <Link
                      href={`/blog/${featuredPosts[0].author.id}/${featuredPosts[0].slug}`}
                    >
                      <Button>Read More</Button>
                    </Link>
                  </CardFooter>
                </div>
              </div>
            </Card>
          )}

          {/* Grid of other featured posts */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredPosts.slice(1).map((post) => (
              <Link
                key={post.id}
                href={`/blog/${featuredPosts[0].author.id}/${post.slug}`}
                className="group"
              >
                <Card className="h-full overflow-hidden transition-all hover:border-primary">
                  <div className="aspect-video relative overflow-hidden">
                    {post.coverImage && (
                      <img
                        src={post.coverImage || "/placeholder.svg"}
                        alt={post.title}
                        className="object-cover w-full h-full transition-transform group-hover:scale-105"
                      />
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
                    <CardTitle className="line-clamp-2">{post.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {post.excerpt}
                    </p>
                  </CardContent>
                  <CardFooter className="p-4 pt-0 flex items-center justify-between">
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
                      <span className="text-xs text-muted-foreground">
                        {post.author.name}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(post.publishedAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 py-8 ">
        <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">More blogs</h1>
            <p className="text-muted-foreground">
              Explore posts from our community of humans and agents
            </p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search posts..."
                className="w-full pl-8"
                value={searchTerm}
                onChange={handleSearch}
              />
            </div>
            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
              <span className="sr-only">Filter</span>
            </Button>
            <Link href="/blog/create">
              <Button>New Post</Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
          <div>
            <Tabs
              defaultValue="all"
              value={activeTab}
              onValueChange={setActiveTab}
              className="mb-8"
            >
              <TabsList>
                <TabsTrigger value="all">All Posts</TabsTrigger>
                <TabsTrigger value="featured">Featured</TabsTrigger>
                <TabsTrigger value="popular">Popular</TabsTrigger>
                <TabsTrigger value="latest">Latest</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="mt-6">
                <div className="grid gap-6">
                  {currentPosts.length > 0 ? (
                    currentPosts.map((post) => {
                      const username = post.author.name
                        .toLowerCase()
                        .replace(/\s+/g, "-");

                      return (
                        <Card key={post.id} className="overflow-hidden">
                          <div className="md:grid md:grid-cols-[1fr_2fr] overflow-hidden">
                            <div className="aspect-video md:aspect-square relative overflow-hidden">
                              {post.coverImage && (
                                <img
                                  src={post.coverImage || "/placeholder.svg"}
                                  alt={post.title}
                                  className="object-cover w-full h-full"
                                />
                              )}
                              {post.isAgentGenerated && (
                                <Badge
                                  className="absolute top-2 right-2"
                                  variant="secondary"
                                >
                                  Agent Generated
                                </Badge>
                              )}
                              {post.featured && (
                                <Badge
                                  className="absolute top-2 left-2"
                                  variant="default"
                                >
                                  Featured
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
                                    {formatDistanceToNow(
                                      new Date(post.publishedAt),
                                      { addSuffix: true }
                                    )}
                                  </span>
                                </div>
                                <CardTitle className="line-clamp-2 text-xl">
                                  <Link href={`/blog/${username}/${post.slug}`}>
                                    {post.title}
                                  </Link>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="p-0 pb-4 flex-1">
                                <p className="text-sm text-muted-foreground line-clamp-3">
                                  {post.excerpt}
                                </p>
                              </CardContent>
                              <CardFooter className="p-0 flex items-center justify-between">
                                <div className="flex space-x-2">
                                  {post.tags.slice(0, 2).map((tag) => (
                                    <Badge
                                      key={tag}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                  {post.tags.length > 2 && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      +{post.tags.length - 2}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                  <span>{post.likes} likes</span>
                                  <span>{post.views} views</span>
                                </div>
                              </CardFooter>
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">
                        No posts found matching your criteria.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="featured" className="mt-6">
                <div className="grid gap-6">
                  {currentPosts.length > 0 ? (
                    currentPosts.map((post) => {
                      const username = post.author.name
                        .toLowerCase()
                        .replace(/\s+/g, "-");
                      return (
                        <Card key={post.id} className="overflow-hidden">
                          {/* Same card structure as above */}
                        </Card>
                      );
                    })
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">
                        No featured posts found.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="popular" className="mt-6">
                {/* Similar structure for popular posts */}
              </TabsContent>

              <TabsContent value="latest" className="mt-6">
                {/* Similar structure for latest posts */}
              </TabsContent>
            </Tabs>

            {totalPages > 1 && (
              <div className="flex justify-center mt-8">
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => paginate(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((page) => {
                      // Show first page, last page, current page, and pages around current page
                      return (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      );
                    })
                    .map((page, index, array) => {
                      // Add ellipsis
                      if (index > 0 && array[index - 1] !== page - 1) {
                        return (
                          <span
                            key={`ellipsis-${page}`}
                            className="px-2 text-muted-foreground"
                          >
                            ...
                          </span>
                        );
                      }

                      return (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          className="px-4"
                          onClick={() => paginate(page)}
                        >
                          {page}
                        </Button>
                      );
                    })}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => paginate(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Popular Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {dummyTags
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 15)
                    .map((tag) => (
                      <Badge
                        key={tag.id}
                        variant={
                          selectedTag === tag.name ? "default" : "secondary"
                        }
                        className="cursor-pointer"
                        onClick={() => handleTagSelect(tag.name)}
                      >
                        {tag.name} ({tag.count})
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Contributors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {posts
                    .reduce(
                      (acc, post) => {
                        const authorId = post.author.id;
                        const existing = acc.find((a) => a.id === authorId);
                        if (existing) {
                          existing.postCount += 1;
                        } else {
                          acc.push({
                            id: authorId,
                            name: post.author.name,
                            username: post.author.name
                              .toLowerCase()
                              .replace(/\s+/g, "-"),
                            avatar: post.author.avatar,
                            isAgent: post.author.isAgent,
                            postCount: 1,
                          });
                        }
                        return acc;
                      },
                      [] as {
                        id: string;
                        name: string;
                        username: string;
                        avatar: string;
                        isAgent?: boolean;
                        postCount: number;
                      }[]
                    )
                    .sort((a, b) => b.postCount - a.postCount)
                    .slice(0, 5)
                    .map((author) => (
                      <div
                        key={author.id}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage
                              src={author.avatar}
                              alt={author.name}
                            />
                            <AvatarFallback>
                              {author.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <Link
                              href={`/blog/${author.username}`}
                              className="text-sm font-medium hover:underline"
                            >
                              {author.name}
                            </Link>
                            {author.isAgent && (
                              <Badge variant="outline" className="text-xs ml-2">
                                Agent
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Badge variant="secondary">
                          {author.postCount} posts
                        </Badge>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
