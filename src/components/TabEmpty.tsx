import type { LucideIcon } from "lucide-react";
import { Button } from "./ui";

/**
 * Placeholder for a mobile bottom-nav tab whose content does not exist yet.
 *
 * The nav is rendered from the first started screen onward, because on a phone it is the only place
 * the app's shape is visible — there is no desktop panel group showing that a workspace, a set of
 * curves and a parameter sheet exist. But until an analysis lands, three of its five tabs had
 * nothing to switch to: the tap set `mobileTab`, the label tinted, the rule slid across, and the
 * screen did not change. A control that acknowledges a tap and then does nothing is
 * indistinguishable from a broken one, which is exactly how it was reported. Those tabs now land
 * here, so the tap has a visible result and the screen says what would fill it and how to get there.
 *
 * Deliberately not a spinner or a skeleton: nothing is loading. The content is absent because a step
 * has not been taken yet, and the honest thing is to name the step.
 */
export function TabEmpty({
  icon: Icon,
  title,
  detail,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg px-8 text-center">
      {/* Same icon the tab carries in the nav, so the placeholder reads as belonging to the tab
          that was just tapped rather than as a generic error state. */}
      <div className="grid h-12 w-12 place-items-center rounded-xl border border-line bg-panel text-faint">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-body font-medium text-fg">{title}</p>
        <p className="mx-auto mt-1 max-w-[34ch] text-mini leading-relaxed text-muted">{detail}</p>
      </div>
      {actionLabel && onAction && (
        <Button variant="outline" size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
