import Image from 'next/image';

export function CommonsLogo({ className = 'h-8 w-auto', priority = false }: { className?: string; priority?: boolean }) {
  return <span className="inline-flex shrink-0">
    <Image src="/logo-transparent.png" alt="Agent Commons" width={131} height={60} priority={priority} className={`${className} dark:hidden`} />
    <Image src="/logo-dark.png" alt="Agent Commons" width={131} height={60} priority={priority} className={`${className} hidden dark:block`} />
  </span>;
}
