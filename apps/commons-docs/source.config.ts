import { defineDocs, defineConfig } from 'fumadocs-mdx/config';

export const { docs, meta } = defineDocs({
  dir: 'content/docs',
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      // Both themes are emitted; Fumadocs swaps them with --shiki-light /
      // --shiki-dark so code follows the reader's theme.
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
  },
});
