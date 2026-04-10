import defaultMdxComponents from 'fumadocs-ui/mdx';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useMDXComponents(components: Record<string, any>): Record<string, any> {
  return {
    ...defaultMdxComponents,
    ...components,
  };
}
