import { isRichText, markdownToRichTextHtml, sanitizeRichTextHtml } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

export function RichTextRenderer({
  value,
  className,
}: {
  value?: string | null;
  className?: string;
}) {
  if (!value) return null;

  if (!isRichText(value)) {
    return (
      <div
        className={cn(
          "space-y-3 text-[15px] leading-7 text-slate-700 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.92em] [&_h2]:pt-2 [&_h2]:text-xl [&_h2]:font-black [&_h2]:leading-8 [&_h2]:text-slate-950 [&_h3]:pt-2 [&_h3]:text-lg [&_h3]:font-black [&_h3]:text-slate-950 [&_h4]:font-black [&_h4]:text-slate-950 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_strong]:font-black [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
          className
        )}
        dangerouslySetInnerHTML={{ __html: markdownToRichTextHtml(value) }}
      />
    );
  }

  return (
    <div
      className={cn(
        "space-y-3 text-[15px] leading-7 text-slate-700 [&_a]:font-bold [&_a]:text-sky-700 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-4 [&_blockquote]:text-slate-600 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.92em] [&_h2]:pt-2 [&_h2]:text-xl [&_h2]:font-black [&_h2]:leading-8 [&_h2]:text-slate-950 [&_h3]:pt-2 [&_h3]:text-lg [&_h3]:font-black [&_h3]:text-slate-950 [&_h4]:font-black [&_h4]:text-slate-950 [&_mark]:rounded [&_mark]:bg-yellow-200 [&_mark]:px-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_strong]:font-black [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
        className
      )}
      dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(value) }}
    />
  );
}
