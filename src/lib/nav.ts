/**
 * Shape of a navigation tree, shared by the admin panel and the trainer
 * dashboard.
 *
 * Both surfaces render the same sidebar component; what differs is which items
 * they put in it and how badges and locks are resolved. Keeping the shape here
 * means the shell never needs to know which of the two it is drawing.
 */
export interface NavItem {
  href: string;
  labelAr: string;
  labelEn: string;
  /** lucide-react icon name, resolved at render time. */
  icon: string;
  /** Count shown as a badge; falsy hides it. */
  badge?: number;
  /**
   * Set when the item exists on higher plans only. A locked item is still
   * shown — hiding it removes the reason to upgrade — but it routes to the
   * billing page instead of the feature.
   */
  locked?: boolean;
}

export interface NavSection {
  labelAr: string;
  labelEn: string;
  items: NavItem[];
}
