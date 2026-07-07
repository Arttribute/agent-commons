import RandomAvatar from "@/components/account/random-avatar";
import { cn } from "@/lib/utils";

export type AgentAvatarProps = {
  /** Agent display name — used for the generated fallback avatar and alt text. */
  name?: string | null;
  /** Profile image URL. When present it is shown instead of the generated avatar. */
  src?: string | null;
  /** Rendered width/height in pixels. */
  size?: number;
  className?: string;
  /** Whether to render a subtle border around the avatar. */
  bordered?: boolean;
};

/**
 * Canonical agent avatar. Renders the agent's uploaded profile image when one
 * exists, falling back to a deterministic generated avatar otherwise. Use this
 * everywhere an agent is represented so real profile images show consistently.
 */
export function AgentAvatar({
  name,
  src,
  size = 40,
  className,
  bordered = true,
}: AgentAvatarProps) {
  const dimensions = { width: size, height: size };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name || "agent"}
        style={dimensions}
        className={cn(
          "shrink-0 rounded-full object-cover",
          bordered && "border border-border",
          className,
        )}
      />
    );
  }

  return (
    <div
      style={dimensions}
      className={cn(
        "shrink-0 overflow-hidden rounded-full",
        bordered && "border border-border",
        className,
      )}
    >
      <RandomAvatar size={size} username={name || "agent"} />
    </div>
  );
}

export default AgentAvatar;
